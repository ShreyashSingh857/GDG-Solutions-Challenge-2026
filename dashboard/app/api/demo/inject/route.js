import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { db } from '../../../../lib/firebase-admin.js';
import { createClient } from '@supabase/supabase-js';

const _supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const _supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabaseAdmin = _supabaseUrl && _supabaseKey ? createClient(_supabaseUrl, _supabaseKey) : null;

async function writeDisruptionToSupabase(disruptionEvent) {
  if (!supabaseAdmin) return;

  const { error } = await supabaseAdmin.from('disruptions').upsert({
    id:              disruptionEvent.id,
    trace_id:        disruptionEvent.id,
    type:            disruptionEvent.type,
    severity:        disruptionEvent.severity,
    location:        disruptionEvent.location,
    epicenter_lat:   disruptionEvent.epicenterLat,
    epicenter_lng:   disruptionEvent.epicenterLng,
    affected_zones:  disruptionEvent.affectedZones || [],
    confidence:      disruptionEvent.confidence,
    raw_description: disruptionEvent.rawDescription || disruptionEvent.description || '',
    published:       true,
    resolved:        false,
    detected_at:     disruptionEvent.detectedAt || new Date().toISOString(),
  }, { onConflict: 'id' });
  if (error) throw new Error(`Supabase disruption write failed: ${error.message}`);
}

const INJECT_TIMEOUT_MS = 15_000;
const EVENT_BUS_TIMEOUT_MS = 5_000;

const configuredDisruptionAgentUrl =
  process.env.DISRUPTION_AGENT_URL ||
  process.env.NEXT_PUBLIC_DISRUPTION_AGENT_URL ||
  '';

const DISRUPTION_AGENT_URL =
  configuredDisruptionAgentUrl || (process.env.NODE_ENV === 'development' ? 'http://localhost:3001' : '');

const SCENARIOS = {
  pacific_storm: {
    label: 'Super Typhoon Mawar',
    type: 'WEATHER',
    severity: 8,
    location: 'Western Pacific Shipping Corridor',
    epicenterLat: 28.2,
    epicenterLng: 143.4,
    confidence: 0.86,
    affectedZones: ['Western Pacific', 'North Pacific Route'],
    description:
      'Super Typhoon approaching Western Pacific, Category 5. Maximum sustained winds 185 km/h. Direct path over major trans-Pacific shipping corridors. 12 vessels currently in projected storm path between Japan and Los Angeles. Port of Yokohama issuing storm warnings.',
  },
  suez_closure: {
    label: 'Suez Canal Emergency',
    type: 'GEOPOLITICAL',
    severity: 9,
    location: 'Suez Canal / Red Sea',
    epicenterLat: 29.9668,
    epicenterLng: 32.5498,
    confidence: 0.88,
    affectedZones: ['Red Sea', 'Gulf of Aden', 'Suez Canal'],
    description:
      'The Suez Canal Authority has announced an emergency closure. Houthi missile attacks on Red Sea vessels. Forty-three vessels held. $12B daily trade affected. Minimum 21-day closure expected. All Asia-Europe shipments via southern route ordered to divert via Cape of Good Hope.',
  },
  port_strike: {
    label: 'Mumbai JNPT Strike',
    type: 'STRIKE',
    severity: 7,
    location: 'North Sea Port Cluster',
    epicenterLat: 51.9225,
    epicenterLng: 4.4792,
    confidence: 0.83,
    affectedZones: ['Rotterdam', 'Hamburg', 'Antwerp'],
    description:
      'International Transport Workers Federation confirms indefinite strike action at Port of Rotterdam, Hamburg, and Antwerp. All container terminal operations suspended. 80+ vessels at anchor awaiting berth. Estimated 2-week minimum disruption to Europe-bound cargo.',
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
    source: 'dashboard-demo-fallback',
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

async function injectSyntheticDisruption(scenario, scenarioMeta, reason = 'upstream unavailable') {
  const traceId = randomUUID();
  const disruptionEvent = buildSyntheticDisruption(scenarioMeta);
  const results = await Promise.allSettled([
    db.collection('disruptions').doc(disruptionEvent.id).set(disruptionEvent, { merge: true }),
    publishSyntheticDisruption(disruptionEvent, traceId),
    writeDisruptionToSupabase(disruptionEvent),
  ]);

  const persisted = results[0].status === 'fulfilled' || results[2].status === 'fulfilled';
  const published = results[1].status === 'fulfilled';
  if (results[2].status === 'rejected') {
    console.warn('[InjectRoute] Supabase disruption write failed:', results[2].reason?.message);
  }

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
      label: scenarioMeta.label,
      traceId,
      disruptionId: disruptionEvent.id,
      persisted,
      published,
      warning: reason,
    },
    { status: 202 }
  );
}

export async function POST(req) {
  try {
    const { scenario } = await req.json();
    const scenarioKey = String(scenario || '').trim().toLowerCase();
    const scenarioMeta = SCENARIOS[scenarioKey];

    if (!scenarioMeta) {
      return NextResponse.json(
        { error: `Unknown scenario. Available: ${Object.keys(SCENARIOS).join(', ')}` },
        { status: 400 }
      );
    }

    if (!DISRUPTION_AGENT_URL) {
      return injectSyntheticDisruption(
        scenarioKey,
        scenarioMeta,
        'DISRUPTION_AGENT_URL is not configured; synthetic fallback used'
      );
    }

    const headers = { 'Content-Type': 'application/json' };
    if (process.env.INTERNAL_TOKEN) {
      headers.Authorization = `Bearer ${process.env.INTERNAL_TOKEN}`;
    }

    try {
      const upstream = await fetch(`${DISRUPTION_AGENT_URL}/events`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ description: scenarioMeta.description }),
        signal: AbortSignal.timeout(INJECT_TIMEOUT_MS),
      });

      const result = await parseUpstreamBody(upstream);
      if (!upstream.ok) {
        return injectSyntheticDisruption(
          scenarioKey,
          scenarioMeta,
          `Disruption agent returned ${upstream.status}; synthetic fallback used`
        );
      }

      return NextResponse.json({
        ok: true,
        synthetic: false,
        disruptionId: result?.data?.id || null,
        traceId: result?.traceId || null,
        scenario: scenarioKey,
        label: scenarioMeta.label,
        published: result?.published ?? false,
      });
    } catch (err) {
      if (isTimeoutError(err)) {
        return injectSyntheticDisruption(
          scenarioKey,
          scenarioMeta,
          `Disruption agent timed out after ${Math.floor(INJECT_TIMEOUT_MS / 1000)} seconds; synthetic fallback used`
        );
      }
      return injectSyntheticDisruption(
        scenarioKey,
        scenarioMeta,
        `Disruption agent unavailable (${err.message}); synthetic fallback used`
      );
    }
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Inject failed' }, { status: 500 });
  }
}
