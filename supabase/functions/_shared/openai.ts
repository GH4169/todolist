import { HttpError } from './http.ts';

const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';

function isPrivateOrLocalHostname(hostname: string) {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (
    host === 'localhost'
    || host.endsWith('.localhost')
    || host.endsWith('.local')
    || host.endsWith('.internal')
    || host.endsWith('.lan')
    || host === '0.0.0.0'
    || host === '::1'
    || host === '[::1]'
  ) return true;
  const ipv6 = host.replace(/^\[|\]$/g, '');
  if (ipv6.includes(':')) return true;
  const ipv4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!ipv4) return false;
  const [first, second] = ipv4.slice(1).map(Number);
  return first === 10
    || first === 127
    || first === 169 && second === 254
    || first === 172 && second >= 16 && second <= 31
    || first === 192 && second === 168
    || first === 100 && second >= 64 && second <= 127
    || first === 192 && second === 0
    || first === 198 && (second === 18 || second === 19)
    || first >= 224;
}

function isAllowedProviderHost(hostname: string) {
  const configured = (Deno.env.get('AI_PROVIDER_ALLOWED_HOSTS') || '')
    .split(',')
    .map(value => value.trim().toLowerCase())
    .filter(Boolean);
  if (configured.length === 0) return true;
  const host = hostname.toLowerCase();
  return configured.some(allowed => allowed.startsWith('.') ? host.endsWith(allowed) : host === allowed);
}

export function normalizeOpenAiBaseUrl(value: unknown, errorStatus = 400) {
  const configured = typeof value === 'string' && value.trim()
    ? value.trim()
    : DEFAULT_OPENAI_BASE_URL;
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new HttpError(errorStatus, 'invalid_provider_config', 'AI 模型服务地址配置无效');
  }
  if (
    url.protocol !== 'https:'
    || url.username
    || url.password
    || url.search
    || url.hash
    || isPrivateOrLocalHostname(url.hostname)
    || !isAllowedProviderHost(url.hostname)
  ) {
    throw new HttpError(errorStatus, 'invalid_provider_config', 'AI 模型服务地址必须是安全的 HTTPS 地址');
  }
  const basePath = url.pathname.replace(/\/+$/, '') || '/v1';
  return `${url.origin}${basePath}`;
}

export function getOpenAiEndpoint(baseUrl: unknown, path: string) {
  const normalizedBaseUrl = normalizeOpenAiBaseUrl(baseUrl, 503);
  const endpointPath = path.replace(/^\/+/, '');
  return `${normalizedBaseUrl}/${endpointPath}`;
}
