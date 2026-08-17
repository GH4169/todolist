import { createMcpHandler, McpServer } from 'npm:@modelcontextprotocol/server@2.0.0';
// MCP server v2 uses Zod 4 for tool schema conversion.
import { z } from 'npm:zod@4.2.0';
import { authenticateMcpRequest, type IntegrationIdentity, writeMcpLog } from '../_shared/integration-auth.ts';
import { HttpError } from '../_shared/http.ts';
import { createChangeProposal, getChangeProposal } from '../_shared/proposals.ts';

const SERVER_INFO = { name: 'todolist-mcp', version: '1.0.0' };
const TOOL_SCOPE = { read: 'review:read', proposal: 'proposal:write' } as const;
const READ_ONLY_TOOL = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;
const PROPOSAL_TOOL = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const;

function requireScope(identity: IntegrationIdentity, scope: string) {
  if (!identity.scopes.includes(scope)) throw new HttpError(403, 'integration_scope_required', '集成令牌没有执行此操作的权限');
}

function jsonToolResult(value: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value) }],
    structuredContent: value as Record<string, unknown>,
  };
}

async function withLog<T>(identity: IntegrationIdentity | null, toolName: string, handler: () => Promise<{ value: T; count?: number }>) {
  if (!identity) throw new HttpError(401, 'invalid_integration_token', '此 MCP 操作需要 TodoList 集成令牌');
  const startedAt = performance.now();
  try {
    const result = await handler();
    await writeMcpLog(identity, { toolName, status: 'succeeded', startedAt, resultCount: result.count || 0 });
    return jsonToolResult(result.value);
  } catch (error) {
    const denied = error instanceof HttpError && (error.status === 401 || error.status === 403);
    await writeMcpLog(identity, { toolName, status: denied ? 'denied' : 'failed', startedAt });
    throw error;
  }
}

async function loadIdentity(request: Request): Promise<IntegrationIdentity | null> {
  if (!request.headers.get('authorization')) return null;
  return authenticateMcpRequest(request);
}

function makeServer(identity: IntegrationIdentity | null) {
  const server = new McpServer(SERVER_INFO);

  server.registerTool('search_context', {
    title: 'Search TodoList context',
    description: 'Search the complete TodoList history and confirmed memories without modifying tasks.',
    annotations: READ_ONLY_TOOL,
    inputSchema: {
      search_terms: z.array(z.string().min(1).max(80)).max(8).optional(),
      date_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
      date_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
      source_types: z.array(z.enum(['todo', 'goal', 'completion_review', 'daily_review', 'work_review', 'memory'])).max(6).optional(),
      limit: z.number().int().min(1).max(80).optional(),
    },
  }, async args => withLog(identity, 'search_context', async () => {
    requireScope(identity, TOOL_SCOPE.read);
    const { data, error } = await identity.serviceClient.rpc('search_ai_context_for_user', {
      p_user_id: identity.userId,
      p_search_terms: args.search_terms || [],
      p_start_date: args.date_start || null,
      p_end_date: args.date_end || null,
      p_types: (args.source_types && args.source_types.length ? args.source_types : ['todo', 'goal', 'completion_review', 'daily_review', 'work_review', 'memory']).map(type => type === 'goal' ? 'completion_goal' : type),
      p_limit: args.limit || 80,
    });
    if (error) throw new HttpError(500, 'context_search_failed', '无法检索 TodoList 记录');
    const sources = (data || []).map(row => {
      const source_type = row.source_type === 'completion_goal' ? 'goal' : row.source_type;
      return { ...row, source_type, ref: `${source_type}:${row.source_id}` };
    });
    return { value: { schema_version: '1.0', sources, limitations: sources.length >= (args.limit || 80) ? ['结果可能已按单轮上限裁剪。'] : [] }, count: sources.length };
  }));

  server.registerTool('list_tasks', {
    title: 'List TodoList tasks',
    description: 'List owned tasks with optional completion and planned-date filters.',
    annotations: READ_ONLY_TOOL,
    inputSchema: {
      status: z.enum(['all', 'open', 'completed']).optional(),
      planned_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
      category_id: z.string().uuid().nullable().optional(),
      limit: z.number().int().min(1).max(100).optional(),
    },
  }, async args => withLog(identity, 'list_tasks', async () => {
    requireScope(identity, TOOL_SCOPE.read);
    let query = identity.serviceClient.from('todos')
      .select('id,text,description,parent_id,category_id,is_completed,planned_date,position,created_at,completed_at,updated_at')
      .eq('user_id', identity.userId).order('planned_date', { ascending: true, nullsFirst: false }).order('position', { ascending: true })
      .limit(args.limit || 50);
    if (args.status === 'open') query = query.eq('is_completed', false);
    if (args.status === 'completed') query = query.eq('is_completed', true);
    if (args.planned_date) query = query.eq('planned_date', args.planned_date);
    if (args.category_id) query = query.eq('category_id', args.category_id);
    const { data, error } = await query;
    if (error) throw new HttpError(500, 'task_list_failed', '无法读取 TodoList 任务');
    return { value: { tasks: data || [] }, count: data?.length || 0 };
  }));

  server.registerTool('get_task', {
    title: 'Get a TodoList task',
    description: 'Read one owned task, its children, completion goals, and task evaluations.',
    annotations: READ_ONLY_TOOL,
    inputSchema: { task_id: z.string().uuid() },
  }, async args => withLog(identity, 'get_task', async () => {
    requireScope(identity, TOOL_SCOPE.read);
    const { data: task, error } = await identity.serviceClient.from('todos')
      .select('id,text,description,parent_id,category_id,is_completed,planned_date,position,created_at,completed_at,updated_at')
      .eq('id', args.task_id).eq('user_id', identity.userId).maybeSingle();
    if (error) throw new HttpError(500, 'task_load_failed', '无法读取任务');
    if (!task) throw new HttpError(404, 'task_not_found', '任务不存在');
    const [{ data: children }, { data: goals }, { data: reviews }] = await Promise.all([
      identity.serviceClient.from('todos').select('id,text,description,is_completed,planned_date,position,updated_at')
        .eq('user_id', identity.userId).eq('parent_id', args.task_id).order('position'),
      identity.serviceClient.from('todo_completion_goals').select('id,target_date,content,created_at,updated_at')
        .eq('user_id', identity.userId).eq('todo_id', args.task_id).order('target_date', { ascending: false }),
      identity.serviceClient.from('todo_completion_reviews').select('id,review_date,result,content,goal_content_snapshot,created_at,updated_at')
        .eq('user_id', identity.userId).eq('todo_id', args.task_id).order('review_date', { ascending: false }),
    ]);
    return { value: { task, children: children || [], completion_goals: goals || [], completion_reviews: reviews || [] }, count: 1 };
  }));

  server.registerTool('list_memories', {
    title: 'List confirmed memories',
    description: 'List enabled or disabled long-term memories owned by the current user.',
    annotations: READ_ONLY_TOOL,
    inputSchema: { status: z.enum(['enabled', 'disabled', 'all']).optional(), limit: z.number().int().min(1).max(50).optional() },
  }, async args => withLog(identity, 'list_memories', async () => {
    requireScope(identity, TOOL_SCOPE.read);
    let query = identity.serviceClient.from('ai_memories').select('id,content,kind,status,source_message_id,created_at,updated_at,confirmed_at,disabled_at')
      .eq('user_id', identity.userId).order('updated_at', { ascending: false }).limit(args.limit || 30);
    if (args.status && args.status !== 'all') query = query.eq('status', args.status);
    const { data, error } = await query;
    if (error) throw new HttpError(500, 'memory_list_failed', '无法读取长期记忆');
    return { value: { memories: data || [] }, count: data?.length || 0 };
  }));

  server.registerTool('create_change_proposal', {
    title: 'Create a TodoList change proposal',
    description: 'Save up to 10 reviewed task changes for web confirmation. This never modifies tasks directly.',
    annotations: PROPOSAL_TOOL,
    inputSchema: {
      title: z.string().min(1).max(120),
      summary: z.string().max(1000).optional(),
      stable_id: z.string().uuid().optional(),
      items: z.array(z.object({
        operation: z.enum(['reschedule_task', 'create_task', 'create_subtask', 'set_completion_goal']),
        target_todo_id: z.string().uuid().nullable().optional(),
        expected_updated_at: z.string().nullable().optional(),
        payload: z.record(z.string(), z.unknown()),
        reason: z.string().min(1).max(1000),
        evidence_refs: z.array(z.string().max(100)).max(30).optional(),
        idempotency_key: z.string().uuid().optional(),
      })).min(1).max(10),
    },
  }, async args => withLog(identity, 'create_change_proposal', async () => {
    requireScope(identity, TOOL_SCOPE.proposal);
    const proposal = await createChangeProposal(identity.serviceClient, {
      userId: identity.userId, source: 'codex_mcp', sourceTokenId: identity.tokenId,
      title: args.title, summary: args.summary, stableId: args.stable_id, items: args.items,
    });
    return { value: { proposal, confirmation_url: `${Deno.env.get('PUBLIC_APP_URL') || ''}#ai-companion/proposals/${proposal.id}` }, count: proposal.items.length };
  }));

  server.registerTool('get_change_proposal', {
    title: 'Get a TodoList change proposal',
    description: 'Read a saved proposal and its per-item execution state.',
    annotations: READ_ONLY_TOOL,
    inputSchema: { proposal_id: z.string().uuid() },
  }, async args => withLog(identity, 'get_change_proposal', async () => {
    requireScope(identity, TOOL_SCOPE.read);
    const proposal = await getChangeProposal(identity.serviceClient, identity.userId, args.proposal_id);
    return { value: { proposal, confirmation_url: `${Deno.env.get('PUBLIC_APP_URL') || ''}#ai-companion/proposals/${proposal.id}` }, count: proposal.items.length };
  }));

  return server;
}

const handler = createMcpHandler(async context => {
  const request = context.requestInfo;
  if (!request) throw new HttpError(401, 'invalid_integration_token', '缺少集成令牌');
  const identity = await loadIdentity(request);
  return makeServer(identity);
}, { legacy: 'stateless', responseMode: 'auto' });

function mcpPublicUrl(request?: Request) {
  const configured = Deno.env.get('MCP_PUBLIC_URL')?.trim();
  if (configured) return configured.replace(/\/$/, '');
  if (request) {
    const url = new URL(request.url);
    const marker = '/functions/v1/todolist-mcp';
    if (url.pathname.includes(marker)) return `${url.origin}${marker}`;
  }
  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.replace(/\/$/, '') || '';
  return `${supabaseUrl}/functions/v1/todolist-mcp`;
}

function resourceMetadataUrl(request?: Request) {
  return `${mcpPublicUrl(request)}/oauth-protected-resource`;
}

function oauthResourceMetadata(request: Request) {
  const path = new URL(request.url).pathname.replace(/\/$/, '');
  if (!path.endsWith('/oauth-protected-resource')) return null;
  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.replace(/\/$/, '') || '';
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=300',
    'Access-Control-Allow-Origin': '*',
  });
  if (request.method === 'HEAD') return new Response(null, { status: 200, headers });
  if (request.method !== 'GET') return new Response(null, { status: 405, headers: { ...Object.fromEntries(headers), Allow: 'GET, HEAD' } });
  return new Response(JSON.stringify({
    resource: mcpPublicUrl(request),
    authorization_servers: [`${supabaseUrl}/auth/v1`],
    scopes_supported: ['email', 'profile'],
    resource_name: 'TodoList MCP',
  }), { status: 200, headers });
}

function authChallenge(request: Request, error: HttpError) {
  const description = error.status === 403 ? 'Insufficient scope' : 'Authorization required';
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Expose-Headers': 'WWW-Authenticate',
    'WWW-Authenticate': `Bearer error="invalid_token", error_description="${description}", scope="email profile", resource_metadata="${resourceMetadataUrl(request)}"`,
  });
  return new Response(JSON.stringify({ error: 'invalid_token', error_description: error.message }), { status: error.status, headers });
}

Deno.serve(async request => {
  const metadataResponse = oauthResourceMetadata(request);
  if (metadataResponse) return metadataResponse;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: {
    'Access-Control-Allow-Origin': request.headers.get('origin') || '*',
    'Access-Control-Allow-Headers': 'authorization, content-type, mcp-protocol-version, mcp-session-id',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Expose-Headers': 'WWW-Authenticate',
  } });
  try {
    if (!request.headers.get('authorization')) {
      return authChallenge(request, new HttpError(401, 'invalid_integration_token', '缺少集成令牌'));
    }
    try {
      await authenticateMcpRequest(request);
    } catch (error) {
      if (error instanceof HttpError) return authChallenge(request, error);
      throw error;
    }
    const response = await handler.fetch(request);
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', 'no-store');
    return new Response(response.body, { status: response.status, headers });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    return new Response(JSON.stringify({ error: { code: error instanceof HttpError ? error.code : 'mcp_error', message: error instanceof Error ? error.message : 'MCP 请求失败' } }), {
      status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
});
