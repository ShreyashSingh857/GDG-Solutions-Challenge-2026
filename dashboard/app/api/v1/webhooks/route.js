import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { verifyApiKey } from '../_auth.js';

export async function POST(req) {
  const auth = await verifyApiKey(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json();
  if (!body?.url) {
    return NextResponse.json({ error: 'url is required' }, { status: 400 });
  }

  const event = body.event || 'resolution.ready';
  if (event !== 'resolution.ready') {
    return NextResponse.json({ error: 'Unsupported event type' }, { status: 400 });
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: { ...data, secret } }, { status: 201 });
}
