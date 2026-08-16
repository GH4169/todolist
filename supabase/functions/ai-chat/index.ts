import { getAuthenticatedClients } from '../_shared/auth.ts';
import { buildCompanionContext, planCompanionRetrieval, streamCompanionAnswer, validateCompanionResult } from '../_shared/companion.ts';
import { decryptApiKey } from '../_shared/crypto.ts';
import { errorResponse, getCorsHeaders, HttpError, optionsResponse, readJsonBody } from '../_shared/http.ts';

const PROVIDER = 'openai';
const DEFAULT_MODEL = 'gpt-5.6';

function trimHistory(rows: Array<Record<string, unknown>>) {
  const selected: Array<{ role: string; content: string }> = [];
  let characters = 0;
  for (const row of [...rows].reverse()) {
    const content = typeof row.content === 'string' ? row.content : '';
    if (!content || !['user', 'assistant'].includes(String(row.role))) continue;
    const remaining = 24000 - characters;
    if (remaining <= 0) break;
    selected.push({ role: String(row.role), content: content.slice(-remaining) });
    characters += Math.min(content.length, remaining);
    if (selected.length >= 24) break;
  }
  return selected.reverse();
}

function sse(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function publicError(error: unknown) {
  if (error instanceof HttpError) return { code: error.code, message: error.message };
  return { code: 'internal_error', message: '回答暂时中断，请稍后重试' };
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return optionsResponse(request);
  try {
    if (request.method !== 'POST') throw new HttpError(405, 'method_not_allowed', '不支持的请求方法');
    const clients = await getAuthenticatedClients(request);
    const body = await readJsonBody(request) as Record<string, unknown>;
    const conversationId = typeof body.conversation_id === 'string' ? body.conversation_id : '';
    const suppliedQuestion = typeof body.message === 'string' ? body.message.trim() : '';
    const existingUserMessageId = typeof body.user_message_id === 'string' ? body.user_message_id : '';
    const revisionOfId = typeof body.revision_of_id === 'string' ? body.revision_of_id : null;
    const excludedRefs = Array.isArray(body.exclude_refs)
      ? body.exclude_refs.filter(value => typeof value === 'string').slice(0, 80) as string[] : [];
    if (!conversationId) throw new HttpError(400, 'conversation_required', '请选择一个对话');
    if (!existingUserMessageId && (!suppliedQuestion || suppliedQuestion.length > 8000)) {
      throw new HttpError(400, 'invalid_message', '问题需要在 1 到 8,000 个字符之间');
    }

    const { data: conversation, error: conversationError } = await clients.serviceClient
      .from('ai_conversations').select('id,title').eq('id', conversationId).eq('user_id', clients.user.id).maybeSingle();
    if (conversationError) throw new HttpError(500, 'conversation_load_failed', '无法读取对话');
    if (!conversation) throw new HttpError(404, 'conversation_not_found', '对话不存在或已删除');

    const staleBefore = new Date(Date.now() - 120000).toISOString();
    await clients.serviceClient.from('ai_chat_messages').update({
      status: 'failed', error_code: 'stale_stream', completed_at: new Date().toISOString(),
    }).eq('user_id', clients.user.id).eq('role', 'assistant')
      .in('status', ['searching', 'streaming']).lt('created_at', staleBefore);

    const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
    const [{ count: recentCount, error: countError }, { count: activeCount, error: activeError }] = await Promise.all([
      clients.serviceClient.from('ai_chat_messages').select('id', { count: 'exact', head: true })
        .eq('user_id', clients.user.id).eq('role', 'assistant').gte('created_at', oneHourAgo),
      clients.serviceClient.from('ai_chat_messages').select('id', { count: 'exact', head: true })
        .eq('user_id', clients.user.id).eq('role', 'assistant').in('status', ['searching', 'streaming']),
    ]);
    if (countError || activeError) throw new HttpError(500, 'rate_limit_check_failed', '无法检查回答请求状态');
    if ((activeCount || 0) > 0) throw new HttpError(409, 'answer_in_progress', '已有一条回答正在生成');
    if ((recentCount || 0) >= 20) throw new HttpError(429, 'chat_rate_limited', '每小时最多提问 20 次');

    const { data: credential, error: credentialError } = await clients.serviceClient
      .from('ai_provider_credentials').select('encrypted_secret,iv,key_version,base_url,model')
      .eq('user_id', clients.user.id).eq('provider', PROVIDER).maybeSingle();
    if (credentialError) throw new HttpError(500, 'credential_load_failed', '无法读取 AI 服务设置');
    const serverApiKey = Deno.env.get('OPENAI_API_KEY')?.trim() || '';
    if (!credential && !serverApiKey) throw new HttpError(412, 'api_key_required', '请先在设置中配置 AI 服务 API Key');
    if (credential && credential.key_version !== 1) throw new HttpError(503, 'credential_version_unsupported', '已保存的 API Key 需要重新配置');

    let userMessage: Record<string, unknown>;
    if (existingUserMessageId) {
      const { data, error } = await clients.serviceClient.from('ai_chat_messages')
        .select('id,content,created_at').eq('id', existingUserMessageId).eq('conversation_id', conversationId)
        .eq('user_id', clients.user.id).eq('role', 'user').maybeSingle();
      if (error || !data) throw new HttpError(404, 'user_message_not_found', '原问题不存在，无法重新回答');
      userMessage = data;
    } else {
      const { data, error } = await clients.serviceClient.from('ai_chat_messages').insert({
        conversation_id: conversationId, user_id: clients.user.id, role: 'user', content: suppliedQuestion, status: 'completed',
      }).select('id,content,created_at').single();
      if (error || !data) throw new HttpError(500, 'message_create_failed', '无法保存问题');
      userMessage = data;
      if (conversation.title === '新对话') {
        await clients.serviceClient.from('ai_conversations').update({
          title: suppliedQuestion.replace(/\s+/g, ' ').slice(0, 36), last_active_at: new Date().toISOString(),
        }).eq('id', conversationId).eq('user_id', clients.user.id);
      }
    }
    const question = String(userMessage.content || '').trim();
    if (revisionOfId) {
      const { data: revision, error: revisionError } = await clients.serviceClient.from('ai_chat_messages')
        .select('id').eq('id', revisionOfId).eq('conversation_id', conversationId)
        .eq('user_id', clients.user.id).eq('role', 'assistant').maybeSingle();
      if (revisionError || !revision) throw new HttpError(400, 'invalid_revision', '修订目标不属于当前对话');
    }

    const { data: historyRows, error: historyError } = await clients.serviceClient
      .from('ai_chat_messages').select('role,content,created_at').eq('conversation_id', conversationId)
      .eq('user_id', clients.user.id).eq('status', 'completed').neq('id', userMessage.id)
      .order('created_at', { ascending: false }).limit(24);
    if (historyError) throw new HttpError(500, 'history_load_failed', '无法读取近期对话');
    const history = trimHistory(historyRows || []);

    let revisionNumber = 1;
    if (revisionOfId) {
      const { data: revisions } = await clients.serviceClient.from('ai_chat_messages').select('revision_number')
        .eq('user_id', clients.user.id).eq('conversation_id', conversationId)
        .or(`id.eq.${revisionOfId},revision_of_id.eq.${revisionOfId}`)
        .order('revision_number', { ascending: false }).limit(1);
      revisionNumber = Math.min(100, Number(revisions?.[0]?.revision_number || 0) + 1);
    }
    const { data: assistantMessage, error: assistantError } = await clients.serviceClient
      .from('ai_chat_messages').insert({
        conversation_id: conversationId,
        user_id: clients.user.id,
        role: 'assistant',
        content: '',
        status: 'searching',
        reply_to_id: userMessage.id,
        revision_of_id: revisionOfId,
        revision_number: revisionNumber,
      }).select('id,created_at').single();
    if (assistantError?.code === '23505') throw new HttpError(409, 'answer_in_progress', '已有一条回答正在生成');
    if (assistantError || !assistantMessage) throw new HttpError(500, 'answer_create_failed', '无法创建回答记录');

    const apiKey = credential
      ? await decryptApiKey(credential.encrypted_secret, credential.iv, clients.user.id)
      : serverApiKey;
    const baseUrl = credential?.base_url || Deno.env.get('OPENAI_BASE_URL') || undefined;
    const model = credential?.model || Deno.env.get('OPENAI_MODEL')?.trim() || DEFAULT_MODEL;
    const timezone = typeof body.timezone === 'string' && body.timezone.length <= 80 ? body.timezone : 'Asia/Shanghai';
    const locale = typeof body.locale === 'string' && body.locale.length <= 30 ? body.locale : 'zh-CN';
    const encoder = new TextEncoder();
    const streamAbort = new AbortController();
    let streamedAnswer = '';

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const send = (event: string, data: unknown) => controller.enqueue(encoder.encode(sse(event, data)));
        void (async () => {
          try {
            send('status', { phase: 'searching', message_id: assistantMessage.id, message: '正在查找相关记录' });
            const plannerSignal = AbortSignal.any([request.signal, streamAbort.signal, AbortSignal.timeout(25000)]);
            const plan = await planCompanionRetrieval({ apiKey, baseUrl, model, question, history, signal: plannerSignal });
            const context = await buildCompanionContext(clients.serviceClient, {
              userId: clients.user.id, plan, excludedRefs, timezone, locale,
            });
            send('context', {
              sources: context.sources.map(source => ({
                ref: source.ref, type: source.type, id: source.id, occurred_on: source.occurred_on,
                title: source.title, excerpt: source.content.slice(0, 240), metadata: source.metadata, excluded: false,
              })),
              limitations: context.limitations,
            });
            await clients.serviceClient.from('ai_chat_messages').update({ status: 'streaming' })
              .eq('id', assistantMessage.id).eq('user_id', clients.user.id);
            send('status', { phase: 'answering', message_id: assistantMessage.id, message: '正在回答' });

            const answerSignal = AbortSignal.any([request.signal, streamAbort.signal, AbortSignal.timeout(90000)]);
            const completion = await streamCompanionAnswer({
              apiKey, baseUrl, model, question, history, context, signal: answerSignal,
              onAnswerDelta(delta) {
                streamedAnswer += delta;
                send('answer.delta', { message_id: assistantMessage.id, delta });
              },
            });
            const validRefs = new Set(context.sources.map(source => source.ref));
            const result = validateCompanionResult(completion.parsed, validRefs);
            result.limitations = [...new Set([...context.limitations, ...result.limitations])];

            const memoryRows = result.memory_proposals.map(memory => ({
              user_id: clients.user.id,
              content: memory.content,
              kind: memory.kind,
              status: 'proposed',
              source_message_id: assistantMessage.id,
            }));
            let memoryProposals: Array<Record<string, unknown>> = [];
            if (memoryRows.length) {
              const { data, error } = await clients.serviceClient.from('ai_memories').insert(memoryRows)
                .select('id,content,kind,status,source_message_id,created_at,updated_at');
              if (error) throw new HttpError(500, 'memory_proposal_save_failed', '回答已生成，但记忆建议无法保存');
              memoryProposals = data || [];
            }
            const savedResult = { ...result, memory_proposals: memoryProposals };
            const completedAt = new Date().toISOString();
            const { error: saveError } = await clients.serviceClient.from('ai_chat_messages').update({
              content: result.answer,
              status: 'completed',
              context_snapshot: context,
              result: savedResult,
              model: completion.model,
              usage: completion.usage,
              error_code: null,
              completed_at: completedAt,
            }).eq('id', assistantMessage.id).eq('user_id', clients.user.id);
            if (saveError) throw new HttpError(500, 'answer_save_failed', '回答已生成，但无法保存');
            await clients.serviceClient.from('ai_conversations').update({ last_active_at: completedAt })
              .eq('id', conversationId).eq('user_id', clients.user.id);
            send('answer.completed', {
              message_id: assistantMessage.id,
              conversation_id: conversationId,
              content: result.answer,
              result: savedResult,
              context: { sources: context.sources.map(source => ({ ref: source.ref, type: source.type, id: source.id, occurred_on: source.occurred_on, title: source.title, excerpt: source.content.slice(0, 240), metadata: source.metadata })) },
              model: completion.model,
              completed_at: completedAt,
              revision_of_id: revisionOfId,
              revision_number: revisionNumber,
            });
          } catch (error) {
            const abortedByUser = streamAbort.signal.aborted || request.signal.aborted;
            const failure = publicError(error);
            await clients.serviceClient.from('ai_chat_messages').update({
              content: streamedAnswer,
              status: abortedByUser ? 'stopped' : 'failed',
              error_code: abortedByUser ? 'stopped' : failure.code,
              completed_at: new Date().toISOString(),
            }).eq('id', assistantMessage.id).eq('user_id', clients.user.id);
            try { send('error', { ...failure, message_id: assistantMessage.id, stopped: abortedByUser }); } catch { /* client disconnected */ }
          } finally {
            try { controller.close(); } catch { /* already cancelled */ }
          }
        })();
      },
      cancel() { streamAbort.abort(); },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        ...getCorsHeaders(request),
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    return errorResponse(request, error);
  }
});
