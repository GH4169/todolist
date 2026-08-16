import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { HttpError } from './http.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const OPERATIONS = new Set(['reschedule_task', 'create_task', 'create_subtask', 'set_completion_goal']);
const EVIDENCE_TABLES: Record<string, string> = {
  todo: 'todos', goal: 'todo_completion_goals', completion_review: 'todo_completion_reviews',
  daily_review: 'daily_reviews', work_review: 'work_reviews', memory: 'ai_memories',
};

type ProposalItemInput = {
  operation: string;
  target_todo_id?: string | null;
  expected_updated_at?: string | null;
  payload: Record<string, unknown>;
  reason: string;
  evidence_refs: string[];
  idempotency_key?: string;
};

function dateToday() { return new Date().toISOString().slice(0, 10); }

function requireText(value: unknown, field: string, max: number) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || text.length > max) throw new HttpError(400, 'invalid_proposal_item', `${field} 需要在 1 到 ${max} 个字符之间`);
  return text;
}

function optionalDate(value: unknown, field: string) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || !DATE.test(value) || value < dateToday()) {
    throw new HttpError(400, 'invalid_proposal_item', `${field} 必须是今天或未来日期`);
  }
  return value;
}

function normalizeItem(value: unknown): ProposalItemInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, 'invalid_proposal_item', '提案项格式无效');
  const raw = value as Record<string, unknown>;
  const operation = typeof raw.operation === 'string' ? raw.operation : '';
  if (!OPERATIONS.has(operation)) throw new HttpError(400, 'operation_not_allowed', '提案包含不允许的任务操作');
  const targetTodoId = raw.target_todo_id === null || raw.target_todo_id === undefined ? null : String(raw.target_todo_id);
  if (targetTodoId && !UUID.test(targetTodoId)) throw new HttpError(400, 'invalid_proposal_item', '目标任务 ID 无效');
  const payload = raw.payload && typeof raw.payload === 'object' && !Array.isArray(raw.payload)
    ? raw.payload as Record<string, unknown> : {};
  const reason = requireText(raw.reason, '调整原因', 1000);
  const evidenceRefs = Array.isArray(raw.evidence_refs)
    ? [...new Set(raw.evidence_refs.filter(ref => typeof ref === 'string' && ref.length <= 100))].slice(0, 30) as string[] : [];
  if (raw.idempotency_key && !UUID.test(String(raw.idempotency_key))) {
    throw new HttpError(400, 'invalid_idempotency_key', '幂等键必须是 UUID');
  }

  if (operation === 'reschedule_task') {
    if (!targetTodoId) throw new HttpError(400, 'invalid_proposal_item', '改期操作缺少目标任务');
    return { operation, target_todo_id: targetTodoId, expected_updated_at: String(raw.expected_updated_at || ''), payload: { planned_date: optionalDate(payload.planned_date, '安排日期') }, reason, evidence_refs: evidenceRefs, idempotency_key: raw.idempotency_key as string };
  }
  if (operation === 'create_task') {
    return { operation, target_todo_id: null, expected_updated_at: null, payload: {
      text: requireText(payload.text, '任务标题', 500),
      planned_date: optionalDate(payload.planned_date, '安排日期'),
      category_id: payload.category_id && UUID.test(String(payload.category_id)) ? String(payload.category_id) : null,
    }, reason, evidence_refs: evidenceRefs, idempotency_key: raw.idempotency_key as string };
  }
  if (operation === 'create_subtask') {
    if (!targetTodoId) throw new HttpError(400, 'invalid_proposal_item', '新建子任务缺少父任务');
    return { operation, target_todo_id: targetTodoId, expected_updated_at: String(raw.expected_updated_at || ''), payload: {
      text: requireText(payload.text, '子任务标题', 500),
      planned_date: optionalDate(payload.planned_date, '安排日期'),
    }, reason, evidence_refs: evidenceRefs, idempotency_key: raw.idempotency_key as string };
  }
  if (!targetTodoId) throw new HttpError(400, 'invalid_proposal_item', '完成目标操作缺少任务');
  return { operation, target_todo_id: targetTodoId, expected_updated_at: String(raw.expected_updated_at || ''), payload: {
    target_date: optionalDate(payload.target_date, '目标日期'),
    content: requireText(payload.content, '完成目标', 500),
  }, reason, evidence_refs: evidenceRefs, idempotency_key: raw.idempotency_key as string };
}

async function validateEvidenceRefs(client: SupabaseClient, userId: string, refs: string[]) {
  const groups = new Map<string, string[]>();
  for (const ref of refs) {
    const [type, id, extra] = ref.split(':');
    if (extra || !EVIDENCE_TABLES[type] || !UUID.test(id)) throw new HttpError(400, 'invalid_evidence_ref', '提案包含无效证据引用');
    groups.set(type, [...(groups.get(type) || []), id]);
  }
  for (const [type, ids] of groups) {
    const { data, error } = await client.from(EVIDENCE_TABLES[type]).select('id').eq('user_id', userId).in('id', ids);
    if (error || (data || []).length !== new Set(ids).size) throw new HttpError(400, 'invalid_evidence_ref', '提案引用了不存在或不属于当前用户的记录');
  }
}

async function validateTargets(client: SupabaseClient, userId: string, items: ProposalItemInput[]) {
  const targetIds = [...new Set(items.map(item => item.target_todo_id).filter(Boolean) as string[])];
  if (!targetIds.length) return;
  const { data, error } = await client.from('todos').select('id,parent_id,is_completed').eq('user_id', userId).in('id', targetIds);
  if (error || (data || []).length !== targetIds.length) throw new HttpError(400, 'invalid_target_todo', '提案引用了不存在或不属于当前用户的任务');
  const byId = new Map((data || []).map(row => [row.id, row]));
  for (const item of items) {
    const todo = item.target_todo_id ? byId.get(item.target_todo_id) : null;
    if (item.operation === 'reschedule_task' && todo?.is_completed) throw new HttpError(400, 'completed_task_not_reschedulable', '不能为已完成任务改期');
    if (item.operation === 'create_subtask' && todo?.parent_id) throw new HttpError(400, 'invalid_parent_task', '只能在父任务下新建子任务');
  }
}

export async function createChangeProposal(client: SupabaseClient, options: {
  userId: string;
  source: 'web_ai' | 'codex_mcp';
  sourceTokenId?: string | null;
  title: unknown;
  summary?: unknown;
  stableId?: unknown;
  items: unknown;
}) {
  const title = requireText(options.title, '提案标题', 120);
  const summary = typeof options.summary === 'string' ? options.summary.trim().slice(0, 1000) : '';
  const rawItems = Array.isArray(options.items) ? options.items : [];
  if (!rawItems.length || rawItems.length > 10) throw new HttpError(400, 'invalid_proposal_size', '每组提案需要包含 1 到 10 项调整');
  const items = rawItems.map(normalizeItem);
  const allRefs = [...new Set(items.flatMap(item => item.evidence_refs))];
  await Promise.all([validateEvidenceRefs(client, options.userId, allRefs), validateTargets(client, options.userId, items)]);
  const stableId = typeof options.stableId === 'string' && UUID.test(options.stableId) ? options.stableId : crypto.randomUUID();

  const { data: proposal, error: proposalError } = await client.from('ai_change_proposals').insert({
    user_id: options.userId, source: options.source, source_token_id: options.sourceTokenId || null,
    title, summary, stable_id: stableId, status: 'pending',
  }).select('id,stable_id,title,summary,status,source,expires_at,created_at').single();
  if (proposalError?.code === '23505') {
    const { data: existing } = await client.from('ai_change_proposals')
      .select('id,stable_id,title,summary,status,source,expires_at,created_at')
      .eq('stable_id', stableId).eq('user_id', options.userId).maybeSingle();
    if (existing) return getChangeProposal(client, options.userId, existing.id);
  }
  if (proposalError || !proposal) throw new HttpError(500, 'proposal_create_failed', '无法保存任务变更提案');
  const rows = items.map(item => ({
    proposal_id: proposal.id, user_id: options.userId, operation: item.operation,
    target_todo_id: item.target_todo_id || null, expected_updated_at: item.expected_updated_at || null,
    payload: item.payload, reason: item.reason, evidence_refs: item.evidence_refs,
    idempotency_key: item.idempotency_key || crypto.randomUUID(),
  }));
  const { error: itemsError } = await client.from('ai_change_proposal_items').insert(rows);
  if (itemsError) {
    await client.from('ai_change_proposals').delete().eq('id', proposal.id).eq('user_id', options.userId);
    throw new HttpError(500, 'proposal_items_create_failed', '无法保存提案项目');
  }
  return getChangeProposal(client, options.userId, proposal.id);
}

export async function getChangeProposal(client: SupabaseClient, userId: string, proposalId: string) {
  if (!UUID.test(proposalId)) throw new HttpError(400, 'invalid_proposal_id', '提案 ID 无效');
  const [{ data: proposal, error }, { data: items, error: itemsError }] = await Promise.all([
    client.from('ai_change_proposals').select('id,stable_id,title,summary,source,status,expires_at,created_at,updated_at,resolved_at,execution_results')
      .eq('id', proposalId).eq('user_id', userId).maybeSingle(),
    client.from('ai_change_proposal_items').select('id,operation,target_todo_id,expected_updated_at,payload,reason,evidence_refs,status,idempotency_key,created_todo_id,execution_result,created_at')
      .eq('proposal_id', proposalId).eq('user_id', userId).order('created_at'),
  ]);
  if (error || itemsError) throw new HttpError(500, 'proposal_load_failed', '无法读取任务变更提案');
  if (!proposal) throw new HttpError(404, 'proposal_not_found', '任务变更提案不存在');
  return { ...proposal, items: items || [] };
}

async function nextPosition(client: SupabaseClient, userId: string, parentId: string | null, categoryId: string | null) {
  let query = client.from('todos').select('position').eq('user_id', userId).order('position', { ascending: false }).limit(1);
  query = parentId ? query.eq('parent_id', parentId) : query.is('parent_id', null);
  if (!parentId) query = categoryId ? query.eq('category_id', categoryId) : query.is('category_id', null);
  const { data } = await query;
  return Number(data?.[0]?.position || -1) + 1;
}

async function executeItem(client: SupabaseClient, userId: string, item: Record<string, unknown>) {
  if (item.status === 'applied') return item.execution_result || { status: 'applied', idempotent: true };
  const operation = String(item.operation);
  const payload = item.payload as Record<string, unknown>;
  const targetId = item.target_todo_id ? String(item.target_todo_id) : null;
  if (Array.isArray(item.evidence_refs)) await validateEvidenceRefs(client, userId, item.evidence_refs as string[]);

  let target: Record<string, unknown> | null = null;
  if (targetId) {
    const { data, error } = await client.from('todos')
      .select('id,text,parent_id,category_id,is_completed,planned_date,updated_at').eq('id', targetId).eq('user_id', userId).maybeSingle();
    if (error || !data) throw new HttpError(409, 'target_missing', '目标任务已不存在');
    target = data;
    if (item.expected_updated_at && target.updated_at !== item.expected_updated_at) {
      throw new HttpError(409, 'updated_at_conflict', '任务在提案后已被修改');
    }
  }

  if (operation === 'reschedule_task') {
    if (target?.is_completed) throw new HttpError(409, 'completed_task_conflict', '任务已经完成，不能改期');
    const plannedDate = optionalDate(payload.planned_date, '安排日期');
    const { data, error } = await client.from('todos').update({ planned_date: plannedDate })
      .eq('id', targetId).eq('user_id', userId).eq('updated_at', target?.updated_at).select('id,planned_date,updated_at').maybeSingle();
    if (error || !data) throw new HttpError(409, 'updated_at_conflict', '任务在确认时发生变化');
    return { status: 'applied', todo_id: data.id, planned_date: data.planned_date };
  }

  const createdTodoId = String(item.created_todo_id || item.idempotency_key);
  if (operation === 'create_task' || operation === 'create_subtask') {
    const parentId = operation === 'create_subtask' ? targetId : null;
    if (operation === 'create_subtask' && target?.parent_id) throw new HttpError(409, 'invalid_parent_task', '目标已经是子任务');
    const categoryId = operation === 'create_subtask' ? target?.category_id || null : payload.category_id || null;
    if (categoryId) {
      const { data: category } = await client.from('todo_categories').select('id').eq('id', categoryId).eq('user_id', userId).maybeSingle();
      if (!category) throw new HttpError(409, 'category_missing', '目标分组已不存在');
    }
    const { data: existing } = await client.from('todos').select('id,text').eq('id', createdTodoId).eq('user_id', userId).maybeSingle();
    if (existing) return { status: 'applied', todo_id: existing.id, idempotent: true };
    const position = await nextPosition(client, userId, parentId, categoryId as string | null);
    const { data, error } = await client.from('todos').insert({
      id: createdTodoId, user_id: userId, parent_id: parentId, category_id: categoryId,
      text: payload.text, planned_date: payload.planned_date || (operation === 'create_subtask' ? target?.planned_date || null : null), position,
    }).select('id,text,parent_id,planned_date,updated_at').single();
    if (error || !data) throw new HttpError(500, 'task_create_failed', '无法创建提案任务');
    return { status: 'applied', todo_id: data.id, parent_id: data.parent_id };
  }

  if (target?.is_completed) throw new HttpError(409, 'completed_task_conflict', '任务已经完成，不能设置新的完成目标');
  const targetDate = optionalDate(payload.target_date, '目标日期');
  if (!targetDate) throw new HttpError(400, 'invalid_target_date', '目标日期不能为空');
  const { data, error } = await client.from('todo_completion_goals').upsert({
    user_id: userId, todo_id: targetId, target_date: targetDate, content: payload.content,
  }, { onConflict: 'todo_id,target_date' }).select('id,todo_id,target_date,content').single();
  if (error || !data) throw new HttpError(500, 'completion_goal_save_failed', '无法保存完成目标');
  return { status: 'applied', goal_id: data.id, todo_id: data.todo_id, target_date: data.target_date };
}

export async function applyChangeProposal(client: SupabaseClient, options: {
  userId: string;
  proposalId: string;
  itemIds: string[];
}) {
  const proposal = await getChangeProposal(client, options.userId, options.proposalId);
  if (['rejected', 'expired'].includes(proposal.status)) throw new HttpError(409, 'proposal_not_pending', '提案已失效');
  if (new Date(proposal.expires_at).getTime() <= Date.now()) {
    await client.from('ai_change_proposals').update({ status: 'expired', resolved_at: new Date().toISOString() })
      .eq('id', proposal.id).eq('user_id', options.userId);
    throw new HttpError(410, 'proposal_expired', '提案已过期，请重新创建');
  }
  const selected = new Set(options.itemIds.filter(id => UUID.test(id)).slice(0, 10));
  if (!selected.size) throw new HttpError(400, 'proposal_items_required', '请至少选择一项调整');
  const known = new Set(proposal.items.map((item: Record<string, unknown>) => item.id));
  if ([...selected].some(id => !known.has(id))) throw new HttpError(400, 'proposal_item_not_found', '所选提案项不属于当前提案');

  const results: Array<Record<string, unknown>> = [];
  for (const item of proposal.items as Array<Record<string, unknown>>) {
    if (!selected.has(String(item.id))) {
      if (item.status === 'pending') await client.from('ai_change_proposal_items').update({ status: 'rejected' }).eq('id', item.id).eq('user_id', options.userId);
      continue;
    }
    try {
      const result = await executeItem(client, options.userId, item);
      await client.from('ai_change_proposal_items').update({
        status: 'applied', applied_at: new Date().toISOString(), error_code: null,
        execution_result: result,
        created_todo_id: (result as Record<string, unknown>).todo_id || item.created_todo_id || null,
      }).eq('id', item.id).eq('user_id', options.userId);
      results.push({ item_id: item.id, ...result });
    } catch (error) {
      const code = error instanceof HttpError ? error.code : 'execution_failed';
      const status = error instanceof HttpError && error.status === 409 ? 'conflict'
        : error instanceof HttpError && error.status === 400 ? 'invalid' : 'failed';
      const result = { status, error_code: code, message: error instanceof Error ? error.message : '执行失败' };
      await client.from('ai_change_proposal_items').update({ status, error_code: code, execution_result: result })
        .eq('id', item.id).eq('user_id', options.userId);
      results.push({ item_id: item.id, ...result });
    }
  }
  const applied = results.filter(result => result.status === 'applied').length;
  const finalStatus = applied === selected.size ? 'applied' : applied > 0 ? 'partially_applied' : 'partially_applied';
  const resolvedAt = new Date().toISOString();
  await client.from('ai_change_proposals').update({
    status: finalStatus, execution_results: results, resolved_at: resolvedAt,
  }).eq('id', proposal.id).eq('user_id', options.userId);
  return getChangeProposal(client, options.userId, proposal.id);
}

export async function rejectChangeProposal(client: SupabaseClient, userId: string, proposalId: string) {
  const proposal = await getChangeProposal(client, userId, proposalId);
  if (['applied', 'rejected', 'expired'].includes(proposal.status)) return proposal;
  const resolvedAt = new Date().toISOString();
  await Promise.all([
    client.from('ai_change_proposal_items').update({ status: 'rejected' }).eq('proposal_id', proposalId).eq('user_id', userId).eq('status', 'pending'),
    client.from('ai_change_proposals').update({ status: 'rejected', resolved_at: resolvedAt }).eq('id', proposalId).eq('user_id', userId),
  ]);
  return getChangeProposal(client, userId, proposalId);
}
