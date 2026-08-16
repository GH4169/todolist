import { getAuthenticatedClients } from '../_shared/auth.ts';
import { decryptApiKey, encryptApiKey } from '../_shared/crypto.ts';
import { getOpenAiEndpoint, normalizeOpenAiBaseUrl } from '../_shared/openai.ts';
import {
  errorResponse,
  HttpError,
  jsonResponse,
  optionsResponse,
  readJsonBody,
} from '../_shared/http.ts';

const PROVIDER = 'openai';
const DEFAULT_MODEL = 'gpt-5.6';

function normalizeApiKey(value: unknown) {
  if (typeof value !== 'string') throw new HttpError(400, 'invalid_api_key', '请输入 API Key');
  const apiKey = value.trim();
  if (apiKey.length < 20 || apiKey.length > 512 || /\s/.test(apiKey)) {
    throw new HttpError(400, 'invalid_api_key', 'API Key 格式无效');
  }
  return apiKey;
}

function normalizeModel(value: unknown) {
  if (typeof value !== 'string') throw new HttpError(400, 'invalid_model', '请输入模型名称');
  const model = value.trim();
  if (!model || model.length > 120 || /\s/.test(model)) {
    throw new HttpError(400, 'invalid_model', '模型名称格式无效');
  }
  return model;
}

async function verifyOpenAiKey(apiKey: string, baseUrl: string) {
  let response: Response;
  try {
    response = await fetch(getOpenAiEndpoint(baseUrl, 'models'), {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new HttpError(503, 'provider_unavailable', '暂时无法连接 AI 模型服务，请稍后重试');
  }
  await response.body?.cancel();
  if (response.ok) return;
  if (response.status === 401 || response.status === 403) {
    throw new HttpError(400, 'invalid_api_key', 'API Key 验证失败');
  }
  if (response.status === 429) {
    throw new HttpError(429, 'provider_rate_limited', 'AI 模型服务暂时限制了请求，请稍后重试');
  }
  throw new HttpError(503, 'provider_unavailable', 'AI 模型服务暂时不可用，请稍后重试');
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return optionsResponse(request);
  try {
    const { user, serviceClient } = await getAuthenticatedClients(request);

    if (request.method === 'GET') {
      const defaultBaseUrl = normalizeOpenAiBaseUrl(Deno.env.get('OPENAI_BASE_URL'), 503);
      const defaultModel = Deno.env.get('OPENAI_MODEL')?.trim() || DEFAULT_MODEL;
      const { data, error } = await serviceClient
        .from('ai_provider_credentials')
        .select('key_hint,last_verified_at,updated_at,base_url,model')
        .eq('user_id', user.id)
        .eq('provider', PROVIDER)
        .maybeSingle();
      if (error) throw new HttpError(500, 'credential_load_failed', '无法读取 AI 服务设置');
      return jsonResponse(request, {
        configured: Boolean(data),
        provider: PROVIDER,
        key_hint: data?.key_hint || null,
        base_url: data?.base_url || defaultBaseUrl,
        model: data?.model || defaultModel,
        last_verified_at: data?.last_verified_at || null,
        updated_at: data?.updated_at || null,
      });
    }

    if (request.method === 'DELETE') {
      const { error } = await serviceClient
        .from('ai_provider_credentials')
        .delete()
        .eq('user_id', user.id)
        .eq('provider', PROVIDER);
      if (error) throw new HttpError(500, 'credential_delete_failed', '无法删除 API Key');
      return jsonResponse(request, { configured: false, provider: PROVIDER });
    }

    if (request.method !== 'POST') {
      throw new HttpError(405, 'method_not_allowed', '不支持的请求方法');
    }

    const body = await readJsonBody(request) as Record<string, unknown>;
    const baseUrl = normalizeOpenAiBaseUrl(body.base_url || Deno.env.get('OPENAI_BASE_URL'));
    const model = normalizeModel(body.model || Deno.env.get('OPENAI_MODEL') || DEFAULT_MODEL);
    const existingResult = await serviceClient
      .from('ai_provider_credentials')
      .select('encrypted_secret,iv,key_version,base_url')
      .eq('user_id', user.id)
      .eq('provider', PROVIDER)
      .maybeSingle();
    if (existingResult.error) throw new HttpError(500, 'credential_load_failed', '无法读取现有 AI 服务设置');
    let apiKey = typeof body.api_key === 'string' && body.api_key.trim()
      ? normalizeApiKey(body.api_key)
      : null;
    if (!apiKey && existingResult.data) {
      const existingBaseUrl = normalizeOpenAiBaseUrl(existingResult.data.base_url, 503);
      if (existingBaseUrl !== baseUrl) {
        throw new HttpError(400, 'api_key_required_for_provider_change', '修改 Base URL 时必须重新输入 API Key');
      }
      if (existingResult.data.key_version !== 1) {
        throw new HttpError(503, 'credential_version_unsupported', '已保存的 API Key 需要重新配置');
      }
      apiKey = await decryptApiKey(existingResult.data.encrypted_secret, existingResult.data.iv, user.id);
    }
    if (!apiKey) throw new HttpError(412, 'api_key_required', '首次配置时请输入 API Key');
    await verifyOpenAiKey(apiKey, baseUrl);
    const encrypted = await encryptApiKey(apiKey, user.id);
    const now = new Date().toISOString();
    const { error } = await serviceClient.from('ai_provider_credentials').upsert({
      user_id: user.id,
      provider: PROVIDER,
      base_url: baseUrl,
      model,
      encrypted_secret: encrypted.encryptedSecret,
      iv: encrypted.iv,
      key_version: encrypted.keyVersion,
      key_hint: apiKey.slice(-4),
      last_verified_at: now,
    }, { onConflict: 'user_id,provider' });
    if (error) throw new HttpError(500, 'credential_save_failed', '无法保存 API Key');
    return jsonResponse(request, {
      configured: true,
      provider: PROVIDER,
      key_hint: apiKey.slice(-4),
      base_url: baseUrl,
      model,
      last_verified_at: now,
    });
  } catch (error) {
    return errorResponse(request, error);
  }
});
