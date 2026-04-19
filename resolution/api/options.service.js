import { generateStream } from '../../shared/lib/gemini.js';
import { db } from '../../shared/db/firebase.js';
import { resilientUpsert } from '../../shared/db/supabase.js';
import { publish, subscribe } from '../../shared/eventBusClient.js';
import { TOPICS } from '../../event-bus/topics.js';
import { createAgentPayload } from '../../shared/types/AgentPayload.js';
import { validateResolutionOption } from '../types/ResolutionOption.js';
import { findSuppliers } from '../tools/supplierLookup.js';
import { getRoutesForScenario, detectScenario, toGeoJSON } from '../tools/routingTool.js';
import { calculateCostDelta } from '../tools/costCalculator.js';
import { checkAirFreightAvailability } from '../tools/airFreightChecker.js';
import { setLastEventAt } from '../state.js';
import { readFileSync } from 'fs'; import { fileURLToPath } from 'url'; import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url)); const SYSTEM_PROMPT = readFileSync(join(__dirname, '../agent/prompt.md'), 'utf-8'); const activeStreams = new Map();
let _subscription = null;
let _lastMessageAt = null;
const HEALTH_CHECK_INTERVAL = 60000;
const STALE_THRESHOLD = 300000;
export function getStreamText(traceId) { return activeStreams.get(traceId) || null; }

export function buildDisruptionContextFromImpactReport(impactReport) {
	const derivedZones = [...new Set((impactReport.affectedShipments || []).map((shipment) => shipment.corridor).filter(Boolean))];

	return {
		location: impactReport.disruptionLocation || derivedZones[0] || 'Pacific',
		type: impactReport.disruptionType || 'WEATHER',
		affectedZones: Array.isArray(impactReport.affectedZones) && impactReport.affectedZones.length ? impactReport.affectedZones : derivedZones,
	};
}

export function pickSupplierRegion(disruptionContext) {
	return disruptionContext.affectedZones[0] || disruptionContext.location || 'Pacific';
}

function toFirestoreSafeOption(option) {
	const { route, ...rest } = option;
	const routeWaypoints = Array.isArray(route?.geometry?.coordinates)
		? route.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }))
		: [];
	return {
		...rest,
		routeWaypoints,
		routeSummary: {
			mode: route?.properties?.mode || 'sea-freight',
			distanceKm: route?.properties?.distanceKm ?? null,
			timeDeltaHours: route?.properties?.timeDeltaHours ?? null,
		},
	};
}

function createFallbackOptionBases(routes, balancedCost, fastestCost, cheapestCost, seaSuppliers, airSuppliers) {
	return [
		{ rank: 1, title: routes.balanced.title, description: `Balanced reroute option adds ${routes.balanced.timeDeltaHours}h and $${balancedCost.costDelta.toLocaleString()} cost.`, costDelta: balancedCost.costDelta, timeDelta: routes.balanced.timeDeltaHours, supplierName: seaSuppliers[0]?.name || 'Trans-Pacific Shipping Co.', supplierId: seaSuppliers[0]?.id || 'sup-002', confidence: 0.75 },
		{ rank: 2, title: routes.fastest.title, description: `Fastest option: ${routes.fastest.timeDeltaHours}h saved at $${fastestCost.costDelta.toLocaleString()} premium.`, costDelta: fastestCost.costDelta, timeDelta: routes.fastest.timeDeltaHours, supplierName: airSuppliers[0]?.name || 'Pacific Air Express', supplierId: airSuppliers[0]?.id || 'sup-001', confidence: 0.80 },
		{ rank: 3, title: routes.cheapest.title, description: `Cheapest route: $${cheapestCost.costDelta.toLocaleString()} extra, ${routes.cheapest.timeDeltaHours}h longer.`, costDelta: cheapestCost.costDelta, timeDelta: routes.cheapest.timeDeltaHours, supplierName: seaSuppliers[1]?.name || 'Global Shipping Partners', supplierId: seaSuppliers[1]?.id || 'sup-003', confidence: 0.70 },
	];
}

export function buildValidatedResolutionOptions({ rawResponse, routes, balancedCost, fastestCost, cheapestCost, seaSuppliers, airSuppliers, traceId, impactReportId, disruptionId }) {
	const fallbackOptions = createFallbackOptionBases(routes, balancedCost, fastestCost, cheapestCost, seaSuppliers, airSuppliers);
	let options = fallbackOptions;

	try {
		const trimmed = String(rawResponse || '').replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
		if (!trimmed) throw new Error('Empty response');
		const parsed = JSON.parse(trimmed);
		if (!Array.isArray(parsed) || parsed.length < 3) throw new Error('Not a 3-element array');
		options = parsed;
	} catch (err) {
		console.warn('[ResolutionService] Using static fallback options:', err.message);
	}

	const routesByRank = [routes.balanced, routes.fastest, routes.cheapest];
	return options.slice(0, 3).map((opt, i) => {
		try {
			const normalized = {
				...fallbackOptions[i],
				...opt,
				rank: Number(opt.rank ?? i + 1),
				costDelta: Number.parseInt(opt.costDelta ?? fallbackOptions[i].costDelta, 10),
				timeDelta: Number.parseInt(opt.timeDelta ?? fallbackOptions[i].timeDelta, 10),
				confidence: Number.parseFloat(opt.confidence ?? fallbackOptions[i].confidence),
				supplierName: opt.supplierName || fallbackOptions[i].supplierName,
				supplierId: opt.supplierId || fallbackOptions[i].supplierId,
			};
			return {
				...validateResolutionOption(normalized),
				route: toGeoJSON(routesByRank[i]),
				impactReportId,
				disruptionId,
				traceId,
				selected: false,
				createdAt: new Date().toISOString(),
			};
		} catch (err) {
			console.warn(`[ResolutionService] Option rank ${i + 1} failed validation, using fallback:`, err.message);
			const safeFallback = fallbackOptions[i];
			return {
				...safeFallback,
				route: toGeoJSON(routesByRank[i]),
				impactReportId,
				disruptionId,
				traceId,
				selected: false,
				createdAt: new Date().toISOString(),
			};
		}
	});
}

async function processImpactReport(agentPayload) {
	const impactReport = agentPayload.payload, traceId = agentPayload.traceId;
	const disruption = buildDisruptionContextFromImpactReport(impactReport);
	const routes = getRoutesForScenario(detectScenario(disruption));
	const region = pickSupplierRegion(disruption);
	const seaSuppliers = await findSuppliers(region, 'sea-freight');
	const airSuppliers = await findSuppliers(region, 'air-freight');
	const airFreight = await checkAirFreightAvailability(37.6213, -122.379).catch(() => ({ available: true, note: 'OpenSky check failed' }));
	const airFreightNote = airFreight.available ? `Air freight is AVAILABLE: ${airFreight.note}` : 'Air freight is CURRENTLY UNAVAILABLE at origin airport';
	const balancedCost = calculateCostDelta({ distanceKm: routes.balanced.distanceKm, mode: routes.balanced.mode, baseCostUSD: 50000 }); const fastestCost = calculateCostDelta({ distanceKm: routes.fastest.distanceKm, mode: routes.fastest.mode, baseCostUSD: 50000 }); const cheapestCost = calculateCostDelta({ distanceKm: routes.cheapest.distanceKm, mode: routes.cheapest.mode, baseCostUSD: 50000 });
	const supplierSummary = [...seaSuppliers, ...airSuppliers].map((s) => `- ${s.name} (ID: ${s.id}) | Region: ${s.region} | Reliability: ${s.reliabilityScore}/100`).join('\n');
	const prompt = `${SYSTEM_PROMPT}\n\n## Impact Report\n- Disruption ID: ${impactReport.disruptionId}\n- Cascade Risk: ${impactReport.cascadeRisk}\n- Urgency: ${impactReport.urgency}/10\n- Affected Shipments: ${impactReport.affectedShipments.length}\n- Total Cargo at Risk: $${impactReport.totalCargoAtRiskUSD.toLocaleString()}\n- Analysis: ${impactReport.analysisText}\n\n## Air Freight Feasibility\n- ${airFreightNote}\n\n## Available Rerouting Options\n1. BALANCED — ${routes.balanced.title}: ${routes.balanced.distanceKm}km via ${routes.balanced.mode}, extra ${routes.balanced.timeDeltaHours}h, cost delta $${balancedCost.costDelta.toLocaleString()}\n2. FASTEST — ${routes.fastest.title}: ${routes.fastest.distanceKm}km via ${routes.fastest.mode}, time delta ${routes.fastest.timeDeltaHours}h, cost delta $${fastestCost.costDelta.toLocaleString()}\n3. CHEAPEST — ${routes.cheapest.title}: ${routes.cheapest.distanceKm}km via ${routes.cheapest.mode}, extra ${routes.cheapest.timeDeltaHours}h, cost delta $${cheapestCost.costDelta.toLocaleString()}\n\n## Available Suppliers\n${supplierSummary || 'No suppliers found'}\nGenerate exactly 3 ranked resolution options.`;
	activeStreams.set(traceId, '');
	let fullResponse = '';
	try {
		for await (const chunk of generateStream(prompt)) {
			fullResponse += chunk;
			activeStreams.set(traceId, fullResponse);
		}
	} catch (err) {
		console.warn('[ResolutionService] generateStream failed, using deterministic fallback options:', err.message);
	}
		const validatedOptions = buildValidatedResolutionOptions({
			rawResponse: fullResponse,
			routes,
			balancedCost,
			fastestCost,
			cheapestCost,
			seaSuppliers,
			airSuppliers,
			traceId,
			impactReportId: impactReport.id,
			disruptionId: impactReport.disruptionId,
		});
	const { queued: resQueued } = await resilientUpsert('resolutions', { id: traceId, trace_id: traceId, impact_report_id: impactReport.id, disruption_id: impactReport.disruptionId, cascade_risk: impactReport.cascadeRisk, urgency: impactReport.urgency, total_cargo_at_risk_usd: impactReport.totalCargoAtRiskUSD, analysis_text: impactReport.analysisText, option_count: validatedOptions.length, status: 'pending' }, { onConflict: 'id' });
	if (resQueued) console.warn('[ResolutionService] resolutions write queued for retry');
	const optionRows = validatedOptions.map((opt) => ({ resolution_id: traceId, trace_id: traceId, rank: opt.rank, title: opt.title, description: opt.description, cost_delta: opt.costDelta, time_delta: opt.timeDelta, supplier_id: opt.supplierId || null, supplier_name: opt.supplierName, confidence: opt.confidence, route_geojson: opt.route, transport_mode: opt.route?.properties?.mode || 'sea-freight', selected: false }));
	const { queued: optQueued } = await resilientUpsert('resolution_options', optionRows, { onConflict: 'resolution_id,rank' });
	if (optQueued) console.warn('[ResolutionService] resolution_options write queued for retry');
	const batch = db.batch(); validatedOptions.forEach((opt) => batch.set(db.collection('resolutions').doc(traceId).collection('options').doc(String(opt.rank)), toFirestoreSafeOption(opt))); batch.set(db.collection('resolutions').doc(traceId), { traceId, impactReportId: impactReport.id, disruptionId: impactReport.disruptionId, cascadeRisk: impactReport.cascadeRisk, urgency: impactReport.urgency, totalCargoAtRiskUSD: impactReport.totalCargoAtRiskUSD, analysisText: impactReport.analysisText, optionCount: validatedOptions.length, createdAt: new Date().toISOString(), status: 'pending' }); await batch.commit(); await publish(TOPICS.RESOLUTION_OPTIONS, createAgentPayload('resolution', { traceId, impactReportId: impactReport.id, disruptionId: impactReport.disruptionId, options: validatedOptions }, traceId)); setLastEventAt(new Date().toISOString()); setTimeout(() => activeStreams.delete(traceId), 300000);
}

export function startResolutionSubscriber() {
	function connect() {
		if (_subscription) { try { _subscription.close(); } catch {} }
		_subscription = subscribe(TOPICS.IMPACT_REPORTS, (message, isReplay) => {
			_lastMessageAt = Date.now();
			if (isReplay) {
				const publishedAt = message?._publishedAt ? new Date(message._publishedAt).getTime() : 0;
				if (!publishedAt || Date.now() - publishedAt > 600000) return;
			}
			processImpactReport(message).catch(err =>
				console.error('[ResolutionService] processImpactReport error:', err.message)
			);
		});
		console.log('[ResolutionService] SSE subscription established');
	}
	connect();
	setInterval(() => {
		const stale = _lastMessageAt && (Date.now() - _lastMessageAt > STALE_THRESHOLD);
		if (stale || !_subscription || _subscription.readyState === 2) {
			console.warn('[ResolutionService] SSE connection stale, reconnecting...');
			connect();
		}
	}, HEALTH_CHECK_INTERVAL);
}
