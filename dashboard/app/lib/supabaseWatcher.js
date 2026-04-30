'use client';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('[SupabaseWatcher] NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is not set. Stage polling will not work.');
}

const supabase = createClient(url ?? '', key ?? '');

const POLL_MS = 2000;

function poll(queryFn, onFound) {
  let stopped = false;
  let found = false;

  async function tick() {
    if (stopped) return;
    try {
      const result = await queryFn();
      if (result && !found) {
        found = true;
        onFound(result);
      }
    } catch (err) {
      console.warn('[SupabaseWatcher]', err.message);
    }
    if (!stopped && !found) setTimeout(tick, POLL_MS);
  }

  tick();
  return () => { stopped = true; };
}

export function watchDisruptionSupabase(dId, onFound) {
  return poll(async () => {
    const { data, error } = await supabase
      .from('disruptions')
      .select('id,type,severity,location,epicenter_lat,epicenter_lng,affected_zones,confidence,raw_description,detected_at')
      .eq('id', dId)
      .limit(1);
    if (error) throw new Error(error.message);
    const row = data?.[0];
    if (!row) return null;
    return {
      id:             row.id,
      type:           row.type,
      severity:       row.severity,
      location:       row.location,
      epicenterLat:   row.epicenter_lat,
      epicenterLng:   row.epicenter_lng,
      affectedZones:  row.affected_zones || [],
      confidence:     row.confidence,
      rawDescription: row.raw_description,
      detectedAt:     row.detected_at,
      title:          row.location || row.type,
    };
  }, onFound);
}

export function watchImpactSupabase(dId, onFound) {
  return poll(async () => {
    const { data, error } = await supabase
      .from('impact_reports')
      .select('id,disruption_id,cascade_risk,urgency,total_cargo_at_risk_usd,analysis_text,shipment_count,created_at')
      .eq('disruption_id', dId)
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) throw new Error(error.message);
    const row = data?.[0];
    if (!row) return null;
    return {
      id:                  row.id,
      disruptionId:        row.disruption_id,
      cascadeRisk:         row.cascade_risk,
      urgency:             row.urgency,
      totalCargoAtRiskUSD: row.total_cargo_at_risk_usd,
      analysisText:        row.analysis_text,
      shipmentCount:       row.shipment_count,
      affectedShipments:   Array.from({ length: row.shipment_count || 0 }),
      createdAt:           row.created_at,
    };
  }, onFound);
}

export function watchResolutionSupabase(dId, onFound) {
  return poll(async () => {
    const { data: resRows, error: resErr } = await supabase
      .from('resolutions')
      .select('id,disruption_id,impact_report_id,cascade_risk,urgency,total_cargo_at_risk_usd,analysis_text,option_count,status,created_at')
      .eq('disruption_id', dId)
      .order('created_at', { ascending: false })
      .limit(1);
    if (resErr) throw new Error(resErr.message);
    if (!resRows?.[0]) return null;

    const resRow = resRows[0];
    const { data: optRows, error: optErr } = await supabase
      .from('resolution_options')
      .select('id,rank,title,description,cost_delta,time_delta,supplier_name,confidence,route_geojson,transport_mode,selected')
      .eq('resolution_id', resRow.id)
      .order('rank', { ascending: true });
    if (optErr) throw new Error(optErr.message);
    if (!optRows?.length) return null;

    return {
      resolution: {
        id:                  resRow.id,
        disruptionId:        resRow.disruption_id,
        impactReportId:      resRow.impact_report_id,
        cascadeRisk:         resRow.cascade_risk,
        urgency:             resRow.urgency,
        totalCargoAtRiskUSD: resRow.total_cargo_at_risk_usd,
        analysisText:        resRow.analysis_text,
        optionCount:         resRow.option_count,
        status:              resRow.status,
        createdAt:           resRow.created_at,
      },
      options: optRows.map((row) => ({
        id:           row.id,
        rank:         row.rank,
        title:        row.title,
        description:  row.description,
        costDelta:    row.cost_delta,
        timeDelta:    row.time_delta,
        supplierName: row.supplier_name,
        confidence:   Math.round((row.confidence || 0) * 100),
        route:        row.route_geojson,
        transportMode: row.transport_mode,
        selected:     row.selected,
        carbonDeltaKg: row.route_geojson?.properties?.carbonDeltaKg || 0,
      })),
    };
  }, onFound);
}
