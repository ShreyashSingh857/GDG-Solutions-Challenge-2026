import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { adminDb } from '../../../lib/firebase-admin.js';
import { normalizeDisruption } from '../../../../shared/lib/normalizeDisruption.js';

function dayKey(input) {
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function toNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toTs(value) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function calculateMttr(resolutions) {
  const resolvedDurations = resolutions
    .filter((r) => (r.status || '').toLowerCase() === 'resolved')
    .map((r) => {
      const createdTs = toTs(r.created_at ?? r.createdAt);
      const updatedTs = toTs(r.updated_at ?? r.updatedAt ?? r.resolved_at ?? r.resolvedAt);
      if (!createdTs || !updatedTs || updatedTs < createdTs) return null;
      return updatedTs - createdTs;
    })
    .filter((durationMs) => durationMs !== null);

  if (!resolvedDurations.length) return 0;
  const avgMs = resolvedDurations.reduce((sum, value) => sum + value, 0) / resolvedDurations.length;
  return Math.round(avgMs / 60000);
}

function calculateTotalCO2t(resolutions) {
  const totalTons = resolutions.reduce((sum, r) => {
    const rerouteDeltaKm = toNum(r.reroute_distance_delta_km ?? r.rerouteDistanceDeltaKm, 0);
    if (rerouteDeltaKm <= 0) return sum;

    // 0.020 kg CO2 per tonne-km * 12 tonnes average cargo per TEU; convert kg to tonnes.
    return sum + (rerouteDeltaKm * 0.020 * 12) / 1000;
  }, 0);

  return Number(totalTons.toFixed(2));
}

function buildDisruptionSeries(disruptions) {
  const map = new Map();
  disruptions.forEach((rawDisruption) => {
    const d = normalizeDisruption(rawDisruption);
    const key = dayKey(d.detectedAt);
    if (!key) return;
    map.set(key, (map.get(key) || 0) + 1);
  });

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date: date.slice(5), count }));
}

function buildByType(disruptions) {
  const map = new Map();
  disruptions.forEach((rawDisruption) => {
    const d = normalizeDisruption(rawDisruption);
    const key = d.type;
    map.set(key, (map.get(key) || 0) + 1);
  });
  return Array.from(map.entries()).map(([type, count]) => ({ type, count }));
}

function buildByCorridor(resolutions) {
  const map = new Map();
  resolutions.forEach((r) => {
    const corridor = r.corridor || r.cascade_risk || r.cascadeRisk || 'Unknown';
    const score = toNum(r.urgency, 5);
    const prev = map.get(corridor) || { total: 0, count: 0 };
    map.set(corridor, { total: prev.total + score, count: prev.count + 1 });
  });

  return Array.from(map.entries()).map(([corridor, agg]) => ({
    corridor,
    avgSeverity: Number((agg.total / Math.max(agg.count, 1)).toFixed(1)),
  }));
}

async function readFromSupabase(sinceIso) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const [disruptionsResult, resolutionsResult] = await Promise.all([
    supabase.from('disruptions').select('type,severity,detected_at').gte('detected_at', sinceIso),
    supabase
      .from('resolutions')
      .select('status,urgency,total_cargo_at_risk_usd,created_at,updated_at,resolved_at,cascade_risk,reroute_distance_delta_km')
      .gte('created_at', sinceIso),
  ]);

  if (disruptionsResult.error || resolutionsResult.error) return null;
  return {
    disruptions: disruptionsResult.data || [],
    resolutions: resolutionsResult.data || [],
  };
}

async function readFromFirestore(sinceDate) {
  const [disruptionSnap, resolutionSnap] = await Promise.all([
    adminDb.collection('disruptions').orderBy('detectedAt', 'desc').limit(1000).get(),
    adminDb.collection('resolutions').orderBy('createdAt', 'desc').limit(1000).get(),
  ]);

  const disruptions = disruptionSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((d) => new Date(d.detectedAt || d.receivedAt || 0) >= sinceDate)
    .map((d) => ({ type: d.type, severity: d.severity, detectedAt: d.detectedAt || d.receivedAt }));

  const resolutions = resolutionSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((r) => new Date(r.createdAt || 0) >= sinceDate)
    .map((r) => ({
      status: r.status,
      urgency: r.urgency,
      totalCargoAtRiskUSD: r.totalCargoAtRiskUSD,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      resolvedAt: r.resolvedAt,
      cascadeRisk: r.cascadeRisk,
      rerouteDistanceDeltaKm: r.rerouteDistanceDeltaKm,
    }));

  return { disruptions, resolutions };
}

export async function GET() {
  try {
    const sinceDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const sinceIso = sinceDate.toISOString();

    const source = (await readFromSupabase(sinceIso)) || (await readFromFirestore(sinceDate));
    const disruptions = source.disruptions;
    const resolutions = source.resolutions;

    const mttdMinutes = Math.round(
      resolutions.reduce((sum, r) => sum + (10 - toNum(r.urgency, 5)) * 5, 0) / Math.max(resolutions.length, 1)
    );
    const mttrMinutes = calculateMttr(resolutions);
    const cargoSavedUSD = Math.round(
      resolutions.reduce(
        (sum, r) => sum + toNum(r.total_cargo_at_risk_usd ?? r.totalCargoAtRiskUSD, 0) * 0.85,
        0
      )
    );

    const data = {
      mttdMinutes,
      mttrMinutes,
      cargoSavedUSD,
      totalCO2t: calculateTotalCO2t(resolutions),
      disruptionsByDay: buildDisruptionSeries(disruptions),
      byType: buildByType(disruptions),
      byCorridor: buildByCorridor(resolutions),
    };

    return NextResponse.json({ data, error: null });
  } catch (err) {
    return NextResponse.json({ data: null, error: err.message }, { status: 500 });
  }
}
