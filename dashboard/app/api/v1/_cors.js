const ALLOWED_ORIGINS = (process.env.CORS_ALLOWED_ORIGINS || '*')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

function resolveOrigin(req) {
  const requestOrigin = req?.headers?.get('origin') || '';
  if (!requestOrigin) return '*';
  if (ALLOWED_ORIGINS.includes('*')) return '*';
  return ALLOWED_ORIGINS.includes(requestOrigin) ? requestOrigin : 'null';
}

export function corsHeaders(req) {
  return {
    'Access-Control-Allow-Origin': resolveOrigin(req),
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-api-key, Authorization, x-org-id',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export function handleOptions(req) {
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}

export function withCors(response, req) {
  const headers = new Headers(response.headers);
  Object.entries(corsHeaders(req)).forEach(([key, value]) => headers.set(key, value));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}