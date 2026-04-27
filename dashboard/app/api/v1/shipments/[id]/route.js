import { NextResponse } from 'next/server';
import { adminDb } from '../../../../../lib/firebase-admin.js';
import { verifyApiKey } from '../../_auth.js';
import { handleOptions, withCors } from '../../_cors.js';

export async function OPTIONS(req) {
  return handleOptions(req);
}

export async function GET(req, context) {
  const auth = await verifyApiKey(req);
  if (!auth.ok) return withCors(NextResponse.json({ error: auth.error }, { status: auth.status }), req);

  const { id } = await context.params;
  const doc = await adminDb.collection('shipments').doc(id).get();
  if (!doc.exists) {
    return withCors(NextResponse.json({ error: 'Shipment not found' }, { status: 404 }), req);
  }

  const shipment = { id: doc.id, ...doc.data() };
  if (shipment.orgId && shipment.orgId !== auth.auth.orgId) {
    return withCors(NextResponse.json({ error: 'Not found' }, { status: 404 }), req);
  }

  return withCors(NextResponse.json({ data: shipment }), req);
}
