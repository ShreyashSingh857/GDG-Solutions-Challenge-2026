import { NextResponse } from 'next/server';
import { adminDb } from '../../../../../lib/firebase-admin.js';
import { verifyApiKey } from '../../_auth.js';

export async function GET(req, context) {
  const auth = await verifyApiKey(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await context.params;
  const doc = await adminDb.collection('shipments').doc(id).get();
  if (!doc.exists) {
    return NextResponse.json({ error: 'Shipment not found' }, { status: 404 });
  }

  const shipment = { id: doc.id, ...doc.data() };
  if (shipment.orgId && shipment.orgId !== auth.auth.orgId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ data: shipment });
}
