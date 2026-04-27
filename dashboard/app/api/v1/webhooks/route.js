import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { verifyApiKey } from '../_auth.js';
import { handleOptions, withCors } from '../_cors.js';

export async function OPTIONS(req) {
  return handleOptions(req);
}

export async function POST(req) {
  const auth = await verifyApiKey(req);
  if (!auth.ok) return withCors(NextResponse.json({ error: auth.error }, { status: auth.status }), req);

  const body = await req.json();
  if (!body?.url) {
    return withCors(NextResponse.json({ error: 'url is required' }, { status: 400 }), req);
  }

  const event = body.event || 'resolution.ready';
  if (event !== 'resolution.ready') {
    return withCors(NextResponse.json({ error: 'Unsupported event type' }, { status: 400 }), req);
  }

  const secret = body.secret || crypto.randomBytes(24).toString('hex');

  const { data, error } = await auth.supabase
    .from('outbound_webhooks')
    .insert({
      org_id: auth.auth.orgId,
      event,
      url: body.url,
      secret,
      active: true,
    })
    .select('id,url,event,active,created_at')
    .single();

  if (error) {
    return withCors(NextResponse.json({ error: error.message }, { status: 500 }), req);
  }

  return withCors(NextResponse.json({ data: { ...data, secret } }, { status: 201 }), req);
}
