import { NextResponse } from 'next/server';
import { verifyApiKey } from '../../_auth.js';
import { handleOptions, withCors } from '../../_cors.js';

export async function OPTIONS(req) {
  return handleOptions(req);
}

export async function DELETE(req, context) {
  const auth = await verifyApiKey(req);
  if (!auth.ok) return withCors(NextResponse.json({ error: auth.error }, { status: auth.status }), req);

  const { id } = await context.params;
  const { error } = await auth.supabase
    .from('outbound_webhooks')
    .delete()
    .eq('id', id)
    .eq('org_id', auth.auth.orgId);

  if (error) {
    return withCors(NextResponse.json({ error: error.message }, { status: 500 }), req);
  }

  return withCors(NextResponse.json({ data: { id, deleted: true } }), req);
}
