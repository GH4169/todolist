import { getAuthenticatedClients } from '../_shared/auth.ts';
import { decryptApiKey } from '../_shared/crypto.ts';
import { getOpenAiEndpoint } from '../_shared/openai.ts';
import {
  errorResponse,
  HttpError,
  jsonResponse,
  optionsResponse,
  readJsonBody,
} from '../_shared/http.ts';
import {
  buildReviewContext,
  dateKeyInTimezone,
  validateReviewRange,
  validateTimezone,
} from '../_shared/review-context.ts';
import {
  AI_REVIEW_JSON_SCHEMA,
  validateReviewResult,
} from '../_shared/review-result.ts';

const PROVIDER = 'openai';
const PROMPT_VERSION = 'review-v1';
const DEFAULT_MODEL = 'gpt-5.6';

const REVIEW_INSTRUCTIONS = `你是 TodoList 的工作复盘助手。请仅根据输入的 ReviewContextV1 生成中文复盘。

成功标准：
- 区分已经发生的工作事实、当前未收口事项和未来计划；
- 总结关键产出、阻塞与计划偏差，并给出下一步可执行建议；
- 每条事实判断只引用输入中存在的 evidence_ref；
- 没有直接证据的建议可以不带引用，但必须使用克制措辞；
- 没有记录不等于没有工作，不评价绩效，不估算工时；
- 不提出删除、完成或自动修改任务的操作；
- 严格返回指定 JSON Schema，不添加 Markdown 或额外字段。`;

function getOutputText(response: Record<string, unknown>) {
  const output = Array.isArray(response.output) ? response.output : [];
  for (const item of output) {
    if (!item || typeof item !== 'object') continue;
    const content = Array.isArray((item as Record<string, unknown>).content)
      ? (item as Record<string, unknown>).content as unknown[]
      : [];
    for (const part of content) {
      if (part && typeof part === 'object' && typeof (part as Record<string, unknown>).text === 'string') {
        return (part as Record<string, unknown>).text as string;
      }
    }
  }
  return '';
}

async function requestReview(apiKey: string, baseUrl: unknown, model: string, context: unknown) {
  let response: Response;
  try {
    response = await fetch(getOpenAiEndpoint(baseUrl, 'responses'), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        instructions: REVIEW_INSTRUCTIONS,
        input: JSON.stringify(context),
        max_output_tokens: 3500,
        text: {
          format: {
            type: 'json_schema',
            name: 'ai_work_review',
            strict: true,
            schema: AI_REVIEW_JSON_SCHEMA,
          },
        },
      }),
      signal: AbortSignal.timeout(55000),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new HttpError(504, 'provider_timeout', 'AI 分析超时，请稍后重试');
    }
    throw new HttpError(503, 'provider_unavailable', '暂时无法连接 AI 模型服务，请稍后重试');
  }

  const rawText = await response.text();
  let payload: Record<string, unknown> = {};
  try {
    payload = rawText ? JSON.parse(rawText) : {};
  } catch {
    throw new HttpError(502, 'invalid_provider_response', 'OpenAI 返回了无法解析的响应');
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new HttpError(400, 'invalid_api_key', 'API Key 已失效，请重新配置');
    }
    if (response.status === 429) {
      throw new HttpError(429, 'provider_rate_limited', '模型请求受限或额度不足，请检查 API 账户');
    }
    if (response.status === 404) {
      throw new HttpError(503, 'model_unavailable', '当前 AI 模型不可用，请联系部署者更新模型配置');
    }
    throw new HttpError(502, 'provider_error', 'AI 模型服务暂时无法完成分析');
  }

  const outputText = getOutputText(payload);
  if (!outputText) throw new HttpError(502, 'invalid_model_output', '模型没有返回分析正文');
  let result: unknown;
  try {
    result = JSON.parse(outputText);
  } catch {
    throw new HttpError(502, 'invalid_model_output', '模型返回的分析格式无效');
  }
  return {
    result,
    usage: payload.usage && typeof payload.usage === 'object' ? payload.usage : null,
    model: typeof payload.model === 'string' ? payload.model : model,
  };
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return optionsResponse(request);
  let runId: string | null = null;
  let serviceClient: Awaited<ReturnType<typeof getAuthenticatedClients>>['serviceClient'] | null = null;
  try {
    if (request.method !== 'POST') throw new HttpError(405, 'method_not_allowed', '不支持的请求方法');
    const clients = await getAuthenticatedClients(request);
    serviceClient = clients.serviceClient;
    const body = await readJsonBody(request) as Record<string, unknown>;
    const { rangeStart, rangeEnd } = validateReviewRange(body.range_start, body.range_end);
    const timezone = validateTimezone(body.timezone);
    if (rangeEnd > dateKeyInTimezone(new Date().toISOString(), timezone)) {
      throw new HttpError(400, 'invalid_date_range', '分析范围不能包含未来日期');
    }
    const locale = typeof body.locale === 'string' && body.locale.length <= 30 ? body.locale : 'zh-CN';

    const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
    const twoMinutesAgo = new Date(Date.now() - 120000).toISOString();
    const staleCompletedAt = new Date().toISOString();
    const { error: staleError } = await serviceClient.from('ai_review_runs').update({
      status: 'failed',
      error_code: 'stale_run',
      completed_at: staleCompletedAt,
    }).eq('user_id', clients.user.id).eq('status', 'pending').lt('created_at', twoMinutesAgo);
    if (staleError) throw new HttpError(500, 'rate_limit_check_failed', '无法检查分析请求状态');

    const [{ count, error: countError }, { count: activeCount, error: activeError }] = await Promise.all([
      serviceClient.from('ai_review_runs').select('id', { count: 'exact', head: true })
        .eq('user_id', clients.user.id).gte('created_at', oneHourAgo),
      serviceClient.from('ai_review_runs').select('id', { count: 'exact', head: true })
        .eq('user_id', clients.user.id).eq('status', 'pending'),
    ]);
    if (countError || activeError) throw new HttpError(500, 'rate_limit_check_failed', '无法检查分析请求状态');
    if ((activeCount || 0) > 0) throw new HttpError(409, 'analysis_in_progress', '已有一项 AI 分析正在进行');
    if ((count || 0) >= 10) throw new HttpError(429, 'analysis_rate_limited', '每小时最多生成 10 次 AI 分析');

    const { data: credential, error: credentialError } = await serviceClient
      .from('ai_provider_credentials')
      .select('encrypted_secret,iv,key_version,base_url,model')
      .eq('user_id', clients.user.id)
      .eq('provider', PROVIDER)
      .maybeSingle();
    if (credentialError) throw new HttpError(500, 'credential_load_failed', '无法读取 AI 服务设置');
    const serverApiKey = Deno.env.get('OPENAI_API_KEY')?.trim() || '';
    if (!credential && !serverApiKey) throw new HttpError(412, 'api_key_required', '请先在设置中配置 AI 服务 API Key');
    if (credential && credential.key_version !== 1) {
      throw new HttpError(503, 'credential_version_unsupported', '已保存的 API Key 需要重新配置');
    }

    const { context, evidenceRefs } = await buildReviewContext(clients.userClient, {
      userId: clients.user.id,
      rangeStart,
      rangeEnd,
      timezone,
      locale,
    });
    const serializedContext = JSON.stringify(context);
    const contextHash = await sha256(serializedContext);
    const { data: run, error: runError } = await serviceClient.from('ai_review_runs').insert({
      user_id: clients.user.id,
      range_start: rangeStart,
      range_end: rangeEnd,
      status: 'pending',
      provider: PROVIDER,
      prompt_version: PROMPT_VERSION,
      context_hash: contextHash,
      context_stats: context.summary_counts,
    }).select('id').single();
    if (runError?.code === '23505') {
      throw new HttpError(409, 'analysis_in_progress', '已有一项 AI 分析正在进行');
    }
    if (runError || !run) throw new HttpError(500, 'analysis_create_failed', '无法创建 AI 分析记录');
    runId = run.id;

    const apiKey = credential
      ? await decryptApiKey(credential.encrypted_secret, credential.iv, clients.user.id)
      : serverApiKey;
    const configuredBaseUrl = credential?.base_url || Deno.env.get('OPENAI_BASE_URL') || undefined;
    const configuredModel = credential?.model || Deno.env.get('OPENAI_MODEL')?.trim() || DEFAULT_MODEL;
    const completion = await requestReview(apiKey, configuredBaseUrl, configuredModel, context);
    const result = validateReviewResult(completion.result, evidenceRefs);
    const completedAt = new Date().toISOString();
    const { error: updateError } = await serviceClient.from('ai_review_runs').update({
      status: 'succeeded',
      result,
      usage: completion.usage,
      model: completion.model,
      completed_at: completedAt,
      error_code: null,
    }).eq('id', runId).eq('user_id', clients.user.id);
    if (updateError) throw new HttpError(500, 'analysis_save_failed', 'AI 分析已生成，但无法保存结果');
    return jsonResponse(request, {
      id: runId,
      range_start: rangeStart,
      range_end: rangeEnd,
      status: 'succeeded',
      provider: PROVIDER,
      model: completion.model,
      result,
      context_stats: context.summary_counts,
      completed_at: completedAt,
    }, 201);
  } catch (error) {
    if (runId && serviceClient) {
      const errorCode = error instanceof HttpError ? error.code : 'internal_error';
      await serviceClient.from('ai_review_runs').update({
        status: 'failed',
        error_code: errorCode,
        completed_at: new Date().toISOString(),
      }).eq('id', runId);
    }
    return errorResponse(request, error);
  }
});
