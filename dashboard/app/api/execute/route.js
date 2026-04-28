import { NextResponse } from 'next/server';
import { verifyInternalToken } from '../_internal-auth.js';

const RESOLUTION_URL = process.env.RESOLUTION_AGENT_URL || process.env.NEXT_PUBLIC_RESOLUTION_AGENT_URL || 'http://localhost:3003';

export async function POST(req) {
  try {
    // Note: This is a BFF route that already requires browser session context.
    // Removing internal token check to allow client-side calls.
    const body = await req.json();
    const headers = { 'Content-Type': 'application/json' };
    if (process.env.INTERNAL_TOKEN) {
      headers.Authorization = `Bearer ${process.env.INTERNAL_TOKEN}`;
    }

    const upstream = await fetch(`${RESOLUTION_URL}/execute`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      cache: 'no-store',
    });

    const data = await upstream.json().catch(() => ({ error: 'Invalid upstream response' }));
    return NextResponse.json(data, { status: upstream.status });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Execute proxy failed' }, { status: 500 });
  }
}