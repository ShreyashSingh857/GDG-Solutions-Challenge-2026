import { generate } from '../../shared/lib/gemini.js';
import { db } from '../../shared/db/firebase.js';
import { supabase } from '../../shared/db/supabase.js';
import { publish, subscribe } from '../../shared/eventBusClient.js';
import { TOPICS } from '../../event-bus/topics.js';
import { createAgentPayload } from '../../shared/types/AgentPayload.js';
import { createImpactReport, validateImpactReport } from '../types/ImpactReport.js';
import { getShipmentsNearEpicenter } from '../tools/shipmentLookup.js';
import { scoreShipments } from '../tools/severityScorer.js';
import { setLastEventAt } from '../state.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SYSTEM_PROMPT = readFileSync(join(__dirname, '../agent/prompt.md'), 'utf-8');
let _subscription = null;
let _lastMessageAt = null;
const HEALTH_CHECK_INTERVAL = 60000;
const STALE_THRESHOLD = 300000;

export async function processDisruptionEvent(agentPayload) {
	const disruption = agentPayload.payload; const traceId = agentPayload.traceId;
	const nearbyShipments = await getShipmentsNearEpicenter(disruption.epicenterLat, disruption.epicenterLng);
	const scoredShipments = scoreShipments(disruption, nearbyShipments);
	const totalCargoAtRiskUSD = scoredShipments.reduce((sum, s) => sum + s.cargoValueUSD, 0);
	const shipmentSummary = scoredShipments.slice(0, 10).map((s, i) => `${i + 1}. ${s.origin}→${s.destination} (${s.carrier}) | Value: $${s.cargoValueUSD.toLocaleString()} | Distance: ${s.distanceKm}km | Impact Score: ${s.impactScore}`).join('\n');
	const prompt = `${SYSTEM_PROMPT}\n\n## Disruption Event\n- Type: ${disruption.type}\n- Severity: ${disruption.severity}/10\n- Location: ${disruption.location}\n- Affected Zones: ${disruption.affectedZones.join(', ')}\n- Confidence: ${disruption.confidence}\n\n## Affected Shipments (top ${scoredShipments.length} by impact score)\n${shipmentSummary || 'No shipments within range.'}\n\n## Summary Statistics\n- Total affected shipments: ${scoredShipments.length}\n- Total cargo at risk: $${totalCargoAtRiskUSD.toLocaleString()}\n- Highest impact score: ${scoredShipments[0]?.impactScore || 0}`;
	let geminiResult; try { geminiResult = JSON.parse((await generate(prompt)).replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()); } catch { geminiResult = { cascadeRisk: disruption.severity >= 7 ? 'HIGH' : 'MEDIUM', urgency: disruption.severity, analysisText: `Disruption at ${disruption.location} affects ${scoredShipments.length} shipments with $${totalCargoAtRiskUSD.toLocaleString()} cargo at risk.` }; }
	const impactReport = createImpactReport({ disruptionId: disruption.id, disruptionType: disruption.type, disruptionLocation: disruption.location, affectedZones: disruption.affectedZones || [], traceId, affectedShipments: scoredShipments, cascadeRisk: geminiResult.cascadeRisk || 'MEDIUM', urgency: geminiResult.urgency || disruption.severity, totalCargoAtRiskUSD, analysisText: geminiResult.analysisText || '' });
	validateImpactReport(impactReport);
	await db.collection('impactReports').doc(impactReport.id).set(impactReport);
	const { error: irErr } = await supabase.from('impact_reports').upsert({
		id: impactReport.id,
		disruption_id: disruption.id,
		trace_id: traceId,
		cascade_risk: impactReport.cascadeRisk,
		urgency: impactReport.urgency,
		total_cargo_at_risk_usd: totalCargoAtRiskUSD,
		analysis_text: impactReport.analysisText,
		shipment_count: scoredShipments.length,
	}, { onConflict: 'id' });
	if (irErr) console.error('[ImpactService] Supabase impact_reports write failed (non-fatal):', irErr.message);
	if (scoredShipments.length) {
		const irsRows = scoredShipments.map((s) => ({
			impact_report_id: impactReport.id,
			shipment_id: s.id,
			distance_km: s.distanceKm,
			impact_score: s.impactScore,
			cargo_value_usd: s.cargoValueUSD,
			carrier: s.carrier,
			origin: s.origin,
			destination: s.destination,
			corridor: s.corridor,
			current_lat: s.currentLat,
			current_lng: s.currentLng,
			status_at_impact: 'active',
		}));
		const { error: irsErr } = await supabase.from('impact_report_shipments').upsert(irsRows, { onConflict: 'impact_report_id,shipment_id' });
		if (irsErr) console.error('[ImpactService] Supabase impact_report_shipments write failed (non-fatal):', irsErr.message);
	}
	if (scoredShipments.length) { const batch = db.batch(); scoredShipments.forEach((s) => batch.update(db.collection('shipments').doc(s.id), { status: 'delayed', lastUpdated: new Date().toISOString(), disruptionId: disruption.id })); await batch.commit(); }
	await publish(TOPICS.IMPACT_REPORTS, createAgentPayload('impact', impactReport, traceId));
	setLastEventAt(new Date().toISOString());
}

export function startImpactSubscriber() {
	function connect() {
		if (_subscription) { try { _subscription.close(); } catch {} }
		_subscription = subscribe(TOPICS.DISRUPTION_EVENTS, (message, isReplay) => {
			_lastMessageAt = Date.now();
			if (isReplay) {
				const publishedAt = message?._publishedAt ? new Date(message._publishedAt).getTime() : 0;
				if (!publishedAt || Date.now() - publishedAt > 600000) return;
			}
			processDisruptionEvent(message).catch(err =>
				console.error('[ImpactService] processDisruptionEvent error:', err.message)
			);
		});
		console.log('[ImpactService] SSE subscription established');
	}
	connect();
	setInterval(() => {
		const stale = _lastMessageAt && (Date.now() - _lastMessageAt > STALE_THRESHOLD);
		if (stale || !_subscription || _subscription.readyState === 2) {
			console.warn('[ImpactService] SSE connection stale, reconnecting...');
			connect();
		}
	}, HEALTH_CHECK_INTERVAL);
}
