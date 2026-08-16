import { getAuthenticatedClients } from '../_shared/auth.ts';
import { createIntegrationTokenValue, hashIntegrationToken } from '../_shared/integration-auth.ts';
import { errorResponse, HttpError, jsonResponse, optionsResponse, readJsonBody } from '../_shared/http.ts';

const ALLOWED_SCOPES = new Set(['review:read', 'proposal:write']);

function publicToken(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    token_prefix: row.token_prefix,
    scopes: row.scopes,
    expires_at: row.expires_at,
    last_used_at: row.last_used_at,
    revoked_at: row.revoked_at,
    created_at: row.created_at,
  };
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return optionsResponse(request);
  try {
    const clients = await getAuthenticatedClients(request);
    if (request.method === 'GET') {
      const { data, error } = await clients.serviceClient.from('integration_tokens')
        .select('id,name,token_prefix,scopes,expires_at,last_used_at,revoked_at,created_at')
        .eq('user_id', clients.user.id).order('created_at', { ascending: false });
      if (error) throw new HttpError(500, 'token_list_failed', '无法读取集成令牌');
      return jsonResponse(request, { tokens: (data || []).map(publicToken), max_active_tokens: 5 });
    }

    const body = await readJsonBody(request) as Record<string, unknown>;
    if (request.method === 'POST') {
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name || name.length > 80) throw new HttpError(400, 'invalid_token_name', '令牌名称需要在 1 到 80 个字符之间');
      const scopes = Array.isArray(body.scopes) && body.scopes.length
        ? [...new Set(body.scopes.filter(value => typeof value === 'string' && ALLOWED_SCOPES.has(value)))]
        : ['review:read', 'proposal:write'];
      if (!scopes.length) throw new HttpError(400, 'invalid_token_scopes', '至少选择一个有效权限');
      const { count, error: countError } = await clients.serviceClient.from('integration_tokens')
        .select('id', { count: 'exact', head: true }).eq('user_id', clients.user.id)
        .is('revoked_at', null).gt('expires_at', new Date().toISOString());
      if (countError) throw new HttpError(500, 'token_limit_check_failed', '无法检查令牌数量');
      if ((count || 0) >= 5) throw new HttpError(409, 'active_token_limit', '最多保留 5 个有效集成令牌');

      const token = createIntegrationTokenValue();
      const tokenHash = await hashIntegrationToken(token);
      const expiresAt = new Date(Date.now() + 90 * 86400000).toISOString();
      const { data, error } = await clients.serviceClient.from('integration_tokens').insert({
        user_id: clients.user.id,
        name,
        token_prefix: token.slice(0, 12),
        token_hash: tokenHash,
        scopes,
        expires_at: expiresAt,
      }).select('id,name,token_prefix,scopes,expires_at,last_used_at,revoked_at,created_at').single();
      if (error || !data) throw new HttpError(500, 'token_create_failed', '无法创建集成令牌');
      return jsonResponse(request, { token, token_record: publicToken(data), shown_once: true }, 201);
    }

    if (request.method === 'DELETE') {
      const tokenId = typeof body.token_id === 'string' ? body.token_id : '';
      if (!tokenId) throw new HttpError(400, 'token_id_required', '请选择要撤销的令牌');
      const { data, error } = await clients.serviceClient.from('integration_tokens').update({
        revoked_at: new Date().toISOString(),
      }).eq('id', tokenId).eq('user_id', clients.user.id).is('revoked_at', null)
        .select('id,name,token_prefix,scopes,expires_at,last_used_at,revoked_at,created_at').maybeSingle();
      if (error) throw new HttpError(500, 'token_revoke_failed', '无法撤销集成令牌');
      if (!data) throw new HttpError(404, 'token_not_found', '令牌不存在或已撤销');
      return jsonResponse(request, { token_record: publicToken(data) });
    }
    throw new HttpError(405, 'method_not_allowed', '不支持的请求方法');
  } catch (error) {
    return errorResponse(request, error);
  }
});
