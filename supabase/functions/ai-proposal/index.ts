import { getAuthenticatedClients } from '../_shared/auth.ts';
import { applyChangeProposal, getChangeProposal, rejectChangeProposal } from '../_shared/proposals.ts';
import { errorResponse, HttpError, jsonResponse, optionsResponse, readJsonBody } from '../_shared/http.ts';

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return optionsResponse(request);
  try {
    const clients = await getAuthenticatedClients(request);
    if (request.method === 'GET') {
      const url = new URL(request.url);
      const proposalId = url.searchParams.get('id');
      if (proposalId) return jsonResponse(request, { proposal: await getChangeProposal(clients.serviceClient, clients.user.id, proposalId) });
      const { data, error } = await clients.serviceClient.from('ai_change_proposals')
        .select('id,stable_id,title,summary,source,status,expires_at,created_at,updated_at,resolved_at,ai_change_proposal_items(id,operation,target_todo_id,payload,reason,evidence_refs,status,execution_result)')
        .eq('user_id', clients.user.id).in('status', ['pending', 'partially_applied'])
        .order('created_at', { ascending: false }).limit(30);
      if (error) throw new HttpError(500, 'proposal_list_failed', '无法读取待确认提案');
      return jsonResponse(request, { proposals: data || [] });
    }
    if (request.method !== 'POST') throw new HttpError(405, 'method_not_allowed', '不支持的请求方法');
    const body = await readJsonBody(request) as Record<string, unknown>;
    const proposalId = typeof body.proposal_id === 'string' ? body.proposal_id : '';
    const action = typeof body.action === 'string' ? body.action : '';
    if (!proposalId) throw new HttpError(400, 'proposal_id_required', '请选择任务变更提案');
    if (action === 'reject') {
      return jsonResponse(request, { proposal: await rejectChangeProposal(clients.serviceClient, clients.user.id, proposalId) });
    }
    if (action === 'apply') {
      if (body.confirm !== true) throw new HttpError(400, 'confirmation_required', '应用提案需要二次确认');
      const itemIds = Array.isArray(body.item_ids) ? body.item_ids.filter(value => typeof value === 'string') as string[] : [];
      return jsonResponse(request, { proposal: await applyChangeProposal(clients.serviceClient, {
        userId: clients.user.id, proposalId, itemIds,
      }) });
    }
    throw new HttpError(400, 'invalid_proposal_action', '不支持的提案操作');
  } catch (error) {
    return errorResponse(request, error);
  }
});
