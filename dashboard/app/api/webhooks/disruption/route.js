import { db } from '../../../../lib/firebase-admin.js'; // server-side admin import

/**
 * POST /api/webhooks/disruption
 * Receives pushes from the event bus and writes them to Firestore.
 * The dashboard's Firestore real-time listeners then push updates to the UI automatically.
 */
export async function POST(req) {
  try {
    const body = await req.json();
    const { agentId, traceId, timestamp, payload } = body;

    if (!agentId || !traceId || !payload) {
      return Response.json({ error: 'Invalid payload' }, { status: 400 });
    }

    // Route to the correct Firestore collection based on which agent sent this
    let collection;
    if (agentId === 'monitor') collection = 'disruptions';
    else if (agentId === 'impact') collection = 'impactReports';
    else if (agentId === 'resolution') collection = 'resolutions';
    else {
      return Response.json({ error: `Unknown agentId: ${agentId}` }, { status: 400 });
    }

    // Use traceId as the document ID for idempotency - duplicate pushes won't create duplicate docs
    await db.collection(collection).doc(traceId).set({
      ...payload,
      agentId,
      traceId,
      receivedAt: new Date().toISOString(),
    }, { merge: true });

    return Response.json({ ok: true, collection, traceId });
  } catch (err) {
    console.error('[WebhookDisruption] Error:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
