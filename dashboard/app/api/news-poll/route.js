import { NextResponse } from 'next/server';

export async function POST() {
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