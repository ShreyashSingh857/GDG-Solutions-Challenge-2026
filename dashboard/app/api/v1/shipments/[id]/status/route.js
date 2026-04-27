import { NextResponse } from 'next/server';
import { adminDb } from '../../../../../../lib/firebase-admin.js';
import { verifyApiKey } from '../../../_auth.js';
import { handleOptions, withCors } from '../../../_cors.js';

const ALLOWED_STATUS = new Set(['active', 'delayed', 'rerouted', 'delivered', 'cancelled']);

export async function OPTIONS(req) {
  return handleOptions(req);
}

export async function PATCH(req, context) {
  const auth = await verifyApiKey(req);
  if (!auth.ok) return withCors(NextResponse.json({ error: auth.error }, { status: auth.status }), req);

  const { id } = await context.params;
  const { status } = await req.json();

  if (!ALLOWED_STATUS.has(status)) {
    return withCors(NextResponse.json({ error: 'Invalid status value' }, { status: 400 }), req);
  }

  const ref = adminDb.collection('shipments').doc(id);
  const existing = await ref.get();
  if (!existing.exists) {
    return withCors(NextResponse.json({ error: 'Shipment not found' }, { status: 404 }), req);
  }

  const shipment = existing.data();
  if (shipment.orgId && shipment.orgId !== auth.auth.orgId) {
    return withCors(NextResponse.json({ error: 'Not found' }, { status: 404 }), req);
  }

  const updatedAt = new Date().toISOString();
  await ref.update({ status, updatedAt });

  await auth.supabase.from('shipments').update({ status, updated_at: updatedAt }).eq('id', id).then(() => null).catch(() => null);

  return withCors(NextResponse.json({ data: { id, status, updatedAt } }), req);
}
