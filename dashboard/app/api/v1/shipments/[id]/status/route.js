import { NextResponse } from 'next/server';
import { adminDb } from '../../../../../../lib/firebase-admin.js';
import { verifyApiKey } from '../../../_auth.js';

const ALLOWED_STATUS = new Set(['active', 'delayed', 'rerouted', 'delivered', 'cancelled']);

export async function PATCH(req, context) {
  const auth = await verifyApiKey(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await context.params;
  const { status } = await req.json();

  if (!ALLOWED_STATUS.has(status)) {
    return NextResponse.json({ error: 'Invalid status value' }, { status: 400 });
  }

  const ref = adminDb.collection('shipments').doc(id);
  const existing = await ref.get();
  if (!existing.exists) {
    return NextResponse.json({ error: 'Shipment not found' }, { status: 404 });
  }

  const shipment = existing.data();
  if (shipment.orgId && shipment.orgId !== auth.auth.orgId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const updatedAt = new Date().toISOString();
  await ref.update({ status, updatedAt });

  await auth.supabase.from('shipments').update({ status, updated_at: updatedAt }).eq('id', id).then(() => null).catch(() => null);

  return NextResponse.json({ data: { id, status, updatedAt } });
}
