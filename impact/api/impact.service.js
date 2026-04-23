import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { generate } from '../../shared/lib/gemini.js';
import { generateWithRetry } from '../../shared/lib/llmJson.js';
import { IMPACT_SCHEMA, validateAndRepair } from '../../shared/lib/validateSchema.js';
import { db } from '../../shared/db/firebase.js';
import { resilientUpsert } from '../../shared/db/supabase.js';
import { publish, subscribe } from '../../shared/eventBusClient.js';
import { TOPICS } from '../../event-bus/topics.js';
import { createAgentPayload } from '../../shared/types/AgentPayload.js';
import { createImpactReport, validateImpactReport } from '../types/ImpactReport.js';
import { getShipmentsNearEpicenter } from '../tools/shipmentLookup.js';
import { scoreShipmentsWithTradeWeight } from '../tools/severityScorer.js';
import { setLastEventAt } from '../state.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SYSTEM_PROMPT = readFileSync(join(__dirname, '../agent/prompt.md'), 'utf-8');

let _subscription = null;
let _lastMessageAt = null;

const HEALTH_CHECK_INTERVAL = 60000;
const STALE_THRESHOLD = 300000;

function isChokepoint(disruption) {
	const text = [disruption?.location, ...(disruption?.affectedZones || [])].join(' ').toLowerCase();
	return /suez|malacca|panama/.test(text);
}

function deriveCascadeRisk(disruption, shipmentCount, totalCargoAtRiskUSD) {
	if (isChokepoint(disruption) || totalCargoAtRiskUSD > 50_000_000 || shipmentCount >= 15) return 'HIGH';
	if (totalCargoAtRiskUSD >= 10_000_000 || shipmentCount >= 5) return 'MEDIUM';
	return 'LOW';
}

function deriveUrgency(disruption, scoredShipments = []) {
	const highestShipmentValue = scoredShipments.reduce(
		(maxValue, shipment) => Math.max(maxValue, Number(shipment?.cargoValueUSD || 0)),
		0
	);
	if (highestShipmentValue > 10_000_000) return 8;
	if (disruption?.type === 'WEATHER' && Number(disruption?.severity || 0) >= 8) return 9;
	if (Number(disruption?.severity || 0) >= 7) return 7;
	if (Number(disruption?.severity || 0) >= 5) return 6;
	return 4;
}

function deriveDelayRangeHours(disruption) {
	const severity = Number(disruption?.severity || 5);
	if (severity >= 9) return [60, 120];
	if (severity >= 7) return [36, 72];
	if (severity >= 5) return [24, 48];
	return [8, 24];
}

export async function processDisruptionEvent(agentPayload) {
	const disruption = agentPayload.payload;
	const traceId = agentPayload.traceId;

	const nearbyShipments = await getShipmentsNearEpicenter(disruption.epicenterLat, disruption.epicenterLng);
	const scoredShipments = await scoreShipmentsWithTradeWeight(disruption, nearbyShipments);
	const totalCargoAtRiskUSD = scoredShipments.reduce((sum, shipment) => sum + shipment.cargoValueUSD, 0);

	const shipmentSummary = scoredShipments
		.slice(0, 10)
		.map(
			(shipment, index) =>
				`${index + 1}. ${shipment.origin}->${shipment.destination} (${shipment.carrier}) | Value: $${shipment.cargoValueUSD.toLocaleString()} | Distance: ${shipment.distanceKm}km | Impact Score: ${shipment.impactScore}`
		)
		.join('\n');

	const prompt = `${SYSTEM_PROMPT}\n\n## Disruption Event\n- Type: ${disruption.type}\n- Severity: ${disruption.severity}/10\n- Location: ${disruption.location}\n- Affected Zones: ${disruption.affectedZones.join(', ')}\n- Confidence: ${disruption.confidence}\n\n## Affected Shipments (top ${scoredShipments.length} by impact score)\n${shipmentSummary || 'No shipments within range.'}\n\n## Summary Statistics\n- Total affected shipments: ${scoredShipments.length}\n- Total cargo at risk: $${totalCargoAtRiskUSD.toLocaleString()}\n- Highest impact score: ${scoredShipments[0]?.impactScore || 0}`;

	let geminiResult;
	let rawModelResponse = '';
	let parseError = null;
	let retriesUsed = 0;
	const [minDelayHours, maxDelayHours] = deriveDelayRangeHours(disruption);
	const fallback = {
		cascadeRisk: deriveCascadeRisk(disruption, scoredShipments.length, totalCargoAtRiskUSD),
		urgency: deriveUrgency(disruption, scoredShipments),
		analysisText:
			`${scoredShipments.length} shipments totaling $${totalCargoAtRiskUSD.toLocaleString()} are affected near ${disruption.location}. ` +
			`Expected delays are ${minDelayHours}-${maxDelayHours} hours across ${disruption.affectedZones.join(', ') || disruption.location}.`,
	};
	try {
		const modelResult = await generateWithRetry(prompt, SYSTEM_PROMPT, {
			maxRetries: 2,
			invokeModel: (retryPrompt) => generate(retryPrompt),
		});
		rawModelResponse = modelResult.raw;
		geminiResult = modelResult.parsed;
		retriesUsed = Math.max(0, modelResult.attempts - 1);
	} catch (err) {
		parseError = err.message;
		rawModelResponse = String(err.rawModelResponse || rawModelResponse || '');
		geminiResult = fallback;
	}
	const validated = validateAndRepair(geminiResult, IMPACT_SCHEMA, fallback);
	const nonParseErrors = validated.errors;
	const validationErrors = parseError
		? [`parse failure after retry: ${parseError}`, ...nonParseErrors]
		: nonParseErrors;

	const impactReport = createImpactReport({
		disruptionId: disruption.id,
		disruptionType: disruption.type,
		disruptionLocation: disruption.location,
		affectedZones: disruption.affectedZones || [],
		traceId,
		affectedShipments: scoredShipments,
		cascadeRisk: validated.data.cascadeRisk || fallback.cascadeRisk,
		urgency: validated.data.urgency || fallback.urgency,
		totalCargoAtRiskUSD,
		analysisText: validated.data.analysisText || fallback.analysisText,
	});
	validateImpactReport(impactReport);

	await db.collection('impactReports').doc(impactReport.id).set({
		...impactReport,
		systemPromptSnapshot: SYSTEM_PROMPT.slice(0, 2000),
		inputPayloadSnapshot: JSON.stringify({
			disruption,
			totalCargoAtRiskUSD,
			topShipments: scoredShipments.slice(0, 10),
		}).slice(0, 3000),
		modelOutputSnapshot: String(rawModelResponse || '').slice(0, 10000),
		validationStatus: {
			valid: !parseError,
			errors: validationErrors,
			repairedCount: nonParseErrors.length,
			parseRetries: retriesUsed,
		},
	});

	const { queued: irQueued } = await resilientUpsert(
		'impact_reports',
		{
			id: impactReport.id,
			disruption_id: disruption.id,
			trace_id: traceId,
			cascade_risk: impactReport.cascadeRisk,
			urgency: impactReport.urgency,
			total_cargo_at_risk_usd: totalCargoAtRiskUSD,
			analysis_text: impactReport.analysisText,
			shipment_count: scoredShipments.length,
		},
		{ onConflict: 'id' }
	);
	if (irQueued) console.warn('[ImpactService] impact_reports write queued for retry');

	if (scoredShipments.length) {
		const irsRows = scoredShipments.map((shipment) => ({
			impact_report_id: impactReport.id,
			shipment_id: shipment.id,
			distance_km: shipment.distanceKm,
			impact_score: shipment.impactScore,
			cargo_value_usd: shipment.cargoValueUSD,
			carrier: shipment.carrier,
			origin: shipment.origin,
			destination: shipment.destination,
			corridor: shipment.corridor,
			current_lat: shipment.currentLat,
			current_lng: shipment.currentLng,
			status_at_impact: 'active',
		}));
		const { queued: irsQueued } = await resilientUpsert('impact_report_shipments', irsRows, {
			onConflict: 'impact_report_id,shipment_id',
		});
		if (irsQueued) console.warn('[ImpactService] impact_report_shipments write queued for retry');
	}

	if (scoredShipments.length) {
		const batch = db.batch();
		scoredShipments.forEach((shipment) => {
			batch.update(db.collection('shipments').doc(shipment.id), {
				status: 'delayed',
				lastUpdated: new Date().toISOString(),
				disruptionId: disruption.id,
			});
		});
		await batch.commit();
	}

	await publish(TOPICS.IMPACT_REPORTS, createAgentPayload('impact', impactReport, traceId));
	setLastEventAt(new Date().toISOString());
}

export function startImpactSubscriber() {
	function connect() {
		if (_subscription) {
			try {
				_subscription.close();
			} catch {
				// no-op
			}
		}

		_subscription = subscribe(TOPICS.DISRUPTION_EVENTS, (message, isReplay) => {
			_lastMessageAt = Date.now();
			if (isReplay) {
				const publishedAt = message?._publishedAt ? new Date(message._publishedAt).getTime() : 0;
				if (!publishedAt || Date.now() - publishedAt > 600000) return;
			}

			processDisruptionEvent(message).catch((err) =>
				console.error('[ImpactService] processDisruptionEvent error:', err.message)
			);
		});
		console.log('[ImpactService] SSE subscription established');
	}

	connect();
	setInterval(() => {
		const stale = _lastMessageAt && Date.now() - _lastMessageAt > STALE_THRESHOLD;
		if (stale || !_subscription || _subscription.readyState === 2) {
			console.warn('[ImpactService] SSE connection stale, reconnecting...');
			connect();
		}
	}, HEALTH_CHECK_INTERVAL);
}
