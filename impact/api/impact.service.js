import { generate } from '../../shared/lib/gemini.js';
import { db } from '../../shared/db/firebase.js';
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

export async function processDisruptionEvent(agentPayload) {
	const disruption = agentPayload.payload; const traceId = agentPayload.traceId;
	const nearbyShipments = await getShipmentsNearEpicenter(disruption.epicenterLat, disruption.epicenterLng);
	const scoredShipments = scoreShipments(disruption, nearbyShipments);
	const totalCargoAtRiskUSD = scoredShipments.reduce((sum, s) => sum + s.cargoValueUSD, 0);
	const shipmentSummary = scoredShipments.slice(0, 10).map((s, i) => `${i + 1}. ${s.origin}→${s.destination} (${s.carrier}) | Value: $${s.cargoValueUSD.toLocaleString()} | Distance: ${s.distanceKm}km | Impact Score: ${s.impactScore}`).join('\n');
	const prompt = `${SYSTEM_PROMPT}\n\n## Disruption Event\n- Type: ${disruption.type}\n- Severity: ${disruption.severity}/10\n- Location: ${disruption.location}\n- Affected Zones: ${disruption.affectedZones.join(', ')}\n- Confidence: ${disruption.confidence}\n\n## Affected Shipments (top ${scoredShipments.length} by impact score)\n${shipmentSummary || 'No shipments within range.'}\n\n## Summary Statistics\n- Total affected shipments: ${scoredShipments.length}\n- Total cargo at risk: $${totalCargoAtRiskUSD.toLocaleString()}\n- Highest impact score: ${scoredShipments[0]?.impactScore || 0}`;
	let geminiResult; try { geminiResult = JSON.parse((await generate(prompt)).replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()); } catch { geminiResult = { cascadeRisk: disruption.severity >= 7 ? 'HIGH' : 'MEDIUM', urgency: disruption.severity, analysisText: `Disruption at ${disruption.location} affects ${scoredShipments.length} shipments with $${totalCargoAtRiskUSD.toLocaleString()} cargo at risk.` }; }
	const impactReport = createImpactReport({ disruptionId: disruption.id, traceId, affectedShipments: scoredShipments, cascadeRisk: geminiResult.cascadeRisk || 'MEDIUM', urgency: geminiResult.urgency || disruption.severity, totalCargoAtRiskUSD, analysisText: geminiResult.analysisText || '' });
	validateImpactReport(impactReport);
	await db.collection('impactReports').doc(impactReport.id).set(impactReport);
	if (scoredShipments.length) { const batch = db.batch(); scoredShipments.forEach((s) => batch.update(db.collection('shipments').doc(s.id), { status: 'delayed', lastUpdated: new Date().toISOString(), disruptionId: disruption.id })); await batch.commit(); }
	await publish(TOPICS.IMPACT_REPORTS, createAgentPayload('impact', impactReport, traceId));
	setLastEventAt(new Date().toISOString());
}

export function startImpactSubscriber() { subscribe(TOPICS.DISRUPTION_EVENTS, (message) => processDisruptionEvent(message).catch((err) => console.error('[ImpactService] Unhandled error in processDisruptionEvent:', err.message))); }
