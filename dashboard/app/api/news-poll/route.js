import { NextResponse } from 'next/server';
import { verifyInternalToken } from '../_internal-auth.js';

export async function POST(req) {
  const unauthorized = verifyInternalToken(req);
  if (unauthorized) return unauthorized;

  const newsUrl = process.env.NEWS_AGENT_URL || process.env.NEXT_PUBLIC_NEWS_AGENT_URL || 'http://localhost:3005';

  const upstream = await fetch(`${newsUrl}/news/poll`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.INTERNAL_TOKEN ? { Authorization: `Bearer ${process.env.INTERNAL_TOKEN}` } : {}),
    },
    body: '{}',
    signal: AbortSignal.timeout(35_000),
  });

  const data = await upstream.json().catch(() => ({}));
  return NextResponse.json(data, { status: upstream.status });
}