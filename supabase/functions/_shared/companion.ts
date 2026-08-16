import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { HttpError } from './http.ts';
import { getOpenAiEndpoint } from './openai.ts';

export const COMPANION_RESULT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['answer', 'citations', 'suggested_followups', 'memory_proposals', 'limitations'],
  properties: {
    answer: { type: 'string', minLength: 1, maxLength: 30000 },
    citations: {
      type: 'array', maxItems: 30,
      items: {
        type: 'object', additionalProperties: false, required: ['ref', 'claim'],
        properties: {
          ref: { type: 'string', minLength: 3, maxLength: 100 },
          claim: { type: 'string', minLength: 1, maxLength: 500 },
        },
      },
    },
    suggested_followups: {
      type: 'array', maxItems: 4,
      items: { type: 'string', minLength: 1, maxLength: 160 },
    },
    memory_proposals: {
      type: 'array', maxItems: 3,
      items: {
        type: 'object', additionalProperties: false, required: ['kind', 'content'],
        properties: {
          kind: { type: 'string', enum: ['explicit_statement', 'observed_pattern'] },
          content: { type: 'string', minLength: 1, maxLength: 500 },
        },
      },
    },
    limitations: {
      type: 'array', maxItems: 10,
      items: { type: 'string', minLength: 1, maxLength: 300 },
    },
  },
} as const;

const RETRIEVAL_PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['date_start', 'date_end', 'source_types', 'search_terms'],
  properties: {
    date_start: { type: ['string', 'null'] },
    date_end: { type: ['string', 'null'] },
    source_types: {
      type: 'array', maxItems: 6,
      items: { type: 'string', enum: ['todo', 'goal', 'completion_review', 'daily_review', 'work_review', 'memory'] },
    },
    search_terms: {
      type: 'array', maxItems: 8,
      items: { type: 'string', minLength: 1, maxLength: 80 },
    },
  },
} as const;

const PLANNER_INSTRUCTIONS = `你负责为 TodoList AI 伙伴规划检索。只根据当前问题和近期对话，返回检索日期、来源类型和短搜索词。
日期不明确时使用 null；问题可能与长期模式有关时保留 memory；不要回答用户问题；严格返回 JSON Schema。`;

const COMPANION_INSTRUCTIONS = `你是 TodoList 的 AI 伙伴：真诚、理性、不迎合，关心用户长期幸福和选择是否可持续，而不只优化任务完成率。

规则：
- 可以讨论工作、生活、关系、选择和情绪，但不要进行医学诊断或保证某个选择会让用户更幸福；
- 明确区分数据库事实、用户本轮陈述和你的推测；推测必须使用克制措辞；
- 事实引用只能使用 CompanionContextV1.sources 中存在的 ref；
- 没有记录不等于没有行动，不评价绩效，不虚构历史；
- 网页 AI 只读，不声称已经修改、创建、删除或完成任务；
- 只在信息可能长期影响后续建议时提出记忆，最多 3 条；用户明确说出的事实用 explicit_statement，推断的稳定模式用 observed_pattern；
- answer 使用自然中文和必要的 Markdown；严格返回指定 JSON Schema，不添加额外字段。`;

export type CompanionSource = {
  ref: string;
  type: string;
  id: string;
  occurred_on: string | null;
  title: string;
  content: string;
  metadata: Record<string, unknown>;
  relevance: number;
};

type RetrievalPlan = {
  date_start: string | null;
  date_end: string | null;
  source_types: string[];
  search_terms: string[];
};

function outputText(payload: Record<string, unknown>) {
  const direct = typeof payload.output_text === 'string' ? payload.output_text : '';
  if (direct) return direct;
  for (const item of Array.isArray(payload.output) ? payload.output : []) {
    if (!item || typeof item !== 'object') continue;
    for (const part of Array.isArray((item as Record<string, unknown>).content)
      ? (item as Record<string, unknown>).content as unknown[] : []) {
      if (part && typeof part === 'object' && typeof (part as Record<string, unknown>).text === 'string') {
        return (part as Record<string, unknown>).text as string;
      }
    }
  }
  return '';
}

function providerError(status: number): HttpError {
  if (status === 401 || status === 403) return new HttpError(400, 'invalid_api_key', 'API Key 已失效，请重新配置');
  if (status === 429) return new HttpError(429, 'provider_rate_limited', '模型请求受限或额度不足，请检查 API 账户');
  if (status === 404) return new HttpError(503, 'responses_not_supported', '当前模型服务不支持 Responses API');
  return new HttpError(502, 'provider_error', 'AI 模型服务暂时无法完成回答');
}

async function fetchResponse(url: string, apiKey: string, body: unknown, signal: AbortSignal) {
  try {
    return await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (signal.aborted) throw new HttpError(504, 'provider_timeout', 'AI 服务响应超时或已停止');
    throw new HttpError(503, 'provider_unavailable', '暂时无法连接 AI 模型服务');
  }
}

export async function planCompanionRetrieval(options: {
  apiKey: string;
  baseUrl: unknown;
  model: string;
  question: string;
  history: Array<{ role: string; content: string }>;
  signal: AbortSignal;
}): Promise<RetrievalPlan> {
  const response = await fetchResponse(getOpenAiEndpoint(options.baseUrl, 'responses'), options.apiKey, {
    model: options.model,
    instructions: PLANNER_INSTRUCTIONS,
    input: [
      ...options.history,
      { role: 'user', content: options.question },
    ],
    max_output_tokens: 800,
    store: false,
    text: { format: { type: 'json_schema', name: 'companion_retrieval_plan', strict: true, schema: RETRIEVAL_PLAN_SCHEMA } },
  }, options.signal);
  if (!response.ok) throw providerError(response.status);
  let payload: Record<string, unknown>;
  try { payload = await response.json(); } catch { throw new HttpError(502, 'invalid_provider_response', '检索规划响应无法解析'); }
  let parsed: Record<string, unknown>;
  try { parsed = JSON.parse(outputText(payload)); } catch { throw new HttpError(502, 'invalid_retrieval_plan', '模型没有返回有效的检索计划'); }
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const allowedTypes = new Set(['todo', 'goal', 'completion_review', 'daily_review', 'work_review', 'memory']);
  return {
    date_start: typeof parsed.date_start === 'string' && datePattern.test(parsed.date_start) ? parsed.date_start : null,
    date_end: typeof parsed.date_end === 'string' && datePattern.test(parsed.date_end) ? parsed.date_end : null,
    source_types: Array.isArray(parsed.source_types)
      ? parsed.source_types.filter(value => typeof value === 'string' && allowedTypes.has(value)).slice(0, 6) : [],
    search_terms: Array.isArray(parsed.search_terms)
      ? parsed.search_terms.filter(value => typeof value === 'string' && value.trim()).map(value => value.trim()).slice(0, 8) : [],
  };
}

function sourceFromRow(row: Record<string, unknown>): CompanionSource {
  const rawType = String(row.source_type || 'todo');
  const type = rawType === 'completion_goal' ? 'goal' : rawType;
  const id = String(row.source_id || '');
  return {
    ref: `${type}:${id}`,
    type,
    id,
    occurred_on: typeof row.occurred_on === 'string' ? row.occurred_on : null,
    title: String(row.title || '未命名记录').slice(0, 300),
    content: String(row.content || '').slice(0, 4000),
    metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata as Record<string, unknown> : {},
    relevance: Number(row.relevance || 0),
  };
}

function dateDaysAgo(days: number) {
  const date = new Date(Date.now() - days * 86400000);
  return date.toISOString().slice(0, 10);
}

export async function buildCompanionContext(serviceClient: SupabaseClient, options: {
  userId: string;
  plan: RetrievalPlan;
  excludedRefs?: string[];
  timezone?: string;
  locale?: string;
}) {
  const excluded = new Set((options.excludedRefs || []).slice(0, 80));
  const [planned, baseline, openTodos, memories] = await Promise.all([
    serviceClient.rpc('search_ai_context_for_user', {
      p_user_id: options.userId,
      p_search_terms: options.plan.search_terms,
      p_start_date: options.plan.date_start,
      p_end_date: options.plan.date_end,
      p_types: (options.plan.source_types.length ? options.plan.source_types : ['todo', 'goal', 'completion_review', 'daily_review', 'work_review', 'memory']).map(type => type === 'goal' ? 'completion_goal' : type),
      p_limit: 50,
    }),
    serviceClient.rpc('search_ai_context_for_user', {
      p_user_id: options.userId,
      p_search_terms: [],
      p_start_date: dateDaysAgo(30),
      p_end_date: null,
      p_types: ['todo', 'completion_goal', 'completion_review', 'daily_review', 'work_review', 'memory'],
      p_limit: 30,
    }),
    serviceClient.from('todos').select('id,text,description,is_completed,parent_id,planned_date,updated_at,created_at,category_id')
      .eq('user_id', options.userId).eq('is_completed', false).order('planned_date', { ascending: true, nullsFirst: false }).limit(20),
    serviceClient.from('ai_memories').select('id,content,kind,status,updated_at,created_at')
      .eq('user_id', options.userId).eq('status', 'enabled').order('updated_at', { ascending: false }).limit(20),
  ]);
  if (planned.error || baseline.error || openTodos.error || memories.error) {
    throw new HttpError(500, 'context_search_failed', '无法检索相关记录');
  }

  const candidates: CompanionSource[] = [
    ...(planned.data || []).map((row: Record<string, unknown>) => sourceFromRow(row)),
    ...(baseline.data || []).map((row: Record<string, unknown>) => sourceFromRow(row)),
    ...(openTodos.data || []).map((row: Record<string, unknown>) => sourceFromRow({
      source_type: 'todo', source_id: row.id,
      occurred_on: row.planned_date || String(row.created_at || '').slice(0, 10),
      title: row.text, content: row.description,
      metadata: { is_completed: false, parent_id: row.parent_id, planned_date: row.planned_date, updated_at: row.updated_at, category_id: row.category_id },
      relevance: 5,
    })),
    ...(memories.data || []).map((row: Record<string, unknown>) => sourceFromRow({
      source_type: 'memory', source_id: row.id, occurred_on: String(row.created_at || '').slice(0, 10),
      title: '长期记忆', content: row.content,
      metadata: { kind: row.kind, status: row.status, updated_at: row.updated_at }, relevance: 8,
    })),
  ];

  const unique = new Map<string, CompanionSource>();
  for (const source of candidates) {
    if (!source.id || excluded.has(source.ref) || unique.has(source.ref)) continue;
    unique.set(source.ref, source);
  }
  let sources = [...unique.values()]
    .sort((a, b) => b.relevance - a.relevance || String(b.occurred_on).localeCompare(String(a.occurred_on)))
    .slice(0, 80);
  const originalCount = unique.size;
  const limitations: string[] = [];
  if (originalCount > sources.length) limitations.push(`相关记录超过单轮上限，省略 ${originalCount - sources.length} 条。`);

  const base = {
    schema_version: '1.0',
    generated_at: new Date().toISOString(),
    timezone: options.timezone || 'Asia/Shanghai',
    locale: options.locale || 'zh-CN',
    retrieval_plan: options.plan,
    sources,
    limitations,
  };
  while (JSON.stringify(base).length > 80000 && sources.length > 1) sources.pop();
  const trimmedCount = originalCount - sources.length;
  if (trimmedCount > 0 && !limitations.length) limitations.push(`上下文达到 80,000 字符限制，省略 ${trimmedCount} 条记录。`);
  return { ...base, sources, limitations };
}

export function validateCompanionResult(value: unknown, validRefs: Set<string>) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(502, 'invalid_model_output', '模型返回的回答格式无效');
  }
  const raw = value as Record<string, unknown>;
  const answer = typeof raw.answer === 'string' ? raw.answer.trim() : '';
  if (!answer || answer.length > 30000) throw new HttpError(502, 'invalid_model_output', '模型没有返回有效回答');
  const citations = (Array.isArray(raw.citations) ? raw.citations : []).map(item => {
    const record = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    const ref = typeof record.ref === 'string' ? record.ref : '';
    if (!validRefs.has(ref)) throw new HttpError(502, 'invalid_citation', '模型引用了本轮不存在的记录');
    return { ref, claim: String(record.claim || '').trim().slice(0, 500) };
  }).filter(item => item.claim).slice(0, 30);
  const suggestedFollowups = (Array.isArray(raw.suggested_followups) ? raw.suggested_followups : [])
    .filter(item => typeof item === 'string' && item.trim()).map(item => item.trim().slice(0, 160)).slice(0, 4);
  const memoryProposals = (Array.isArray(raw.memory_proposals) ? raw.memory_proposals : [])
    .map(item => item && typeof item === 'object' ? item as Record<string, unknown> : {})
    .filter(item => ['explicit_statement', 'observed_pattern'].includes(String(item.kind)) && typeof item.content === 'string' && item.content.trim())
    .map(item => ({ kind: String(item.kind), content: String(item.content).trim().slice(0, 500) })).slice(0, 3);
  const limitations = (Array.isArray(raw.limitations) ? raw.limitations : [])
    .filter(item => typeof item === 'string' && item.trim()).map(item => item.trim().slice(0, 300)).slice(0, 10);
  return { answer, citations, suggested_followups: suggestedFollowups, memory_proposals: memoryProposals, limitations };
}

// Returns the complete, safely decoded prefix of a JSON string field. Incomplete
// escapes stay buffered until the next network chunk arrives.
export function extractPartialJsonString(json: string, field: string) {
  const match = new RegExp(`"${field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\s*:\\s*"`).exec(json);
  if (!match) return '';
  let result = '';
  for (let index = match.index + match[0].length; index < json.length; index += 1) {
    const char = json[index];
    if (char === '"') return result;
    if (char !== '\\') { result += char; continue; }
    if (index + 1 >= json.length) break;
    const escaped = json[index + 1];
    const basic: Record<string, string> = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
    if (escaped in basic) { result += basic[escaped]; index += 1; continue; }
    if (escaped === 'u') {
      const hex = json.slice(index + 2, index + 6);
      if (hex.length < 4 || !/^[0-9a-fA-F]{4}$/.test(hex)) break;
      result += String.fromCharCode(Number.parseInt(hex, 16));
      index += 5;
      continue;
    }
    break;
  }
  return result;
}

export async function streamCompanionAnswer(options: {
  apiKey: string;
  baseUrl: unknown;
  model: string;
  question: string;
  history: Array<{ role: string; content: string }>;
  context: unknown;
  signal: AbortSignal;
  onAnswerDelta: (delta: string) => void;
}) {
  const response = await fetchResponse(getOpenAiEndpoint(options.baseUrl, 'responses'), options.apiKey, {
    model: options.model,
    instructions: COMPANION_INSTRUCTIONS,
    input: [
      ...options.history,
      { role: 'user', content: `当前问题：\n${options.question}\n\nCompanionContextV1：\n${JSON.stringify(options.context)}` },
    ],
    max_output_tokens: 6000,
    stream: true,
    store: false,
    text: { format: { type: 'json_schema', name: 'ai_companion_result', strict: true, schema: COMPANION_RESULT_SCHEMA } },
  }, options.signal);
  if (!response.ok) throw providerError(response.status);
  if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) {
    throw new HttpError(502, 'responses_stream_required', '当前模型服务不支持 Responses SSE 流式输出');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let eventBuffer = '';
  let structuredText = '';
  let emittedAnswer = '';
  let usage: unknown = null;
  let actualModel = options.model;

  while (true) {
    const { value, done } = await reader.read();
    eventBuffer += decoder.decode(value || new Uint8Array(), { stream: !done }).replace(/\r\n/g, '\n');
    const frames = eventBuffer.split('\n\n');
    const tail = frames.pop() || '';
    eventBuffer = done ? '' : tail;
    if (done && tail.trim()) frames.push(tail);
    for (const frame of frames) {
      const data = frame.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
      if (!data || data === '[DONE]') continue;
      let event: Record<string, unknown>;
      try { event = JSON.parse(data); } catch { throw new HttpError(502, 'invalid_provider_stream', '模型服务返回了损坏的 SSE 事件'); }
      if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') {
        structuredText += event.delta;
        const currentAnswer = extractPartialJsonString(structuredText, 'answer');
        if (currentAnswer.length > emittedAnswer.length) {
          options.onAnswerDelta(currentAnswer.slice(emittedAnswer.length));
          emittedAnswer = currentAnswer;
        }
      }
      if (event.type === 'response.completed' && event.response && typeof event.response === 'object') {
        const completed = event.response as Record<string, unknown>;
        usage = completed.usage && typeof completed.usage === 'object' ? completed.usage : null;
        if (typeof completed.model === 'string') actualModel = completed.model;
      }
      if (event.type === 'response.failed' || event.type === 'error') throw new HttpError(502, 'provider_stream_failed', '模型服务中断了回答');
    }
    if (done) break;
  }
  if (!structuredText) throw new HttpError(502, 'invalid_model_output', '模型没有返回回答');
  let parsed: unknown;
  try { parsed = JSON.parse(structuredText); } catch { throw new HttpError(502, 'invalid_model_output', '模型返回的回答格式无效'); }
  return { parsed, usage, model: actualModel };
}
