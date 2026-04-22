import { NextResponse } from 'next/server';

function getBearerToken(req) {
  const authorization = req.headers.get('authorization') || '';
  if (authorization.toLowerCase().startsWith('bearer ')) {
    return authorization.slice(7).trim();
  }
  return '';
}

export function verifyInternalToken(req, { allowInDevelopment = true } = {}) {
  const expected = process.env.INTERNAL_TOKEN;
  if (!expected) {
    return NextResponse.json({ error: 'INTERNAL_TOKEN is not configured' }, { status: 503 });
  }

  if (allowInDevelopment && process.env.NODE_ENV === 'development') {
    return null;
  }

  const token = getBearerToken(req) || (req.headers.get('x-internal-token') || '').trim();
  if (!token || token !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return null;
}