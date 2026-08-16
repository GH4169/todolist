const DEFAULT_ALLOWED_ORIGINS = [
  'https://gh4169.github.io',
  'http://localhost:3000',
  'http://localhost:4173',
  'http://localhost:8000',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:4173',
  'http://127.0.0.1:8000',
];

export class HttpError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

function getAllowedOrigins() {
  const configured = (Deno.env.get('ALLOWED_ORIGINS') || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...configured]);
}

export function getCorsHeaders(request: Request) {
  const origin = request.headers.get('origin');
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
  if (origin && getAllowedOrigins().has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

export function jsonResponse(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...getCorsHeaders(request),
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

export function optionsResponse(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && !getAllowedOrigins().has(origin)) {
    return jsonResponse(request, { error: { code: 'origin_not_allowed', message: '不允许的请求来源' } }, 403);
  }
  return new Response(null, { status: 204, headers: getCorsHeaders(request) });
}

export async function readJsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, 'invalid_json', '请求正文不是有效的 JSON');
  }
}

export function errorResponse(request: Request, error: unknown) {
  if (error instanceof HttpError) {
    return jsonResponse(request, { error: { code: error.code, message: error.message } }, error.status);
  }
  console.error('Unhandled Edge Function error', error instanceof Error ? error.name : typeof error);
  return jsonResponse(request, {
    error: { code: 'internal_error', message: '服务暂时不可用，请稍后重试' },
  }, 500);
}
