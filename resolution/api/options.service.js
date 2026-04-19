import { generateStream } from '../../shared/lib/gemini.js';
import { db } from '../../shared/db/firebase.js';
import { resilientUpsert } from '../../shared/db/supabase.js';
import { publish, subscribe } from '../../shared/eventBusClient.js';
import { TOPICS } from '../../event-bus/topics.js';
import { createAgentPayload } from '../../shared/types/AgentPayload.js';
import { validateResolutionOption } from '../types/ResolutionOption.js';
import { findSuppliers } from '../tools/supplierLookup.js';
import { getRoutesForScenario, detectScenario, toGeoJSON } from '../tools/routingTool.js';
import { calculateCostDelta, calculateCarbonDelta } from '../tools/costCalculator.js';
import { fetchCurrentFreightRates, summarizeFreightRates } from '../tools/freightRatesTool.js';
import { checkAirFreightAvailability } from '../tools/airFreightChecker.js';
import { buildSanctionsWarning } from '../tools/sanctionsChecker.js';
import { estimateInsurancePremium } from '../tools/insuranceEstimator.js';
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

function deriveCargoTonnes(impactReport) {
	const shipmentCount = Number(impactReport?.affectedShipments?.length || impactReport?.scoredShipments?.length || 0);
	const totalValue = Number(impactReport?.totalCargoAtRiskUSD || 0);
	const byValue = Math.max(250, Math.round(totalValue / 250000));
	const byCount = Math.max(250, shipmentCount * 100);
	return Math.max(byValue, byCount);
}

function enrichOption(option, route, impactReport, freightRates) {
	const routeContext = [route?.title, impactReport?.disruptionLocation, ...(impactReport?.affectedZones || [])].filter(Boolean).join(' ');
	const carbonDeltaKg = calculateCarbonDelta({
		distanceKmDelta: route?.distanceKm || 0,
		mode: route?.mode || route?.properties?.mode || 'sea-freight',
		cargoTonnes: deriveCargoTonnes(impactReport),
	});
	const insurance = estimateInsurancePremium(Number(impactReport?.totalCargoAtRiskUSD || 0), routeContext);
	return {
		...option,
		carbonDeltaKg,
		insurancePremiumUSD: insurance.premiumUSD,
		annualRatePercent: insurance.annualRatePercent,
		corridorRisk: insurance.corridorRisk,
		sanctionsWarning: buildSanctionsWarning(routeContext),
		freightMarketSummary: summarizeFreightRates(freightRates),
	};
}

function createFallbackOptionBases(routes, balancedCost, fastestCost, cheapestCost, seaSuppliers, airSuppliers) {
	return [
		{ rank: 1, title: routes.balanced.title, description: `Balanced reroute option adds ${routes.balanced.timeDeltaHours}h and $${balancedCost.costDelta.toLocaleString()} cost.`, costDelta: balancedCost.costDelta, timeDelta: routes.balanced.timeDeltaHours, supplierName: seaSuppliers[0]?.name || 'Trans-Pacific Shipping Co.', supplierId: seaSuppliers[0]?.id || 'sup-002', confidence: 0.75 },
		{ rank: 2, title: routes.fastest.title, description: `Fastest option: ${routes.fastest.timeDeltaHours}h saved at $${fastestCost.costDelta.toLocaleString()} premium.`, costDelta: fastestCost.costDelta, timeDelta: routes.fastest.timeDeltaHours, supplierName: airSuppliers[0]?.name || 'Pacific Air Express', supplierId: airSuppliers[0]?.id || 'sup-001', confidence: 0.80 },
		{ rank: 3, title: routes.cheapest.title, description: `Cheapest route: $${cheapestCost.costDelta.toLocaleString()} extra, ${routes.cheapest.timeDeltaHours}h longer.`, costDelta: cheapestCost.costDelta, timeDelta: routes.cheapest.timeDeltaHours, supplierName: seaSuppliers[1]?.name || 'Global Shipping Partners', supplierId: seaSuppliers[1]?.id || 'sup-003', confidence: 0.70 },
	];
}

export function buildValidatedResolutionOptions({ rawResponse, routes, balancedCost, fastestCost, cheapestCost, seaSuppliers, airSuppliers, traceId, impactReportId, disruptionId, impactReport, freightRates = {} }) {
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
			return enrichOption({
				...validateResolutionOption(normalized),
				route: toGeoJSON(routesByRank[i]),
				impactReportId,
				disruptionId,
				traceId,
				selected: false,
				createdAt: new Date().toISOString(),
		}, routesByRank[i], impactReport, freightRates);
		} catch (err) {
			console.warn(`[ResolutionService] Option rank ${i + 1} failed validation, using fallback:`, err.message);
			const safeFallback = fallbackOptions[i];
			return enrichOption({
				...safeFallback,
				route: toGeoJSON(routesByRank[i]),
				impactReportId,
				disruptionId,
				traceId,
				selected: false,
				createdAt: new Date().toISOString(),
			}, routesByRank[i], impactReport, freightRates);
		}
	});
}

async function processImpactReport(agentPayload) {
	const impactReport = agentPayload.payload, traceId = agentPayload.traceId;
	const disruption = buildDisruptionContextFromImpactReport(impactReport);
	const routes = getRoutesForScenario(detectScenario(disruption));
	const freightRates = await fetchCurrentFreightRates().catch(() => ({}));
	const region = pickSupplierRegion(disruption);
	const seaSuppliers = await findSuppliers(region, 'sea-freight');
	const airSuppliers = await findSuppliers(region, 'air-freight');
	const airFreight = await checkAirFreightAvailability(37.6213, -122.379).catch(() => ({ available: true, note: 'OpenSky check failed' }));
	const airFreightNote = airFreight.available ? `Air freight is AVAILABLE: ${airFreight.note}` : 'Air freight is CURRENTLY UNAVAILABLE at origin airport';
	const balancedCost = calculateCostDelta({ distanceKm: routes.balanced.distanceKm, mode: routes.balanced.mode, baseCostUSD: 50000 }); const fastestCost = calculateCostDelta({ distanceKm: routes.fastest.distanceKm, mode: routes.fastest.mode, baseCostUSD: 50000 }); const cheapestCost = calculateCostDelta({ distanceKm: routes.cheapest.distanceKm, mode: routes.cheapest.mode, baseCostUSD: 50000 });
	const freightMarketSummary = summarizeFreightRates(freightRates) || 'No live FBX market snapshot available';
	const shipmentLines = (impactReport.scoredShipments || []).slice(0, 5)
		.map((shipment, index) => `${index + 1}. ${shipment.origin}→${shipment.destination}|$${Number(shipment.cargoValueUSD || 0).toLocaleString()}|${shipment.distanceKm || 0}km|score:${shipment.impactScore ?? 0}`)
		.join('\n');
	const compactSuppliers = [...seaSuppliers, ...airSuppliers].slice(0, 4).map((supplier) => `${supplier.name}(${supplier.id})`).join(', ');
	const prompt = [
		SYSTEM_PROMPT,
		'CONSIDER carbon footprint, insurance premium, and sanctions compliance for each option.',
		`DISRUPTION: ${impactReport.disruptionType} at ${impactReport.disruptionLocation}`,
		`CARGO_AT_RISK: $${Number(impactReport.totalCargoAtRiskUSD || 0).toLocaleString()} across ${impactReport.affectedShipments.length} shipments`,
		`CASCADE: ${impactReport.cascadeRisk} | URGENCY: ${impactReport.urgency}/10`,
		`TOP_SHIPMENTS:\n${shipmentLines || 'None'}`,
		`AIR_FREIGHT: ${airFreightNote}`,
		`FREIGHT_MARKET: ${freightMarketSummary}`,
		`OPTIONS:\n1. ${routes.balanced.title}|${routes.balanced.distanceKm}km|+${routes.balanced.timeDeltaHours}h|+$${balancedCost.costDelta.toLocaleString()}\n2. ${routes.fastest.title}|${routes.fastest.distanceKm}km|+${routes.fastest.timeDeltaHours}h|+$${fastestCost.costDelta.toLocaleString()}\n3. ${routes.cheapest.title}|${routes.cheapest.distanceKm}km|+${routes.cheapest.timeDeltaHours}h|+$${cheapestCost.costDelta.toLocaleString()}`,
		`SUPPLIERS: ${compactSuppliers || 'None'}`,
	].join('\n');
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
			impactReport,
			freightRates,
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
