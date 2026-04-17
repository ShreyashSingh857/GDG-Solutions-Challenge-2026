import { db } from '../../../../lib/firebase-admin.js';

/**
 * PATCH /api/shipments/:id
 * Updates a shipment document with partial fields.
 */
export async function PATCH(req, { params }) {
  try {
    const { id } = await params;
    const patch = await req.json();

    if (!id) {
      return Response.json({ data: null, error: 'Missing shipment id' }, { status: 400 });
    }

    await db.collection('shipments').doc(id).set({ ...patch, updatedAt: new Date().toISOString() }, { merge: true });
    const updatedDoc = await db.collection('shipments').doc(id).get();

    return Response.json({ data: { id: updatedDoc.id, ...updatedDoc.data() }, error: null });
  } catch (err) {
    console.error('[ShipmentByIdRoute] PATCH failed:', err.message);
    return Response.json({ data: null, error: err.message }, { status: 400 });
  }
}

/**
 * DELETE /api/shipments/:id
 * Deletes a shipment document.
 */
export async function DELETE(_req, { params }) {
  try {
    const { id } = await params;

    if (!id) {
      return Response.json({ data: null, error: 'Missing shipment id' }, { status: 400 });
    }

    await db.collection('shipments').doc(id).delete();
    return Response.json({ data: { id, deleted: true }, error: null });
  } catch (err) {
    console.error('[ShipmentByIdRoute] DELETE failed:', err.message);
    return Response.json({ data: null, error: err.message }, { status: 400 });
  }
}
