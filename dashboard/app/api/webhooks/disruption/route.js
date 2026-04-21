import { NextResponse } from 'next/server';
import { db } from '../../../../lib/firebase-admin.js'; // server-side admin import

const SCENARIO_MAP = {
  suez_closure: 'The Suez Canal Authority has announced an emergency closure. Houthi missile attacks on Red Sea vessels. Forty-three vessels held. $12B daily trade affected. Minimum 21-day closure expected. All Asia-Europe shipments via southern route ordered to divert via Cape of Good Hope.',
  pacific_storm: 'Super Typhoon approaching Western Pacific, Category 5. Maximum sustained winds 185 km/h. Direct path over major trans-Pacific shipping corridors. 12 vessels currently in projected storm path between Japan and Los Angeles. Port of Yokohama issuing storm warnings.',
  port_strike: 'International Transport Workers Federation confirms indefinite strike action at Port of Rotterdam, Hamburg, and Antwerp. All container terminal operations suspended. 80+ vessels at anchor awaiting berth. Estimated 2-week minimum disruption to Europe-bound cargo.',
};

/**
 * POST /api/webhooks/disruption
 * Receives pushes from the event bus and writes them to Firestore.
 * The dashboard's Firestore real-time listeners then push updates to the UI automatically.
 */
export async function POST(req) {
  try {
    const body = await req.json();

    if (body.scenario) {
      const description = SCENARIO_MAP[body.scenario];
      if (!description) {
        return NextResponse.json({ error: `Unknown scenario: ${body.scenario}` }, { status: 400 });
      }

      const disruptionUrl = process.env.DISRUPTION_AGENT_URL || 'http://localhost:3001';
      const upstream = await fetch(`${disruptionUrl}/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(process.env.INTERNAL_TOKEN ? { Authorization: `Bearer ${process.env.INTERNAL_TOKEN}` } : {}),
        },
        body: JSON.stringify({ description }),
        signal: AbortSignal.timeout(15_000),
      });

      const result = await upstream.json().catch(() => ({}));
      return NextResponse.json({ ok: upstream.ok, scenario: body.scenario, ...result }, { status: upstream.status });
    }

    const { agentId, traceId, timestamp, payload } = body;

    if (!agentId || !traceId || !payload) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    // Route to the correct Firestore collection based on which agent sent this
    let collection;
    if (agentId === 'monitor') collection = 'disruptions';
    else if (agentId === 'impact') collection = 'impactReports';
    else if (agentId === 'resolution') collection = 'resolutions';
    else {
      return NextResponse.json({ error: `Unknown agentId: ${agentId}` }, { status: 400 });
    }

    // Use traceId as the document ID for idempotency - duplicate pushes won't create duplicate docs
    await db.collection(collection).doc(traceId).set({
      ...payload,
      agentId,
      traceId,
      receivedAt: new Date().toISOString(),
    }, { merge: true });

    return NextResponse.json({ ok: true, collection, traceId });
  } catch (err) {
    console.error('[WebhookDisruption] Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
