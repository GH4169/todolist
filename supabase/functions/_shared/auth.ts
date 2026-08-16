import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2';
import { HttpError } from './http.ts';

export type AuthenticatedClients = {
  user: User;
  userClient: SupabaseClient;
  serviceClient: SupabaseClient;
};

function requireEnvironment(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new HttpError(503, 'service_not_configured', `服务缺少 ${name} 配置`);
  return value;
}

export async function getAuthenticatedClients(request: Request): Promise<AuthenticatedClients> {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) {
    throw new HttpError(401, 'unauthorized', '请先登录');
  }

  const supabaseUrl = requireEnvironment('SUPABASE_URL');
  const anonKey = requireEnvironment('SUPABASE_ANON_KEY');
  const serviceRoleKey = requireEnvironment('SUPABASE_SERVICE_ROLE_KEY');
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) throw new HttpError(401, 'unauthorized', '登录状态已失效，请重新登录');

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { user: data.user, userClient, serviceClient };
}
