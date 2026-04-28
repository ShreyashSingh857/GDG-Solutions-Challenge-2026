import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { generate } from '../../shared/lib/gemini.js';
import { extractJSON, generateWithRetry } from '../../shared/lib/llmJson.js';
import { RESOLUTION_OPTION_SCHEMA, validateAndRepair } from '../../shared/lib/validateSchema.js';
import { db } from '../../shared/db/firebase.js';
import { FieldValue } from 'firebase-admin/firestore';
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

const __dirname = dirname(fileURLToPath(import.meta.url));
const SYSTEM_PROMPT = readFileSync(join(__dirname, '../agent/prompt.md'), 'utf-8');
const activeStreams = new Map();
const completedStreams = new Map();
const streamTouchedAt = new Map();
const _pendingQueue = [];

let _subscription = null;
let _lastMessageAt = null;
let _processing = false; // serialise heavy AI work to cap peak RAM

const HEALTH_CHECK_INTERVAL = 60000;
const STALE_THRESHOLD = 300000;
const STREAM_TTL_MS = 300000;
const STREAM_TEXT_CAP = 50_000; // max chars kept in activeStreams (≈50 KB)
const MAX_STREAM_ENTRIES = Number.parseInt(process.env.RESOLUTION_STREAM_MAX_ENTRIES ?? '200', 10);

function touchStream(traceId) {
	if (!activeStreams.has(traceId) && !completedStreams.has(traceId)) return;
	streamTouchedAt.set(traceId, Date.now());
}

function removeStream(traceId) {
	activeStreams.delete(traceId);
	completedStreams.delete(traceId);
	streamTouchedAt.delete(traceId);
}

function pruneStreams() {
	if (streamTouchedAt.size <= MAX_STREAM_ENTRIES) return;
	const oldest = [...streamTouchedAt.entries()].sort((a, b) => a[1] - b[1]);
	const removeCount = streamTouchedAt.size - MAX_STREAM_ENTRIES;
	for (let i = 0; i < removeCount; i += 1) {
		removeStream(oldest[i][0]);
	}
}

export function getStreamText(traceId) {
	touchStream(traceId);
	return activeStreams.get(traceId) ?? null;
}

export function isStreamComplete(traceId) {
	touchStream(traceId);
	return Boolean(completedStreams.get(traceId));
}

export function buildDisruptionContextFromImpactReport(impactReport) {
	const derivedZones = [
		...new Set((impactReport.affectedShipments || []).map((shipment) => shipment.corridor).filter(Boolean)),
	];

	return {
		location: impactReport.disruptionLocation || derivedZones[0] || 'Pacific',
		type: impactReport.disruptionType || 'WEATHER',
		affectedZones:
			Array.isArray(impactReport.affectedZones) && impactReport.affectedZones.length
				? impactReport.affectedZones
				: derivedZones,
	};
}

export function pickSupplierRegion(disruptionContext) {
	return disruptionContext.affectedZones[0] || disruptionContext.location || 'Pacific';
}

function sanitizeJsonResponse(rawResponse) {
	return extractJSON(rawResponse);
}

function summarizeResolutionValidation(rawResponse, parsedOverride = null) {
	const errors = [];
	const trimmed = sanitizeJsonResponse(rawResponse);

	if (!trimmed) {
		errors.push('empty response from model');
		return { valid: false, errors };
	}

	let parsed = parsedOverride;
	if (!parsed) {
		try {
			parsed = JSON.parse(trimmed);
		} catch (err) {
			errors.push(`invalid JSON: ${err.message}`);
			return { valid: false, errors };
		}
	}

	if (!Array.isArray(parsed)) {
		errors.push('response must be an array');
		return { valid: false, errors };
	}

	if (parsed.length < 3) {
		errors.push(`expected 3 options, received ${parsed.length}`);
	}

	const requiredFields = [
		'rank',
		'title',
		'description',
		'costDelta',
		'timeDelta',
		'supplierName',
		'supplierId',
		'confidence',
	];

	parsed.slice(0, 3).forEach((option, index) => {
		requiredFields.forEach((field) => {
			if (option?.[field] === undefined || option?.[field] === null || option?.[field] === '') {
				errors.push(`option ${index + 1}: missing ${field}`);
			}
		});
	});

	return { valid: errors.length === 0, errors };
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
	const routeContext = [route?.title, impactReport?.disruptionLocation, ...(impactReport?.affectedZones || [])]
		.filter(Boolean)
		.join(' ');

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
		{
			rank: 1,
			title: routes.balanced.title,
			description: `Balanced reroute option adds ${routes.balanced.timeDeltaHours}h and $${balancedCost.costDelta.toLocaleString()} cost.`,
			costDelta: balancedCost.costDelta,
			timeDelta: routes.balanced.timeDeltaHours,
			supplierName: seaSuppliers[0]?.name || 'Trans-Pacific Shipping Co.',
			supplierId: seaSuppliers[0]?.id || 'sup-002',
			confidence: 0.75,
		},
		{
			rank: 2,
			title: routes.fastest.title,
			description: `Fastest option: ${routes.fastest.timeDeltaHours}h saved at $${fastestCost.costDelta.toLocaleString()} premium.`,
			costDelta: fastestCost.costDelta,
			timeDelta: routes.fastest.timeDeltaHours,
			supplierName: airSuppliers[0]?.name || 'Pacific Air Express',
			supplierId: airSuppliers[0]?.id || 'sup-001',
			confidence: 0.8,
		},
		{
			rank: 3,
			title: routes.cheapest.title,
			description: `Cheapest route: $${cheapestCost.costDelta.toLocaleString()} extra, ${routes.cheapest.timeDeltaHours}h longer.`,
			costDelta: cheapestCost.costDelta,
			timeDelta: routes.cheapest.timeDeltaHours,
			supplierName: seaSuppliers[1]?.name || 'Global Shipping Partners',
			supplierId: seaSuppliers[1]?.id || 'sup-003',
			confidence: 0.7,
		},
	];
}

export function buildValidatedResolutionOptions({
	rawResponse,
	parsedResponse = null,
	routes,
	balancedCost,
	fastestCost,
	cheapestCost,
	seaSuppliers,
	airSuppliers,
	traceId,
	impactReportId,
	disruptionId,
	impactReport,
	freightRates = {},
}) {
	const repairErrors = [];
	const fallbackOptions = createFallbackOptionBases(
		routes,
		balancedCost,
		fastestCost,
		cheapestCost,
		seaSuppliers,
		airSuppliers
	);

	let options = fallbackOptions;

	try {
		let parsed = parsedResponse;
		if (!parsed) {
			const trimmed = sanitizeJsonResponse(rawResponse);
			if (!trimmed) throw new Error('Empty response');
			parsed = JSON.parse(trimmed);
		}
		if (!Array.isArray(parsed) || parsed.length < 3) throw new Error('Not a 3-element array');
		options = parsed;
	} catch (err) {
		console.warn('[ResolutionService] Using static fallback options:', err.message);
	}

	const routesByRank = [routes.balanced, routes.fastest, routes.cheapest];
	const normalizedOptions = options.slice(0, 3).map((opt, index) => {
		const schemaFallback = {
			...fallbackOptions[index],
			rank: index + 1,
		};
		const repaired = validateAndRepair({ ...schemaFallback, ...(opt || {}) }, RESOLUTION_OPTION_SCHEMA, schemaFallback);
		if (repaired.errors.length) {
			repaired.errors.forEach((err) => repairErrors.push(`option ${index + 1}: ${err}`));
		}
		return repaired.data;
	});

	const resolvedOptions = normalizedOptions.map((opt, index) => {
		try {
			const normalized = {
				...fallbackOptions[index],
				...opt,
				rank: Number(opt.rank ?? index + 1),
				costDelta: Number.parseInt(opt.costDelta ?? fallbackOptions[index].costDelta, 10),
				timeDelta: Number.parseInt(opt.timeDelta ?? fallbackOptions[index].timeDelta, 10),
				confidence: Number.parseFloat(opt.confidence ?? fallbackOptions[index].confidence),
				supplierName: opt.supplierName || fallbackOptions[index].supplierName,
				supplierId: opt.supplierId || fallbackOptions[index].supplierId,
			};

			return enrichOption(
				{
					...validateResolutionOption(normalized),
					route: toGeoJSON(routesByRank[index]),
					impactReportId,
					disruptionId,
					traceId,
					selected: false,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				},
				routesByRank[index],
				impactReport,
				freightRates
			);
		} catch (err) {
			console.warn(`[ResolutionService] Option rank ${index + 1} failed validation, using fallback:`, err.message);
			const safeFallback = fallbackOptions[index];

			return enrichOption(
				{
					...safeFallback,
					route: toGeoJSON(routesByRank[index]),
					impactReportId,
					disruptionId,
					traceId,
					selected: false,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				},
				routesByRank[index],
				impactReport,
				freightRates
			);
		}
	});

	return { options: resolvedOptions, repairErrors };
}

async function processImpactReport(agentPayload) {
	const impactReport = agentPayload.payload;
	const traceId = agentPayload.traceId;

	const disruption = buildDisruptionContextFromImpactReport(impactReport);
	const routes = getRoutesForScenario(detectScenario(disruption));
	const freightRates = await fetchCurrentFreightRates().catch(() => ({}));
	const region = pickSupplierRegion(disruption);

	const seaSuppliers = await findSuppliers(region, 'sea-freight');
	const airSuppliers = await findSuppliers(region, 'air-freight');
	const airFreight = await checkAirFreightAvailability(37.6213, -122.379).catch(() => ({
		available: true,
		note: 'OpenSky check failed',
	}));

	const airFreightNote = airFreight.available
		? `Air freight is AVAILABLE: ${airFreight.note}`
		: 'Air freight is CURRENTLY UNAVAILABLE at origin airport';

	const balancedCost = calculateCostDelta({
		distanceKm: routes.balanced.distanceKm,
		mode: routes.balanced.mode,
		baseCostUSD: 50000,
	});
	const fastestCost = calculateCostDelta({
		distanceKm: routes.fastest.distanceKm,
		mode: routes.fastest.mode,
		baseCostUSD: 50000,
	});
	const cheapestCost = calculateCostDelta({
		distanceKm: routes.cheapest.distanceKm,
		mode: routes.cheapest.mode,
		baseCostUSD: 50000,
	});

	const freightMarketSummary = summarizeFreightRates(freightRates) || 'No live FBX market snapshot available';
	const shipmentLines = (impactReport.scoredShipments || [])
		.slice(0, 5)
		.map(
			(shipment, index) =>
				`${index + 1}. ${shipment.origin}->${shipment.destination}|$${Number(shipment.cargoValueUSD || 0).toLocaleString()}|${shipment.distanceKm || 0}km|score:${shipment.impactScore ?? 0}`
		)
		.join('\n');
	const compactSuppliers = [...seaSuppliers, ...airSuppliers]
		.slice(0, 4)
		.map((supplier) => `${supplier.name}(${supplier.id})`)
		.join(', ');

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

	// Single LLM call via generateWithRetry (removed redundant generateStream pass).
	// activeStreams is updated with a capped snapshot so the stream SSE route stays
	// functional without accumulating unbounded strings in RAM.
	activeStreams.set(traceId, '');
	completedStreams.set(traceId, false);
	touchStream(traceId);
	pruneStreams();

	let parseError = null;
	let parseRetries = 0;
	let parsedOptions = null;
	let modelOutput = '';
	try {
		const modelResult = await generateWithRetry(prompt, SYSTEM_PROMPT, {
			maxRetries: 2,
			invokeModel: (retryPrompt) => generate(retryPrompt),
		});
		parsedOptions = modelResult.parsed;
		modelOutput = modelResult.raw;
		parseRetries = Math.max(0, modelResult.attempts - 1);
		// Cap text stored in the in-process Map to prevent memory bloat
		activeStreams.set(traceId, modelOutput.slice(0, STREAM_TEXT_CAP));
		touchStream(traceId);
	} catch (err) {
		parseError = err.message;
		modelOutput = String(err.rawModelResponse || '');
		activeStreams.set(traceId, modelOutput.slice(0, STREAM_TEXT_CAP));
		touchStream(traceId);
	}

	const { options: validatedOptions, repairErrors } = buildValidatedResolutionOptions({
		rawResponse: modelOutput,
		parsedResponse: parsedOptions,
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

	const structuralValidation = summarizeResolutionValidation(modelOutput, parsedOptions);
	const validationErrors = parseError
		? [`parse failure after retry: ${parseError}`, ...repairErrors]
		: [...structuralValidation.errors, ...repairErrors];
	const validationStatus = {
		valid: !parseError,
		errors: validationErrors,
		repairedCount: parseError ? repairErrors.length : structuralValidation.errors.length + repairErrors.length,
		parseRetries,
	};
	const nowIso = new Date().toISOString();

	const { queued: resQueued } = await resilientUpsert(
		'resolutions',
		{
			id: traceId,
			trace_id: traceId,
			impact_report_id: impactReport.id,
			disruption_id: impactReport.disruptionId,
			cascade_risk: impactReport.cascadeRisk,
			urgency: impactReport.urgency,
			total_cargo_at_risk_usd: impactReport.totalCargoAtRiskUSD,
			analysis_text: impactReport.analysisText,
			option_count: validatedOptions.length,
			status: 'pending',
			updated_at: nowIso,
		},
		{ onConflict: 'id' }
	);
	if (resQueued) console.warn('[ResolutionService] resolutions write queued for retry');

	const optionRows = validatedOptions.map((opt) => ({
		resolution_id: traceId,
		trace_id: traceId,
		rank: opt.rank,
		title: opt.title,
		description: opt.description,
		cost_delta: opt.costDelta,
		time_delta: opt.timeDelta,
		supplier_id: opt.supplierId || null,
		supplier_name: opt.supplierName,
		confidence: opt.confidence,
		route_geojson: opt.route,
		transport_mode: opt.route?.properties?.mode || 'sea-freight',
		selected: false,
	}));

	const { queued: optQueued } = await resilientUpsert('resolution_options', optionRows, {
		onConflict: 'resolution_id,rank',
	});
	if (optQueued) console.warn('[ResolutionService] resolution_options write queued for retry');

	const batch = db.batch();
	validatedOptions.forEach((opt) => {
		batch.set(
			db.collection('resolutions').doc(traceId).collection('options').doc(String(opt.rank)),
			toFirestoreSafeOption(opt)
		);
	});

	batch.set(db.collection('resolutions').doc(traceId), {
		traceId,
		impactReportId: impactReport.id,
		disruptionId: impactReport.disruptionId,
		cascadeRisk: impactReport.cascadeRisk,
		urgency: impactReport.urgency,
		totalCargoAtRiskUSD: impactReport.totalCargoAtRiskUSD,
		analysisText: impactReport.analysisText,
		optionCount: validatedOptions.length,
		createdAt: nowIso,
		updatedAt: nowIso,
		status: 'pending',
		systemPromptSnapshot: SYSTEM_PROMPT.slice(0, 2000),
		inputPayloadSnapshot: JSON.stringify(impactReport).slice(0, 3000),
		modelOutputSnapshot: modelOutput.slice(0, 10000),
		validationStatus,
	});

	await batch.commit();

	try {
		await db.collection('stats').doc('global').set(
			{
				totalResolutions: FieldValue.increment(1),
				humanHoursSaved: FieldValue.increment(6),
				totalCargoAnalyzedUSD: FieldValue.increment(Number(impactReport.totalCargoAtRiskUSD || 0)),
				updatedAt: nowIso,
			},
			{ merge: true }
		);
	} catch (err) {
		console.warn('[ResolutionService] stats update failed:', err.message);
	}

	await publish(
		TOPICS.RESOLUTION_OPTIONS,
		createAgentPayload(
			'resolution',
			{
				traceId,
				impactReportId: impactReport.id,
				disruptionId: impactReport.disruptionId,
				options: validatedOptions,
			},
			traceId
		)
	);

	setLastEventAt(nowIso);
	completedStreams.set(traceId, true);
	touchStream(traceId);

	setTimeout(() => {
		removeStream(traceId);
	}, STREAM_TTL_MS);
}

export function startResolutionSubscriber() {
	function connect() {
		if (_subscription) {
			try {
				_subscription.close();
			} catch {
				// no-op
			}
		}

		_subscription = subscribe(TOPICS.IMPACT_REPORTS, (message, isReplay) => {
			_lastMessageAt = Date.now();
			if (isReplay) {
				const publishedAt = message?._publishedAt ? new Date(message._publishedAt).getTime() : 0;
				if (!publishedAt || Date.now() - publishedAt > 600000) return;
			}

			// Serialise processing with queue: if a heavy AI job is already running,
			// queue the message for later processing instead of dropping it.
			if (_processing) {
				if (_pendingQueue.length < 5) { // cap at 5 to prevent RAM overflow
					_pendingQueue.push(message);
					console.warn('[ResolutionService] Queued event for later processing (queue length:', _pendingQueue.length + ')');
				} else {
					console.warn('[ResolutionService] Queue full, dropping event');
				}
				return;
			}
			_processing = true;
			processImpactReport(message)
				.catch((err) => console.error('[ResolutionService] processImpactReport error:', err.message))
				.finally(() => {
					_processing = false;
					const next = _pendingQueue.shift();
					if (next) {
						_processing = true;
						processImpactReport(next)
							.catch((err) => console.error('[ResolutionService] Queue processing error:', err.message))
							.finally(() => { _processing = false; });
					}
				});
		});

		console.log('[ResolutionService] SSE subscription established');
	}

	connect();

	const healthCheckTimer = setInterval(() => {
		const stale = _lastMessageAt && Date.now() - _lastMessageAt > STALE_THRESHOLD;
		if (stale || !_subscription || _subscription.readyState === 2) {
			console.warn('[ResolutionService] SSE connection stale, reconnecting...');
			connect();
		}
	}, HEALTH_CHECK_INTERVAL);
	healthCheckTimer.unref?.();
}
