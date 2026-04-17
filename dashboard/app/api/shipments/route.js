import { db } from '../../../../lib/firebase-admin.js';
import { validateShipment } from '../../../../../shared/types/Shipment.js';

/**
 * GET /api/shipments
 * Returns all shipments sorted by createdAt desc (fallback: id asc).
 */
export async function GET() {
  try {
    const snapshot = await db.collection('shipments').get();
    const shipments = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    shipments.sort((a, b) => {
      if (a.createdAt && b.createdAt) return String(b.createdAt).localeCompare(String(a.createdAt));
      return String(a.id).localeCompare(String(b.id));
    });

    return Response.json({ data: shipments, error: null });
  } catch (err) {
    console.error('[ShipmentsRoute] GET failed:', err.message);
    return Response.json({ data: null, error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/shipments
 * Creates a new shipment document.
 */
export async function POST(req) {
  try {
    const body = await req.json();
    const payload = {
      ...body,
      id: body?.id || `ship-${crypto.randomUUID()}`,
      createdAt: body?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const valid = validateShipment(payload);
    await db.collection('shipments').doc(valid.id).set(valid, { merge: true });

    return Response.json({ data: valid, error: null }, { status: 201 });
  } catch (err) {
    console.error('[ShipmentsRoute] POST failed:', err.message);
    return Response.json({ data: null, error: err.message }, { status: 400 });
  }
}
