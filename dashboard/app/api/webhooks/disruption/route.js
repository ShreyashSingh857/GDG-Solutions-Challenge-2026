import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { db } from '../../../../lib/firebase-admin.js'; // server-side admin import
import { verifyInternalToken } from '../../_internal-auth.js';

const INJECT_TIMEOUT_MS = 15_000;
const EVENT_BUS_TIMEOUT_MS = 5_000;

const SCENARIO_MAP = {
  suez_closure: {
    description: 'The Suez Canal Authority has announced an emergency closure. Houthi missile attacks on Red Sea vessels. Forty-three vessels held. $12B daily trade affected. Minimum 21-day closure expected. All Asia-Europe shipments via southern route ordered to divert via Cape of Good Hope.',
    type: 'GEOPOLITICAL',
    severity: 9,
    location: 'Suez Canal / Red Sea',
    epicenterLat: 29.9668,
    epicenterLng: 32.5498,
    affectedZones: ['Red Sea', 'Gulf of Aden', 'Suez Canal'],
    confidence: 0.88,
  },
  pacific_storm: {
    description: 'Super Typhoon approaching Western Pacific, Category 5. Maximum sustained winds 185 km/h. Direct path over major trans-Pacific shipping corridors. 12 vessels currently in projected storm path between Japan and Los Angeles. Port of Yokohama issuing storm warnings.',
    type: 'WEATHER',
    severity: 8,
    location: 'Western Pacific Shipping Corridor',
    epicenterLat: 28.2,
    epicenterLng: 143.4,
    affectedZones: ['Western Pacific', 'North Pacific Route'],
    confidence: 0.86,
  },
  port_strike: {
    description: 'International Transport Workers Federation confirms indefinite strike action at Port of Rotterdam, Hamburg, and Antwerp. All container terminal operations suspended. 80+ vessels at anchor awaiting berth. Estimated 2-week minimum disruption to Europe-bound cargo.',
    type: 'STRIKE',
    severity: 7,
    location: 'North Sea Port Cluster',
    epicenterLat: 51.9225,
    epicenterLng: 4.4792,
    affectedZones: ['Rotterdam', 'Hamburg', 'Antwerp'],
    confidence: 0.83,
  },
};

function isTimeoutError(error) {
  const name = String(error?.name || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  return name.includes('timeout') || name.includes('abort') || message.includes('timeout') || message.includes('aborted');
}

async function parseUpstreamBody(response) {
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('application/json')) {
    return response.json().catch(() => null);
  }

  const text = await response.text().catch(() => '');
  if (!text) return null;
  return { message: text.slice(0, 500) };
}

function buildSyntheticDisruption(scenarioMeta) {
  return {
    id: `disruption-${randomUUID()}`,
    type: scenarioMeta.type,
    severity: scenarioMeta.severity,
    location: scenarioMeta.location,
    epicenterLat: scenarioMeta.epicenterLat,
    epicenterLng: scenarioMeta.epicenterLng,
    confidence: scenarioMeta.confidence,
    affectedZones: scenarioMeta.affectedZones,
    rawDescription: scenarioMeta.description,
    detectedAt: new Date().toISOString(),
    source: 'dashboard-webhook-fallback',
    unverified: false,
    corroboratingSources: 1,
  };
}

async function publishSyntheticDisruption(disruptionEvent, traceId) {
  const eventBusUrl = process.env.EVENT_BUS_URL || 'http://localhost:4000';
  const response = await fetch(`${eventBusUrl}/publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      topic: 'disruption-events',
      payload: {
        agentId: 'monitor',
        traceId,
        timestamp: new Date().toISOString(),
        payload: disruptionEvent,
      },
    }),
    signal: AbortSignal.timeout(EVENT_BUS_TIMEOUT_MS),
  });
  if (!response.ok) {
    const msg = await response.text().catch(() => '');
    throw new Error(`Event bus publish failed [${response.status}]${msg ? `: ${msg}` : ''}`);
  }
}

async function injectSyntheticDisruption(scenario, scenarioMeta, reason) {
  const traceId = randomUUID();
  const disruptionEvent = buildSyntheticDisruption(scenarioMeta);
  const results = await Promise.allSettled([
    db.collection('disruptions').doc(disruptionEvent.id).set(disruptionEvent, { merge: true }),
    publishSyntheticDisruption(disruptionEvent, traceId),
  ]);
  const persisted = results[0].status === 'fulfilled';
  const published = results[1].status === 'fulfilled';
  if (!persisted && !published) {
    const persistErr = results[0].reason?.message || 'persist failed';
    const publishErr = results[1].reason?.message || 'publish failed';
    throw new Error(`Synthetic injection failed: ${persistErr}; ${publishErr}`);
  }

  return NextResponse.json(
    {
      ok: true,
      synthetic: true,
      scenario,
      traceId,
      disruptionId: disruptionEvent.id,
      persisted,
      published,
      warning: reason,
    },
    { status: 202 }
  );
}

/**
 * POST /api/webhooks/disruption
 * Receives pushes from the event bus and writes them to Firestore.
 * The dashboard's Firestore real-time listeners then push updates to the UI automatically.
 */
export async function POST(req) {
  try {
    const body = await req.json();
    const requestOrigin = req.headers.get('origin') || req.headers.get('referer') || '';
    const sameOrigin = (() => {
      try {
        if (!requestOrigin) return false;
        return new URL(requestOrigin).origin === new URL(req.url).origin;
      } catch {
        return false;
      }
    })();

    if (!body.scenario || !sameOrigin) {
      const unauthorized = verifyInternalToken(req);
      if (unauthorized) return unauthorized;
    }

    if (body.scenario) {
      const scenarioMeta = SCENARIO_MAP[body.scenario];
      if (!scenarioMeta) {
        return NextResponse.json({ error: `Unknown scenario: ${body.scenario}` }, { status: 400 });
      }

      try {
        const disruptionUrl = process.env.DISRUPTION_AGENT_URL || 'http://localhost:3001';
        const upstream = await fetch(`${disruptionUrl}/events`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(process.env.INTERNAL_TOKEN ? { Authorization: `Bearer ${process.env.INTERNAL_TOKEN}` } : {}),
          },
          body: JSON.stringify({ description: scenarioMeta.description }),
          signal: AbortSignal.timeout(INJECT_TIMEOUT_MS),
        });

        const upstreamBody = await parseUpstreamBody(upstream);
        if (!upstream.ok) {
          return injectSyntheticDisruption(
            body.scenario,
            scenarioMeta,
            `Disruption agent returned ${upstream.status}; synthetic fallback used`
          );
        }
        return NextResponse.json(
          {
            ok: upstream.ok,
            scenario: body.scenario,
            ...(upstreamBody && typeof upstreamBody === 'object' ? upstreamBody : {}),
          },
          { status: upstream.status }
        );
      } catch (err) {
        if (isTimeoutError(err)) {
          return injectSyntheticDisruption(
            body.scenario,
            scenarioMeta,
            `Disruption agent timed out after ${Math.floor(INJECT_TIMEOUT_MS / 1000)} seconds; synthetic fallback used`
          );
        }
        return injectSyntheticDisruption(
          body.scenario,
          scenarioMeta,
          `Disruption agent unavailable (${err.message}); synthetic fallback used`
        );
      }
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

    if (collection === 'disruptions') {
      const notifyUrl = new URL('/api/push/notify', req.url);
      await fetch(notifyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(process.env.INTERNAL_TOKEN ? { Authorization: `Bearer ${process.env.INTERNAL_TOKEN}` } : {}),
        },
        body: JSON.stringify({
          orgId: payload.orgId || process.env.DEFAULT_ORG_ID || 'demo-org',
          title: '⚠️ Disruption Detected',
          body: `${payload.type || 'Disruption'} at ${payload.location || 'an unknown location'} — Severity ${payload.severity ?? 'N/A'}`,
          url: '/',
        }),
      }).catch((error) => {
        console.warn('[WebhookDisruption] Push notify failed:', error.message);
      });
    }

    return NextResponse.json({ ok: true, collection, traceId });
  } catch (err) {
    console.error('[WebhookDisruption] Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
