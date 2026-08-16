import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { HttpError } from './http.ts';

function requireEnvironment(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new HttpError(503, 'service_not_configured', `服务缺少 ${name} 配置`);
  return value;
}

function base64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function createIntegrationTokenValue() {
  return `tdl_${base64Url(crypto.getRandomValues(new Uint8Array(32)))}`;
}

export async function hashIntegrationToken(token: string) {
  const pepper = requireEnvironment('INTEGRATION_TOKEN_PEPPER');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${pepper}:${token}`));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function createServiceClient() {
  return createClient(requireEnvironment('SUPABASE_URL'), requireEnvironment('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type IntegrationIdentity = {
  userId: string;
  tokenId: string;
  scopes: string[];
  serviceClient: SupabaseClient;
};

function tokenFromAuthorization(authorization: string | null) {
  if (!authorization) return '';
  if (authorization.startsWith('Bearer ')) return authorization.slice(7).trim();
  if (authorization.startsWith('Basic ')) {
    try {
      const decoded = atob(authorization.slice(6).trim());
      const separator = decoded.indexOf(':');
      // Gemini's advanced MCP credentials are sent as HTTP Basic auth. The
      // integration token is the client secret; the client id is ignored.
      return separator >= 0 ? decoded.slice(separator + 1).trim() : '';
    } catch {
      return '';
    }
  }
  return '';
}

export async function authenticateIntegrationToken(request: Request, requiredScope?: string): Promise<IntegrationIdentity> {
  const token = tokenFromAuthorization(request.headers.get('authorization'));
  if (!token.startsWith('tdl_') || token.length < 30 || token.length > 100) {
    throw new HttpError(401, 'invalid_integration_token', '集成令牌无效或已过期');
  }
  const serviceClient = createServiceClient();
  const tokenHash = await hashIntegrationToken(token);
  const { data, error } = await serviceClient.from('integration_tokens')
    .select('id,user_id,scopes,expires_at,revoked_at').eq('token_hash', tokenHash).maybeSingle();
  if (error || !data || data.revoked_at || new Date(data.expires_at).getTime() <= Date.now()) {
    throw new HttpError(401, 'invalid_integration_token', '集成令牌无效或已过期');
  }
  const scopes = Array.isArray(data.scopes) ? data.scopes : [];
  if (requiredScope && !scopes.includes(requiredScope)) {
    throw new HttpError(403, 'integration_scope_required', '集成令牌没有执行此操作的权限');
  }
  await serviceClient.from('integration_tokens').update({ last_used_at: new Date().toISOString() }).eq('id', data.id);
  return { userId: data.user_id, tokenId: data.id, scopes, serviceClient };
}

export async function writeMcpLog(identity: IntegrationIdentity | null, options: {
  toolName: string;
  status: 'succeeded' | 'failed' | 'denied';
  startedAt: number;
  resultCount?: number;
}) {
  if (!identity) return;
  await identity.serviceClient.from('mcp_request_logs').insert({
    user_id: identity.userId,
    integration_token_id: identity.tokenId,
    tool_name: options.toolName.slice(0, 80),
    status: options.status,
    duration_ms: Math.max(0, Math.round(performance.now() - options.startedAt)),
    result_count: Math.max(0, options.resultCount || 0),
  });
}
