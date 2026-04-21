import { NextResponse } from 'next/server';
import { verifyApiKey } from '../../_auth.js';

export async function DELETE(req, context) {
  const auth = await verifyApiKey(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await context.params;
  const { error } = await auth.supabase
    .from('outbound_webhooks')
    .delete()
    .eq('id', id)
    .eq('org_id', auth.auth.orgId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: { id, deleted: true } });
}
