import { generateWithToolsAndTrace } from '../shared/lib/gemini.js';
import { generateWithRetry } from '../shared/lib/llmJson.js';
import { DISRUPTION_SCHEMA, validateAndRepair } from '../shared/lib/validateSchema.js';
import { db } from '../shared/db/firebase.js';
import { resilientUpsert, supabase } from '../shared/db/supabase.js';
import { publish } from '../shared/eventBusClient.js';
import { TOPICS } from '../shared/lib/topics.js';
import { createAgentPayload } from '../shared/types/AgentPayload.js';
import { createDisruptionEvent, validateDisruptionEvent } from '../types/DisruptionEvent.js';
import { weatherToolDeclaration, getWeatherData } from '../tools/weatherTool.js';
import { searchToolDeclaration, searchWeb } from '../tools/searchTool.js';
import { detectPortCongestionEvents } from '../tools/portWatchTool.js';
import { assessSuezCanalStatus } from '../tools/suezCanalScraper.js';
import { assessPanamaStatus } from '../tools/panamaCanalScraper.js';
import { assessCorridorWeatherRisk } from '../tools/ecmwfScraper.js';
import { setLastEventAt } from '../state.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SYSTEM_PROMPT = readFileSync(join(__dirname, '../agent/prompt.md'), 'utf-8');
const CONFIDENCE_THRESHOLD = 0.6;
const PUSH_MIN_SEVERITY = 7;
const MONITORED_PORTS = [
	'CNSHA', 'CNNGB', 'SGSIN', 'USLAX', 'USNYC', 'DEHAM', 'NLRTM', 'AEJEA', 'EGPSD', 'KRPUS',
];

let webpushModule = null;
let vapidConfigured = false;

async function getWebPushModule() {
	if (webpushModule) return webpushModule;
	try {
		const mod = await import('web-push');
		webpushModule = mod.default || mod;
		return webpushModule;
	} catch {
		return null;
	}
}

async function sendPushToSubscribers(disruptionEvent) {
	if (disruptionEvent.severity < PUSH_MIN_SEVERITY) return;
	if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return;

	const webpush = await getWebPushModule();
	if (!webpush) return;

	if (!vapidConfigured) {
		webpush.setVapidDetails(
			`mailto:${process.env.VAPID_EMAIL || 'ops@example.com'}`,
			process.env.VAPID_PUBLIC_KEY,
			process.env.VAPID_PRIVATE_KEY
		);
		vapidConfigured = true;
	}

	let rows = [];
	try {
		const { data, error } = await supabase
			.from('push_subscriptions')
			.select('endpoint,p256dh,auth')
			.eq('org_id', process.env.DEFAULT_ORG_ID || 'demo-org')
			.limit(500);
		if (error) {
			console.warn('[DisruptionService] push_subscriptions query failed:', error.message);
			return;
		}
		rows = data || [];
	} catch (err) {
		console.warn('[DisruptionService] Push query unavailable:', err.message);
		return;
	}

	if (!rows.length) return;

	const payload = JSON.stringify({
		title: `${disruptionEvent.type} Alert - Severity ${disruptionEvent.severity}/10`,
		body: disruptionEvent.location,
		url: `/?disruption=${disruptionEvent.id}`,
	});

	const sends = rows.map((sub) => {
		if (!sub.endpoint || !sub.p256dh || !sub.auth) return Promise.resolve();
		return webpush
			.sendNotification(
				{ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
				payload
			)
			.catch((err) => {
				if (err?.statusCode === 404 || err?.statusCode === 410) {
					return supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint).then(() => null).catch(() => null);
				}
				return null;
			});
	});

	await Promise.allSettled(sends);
}

function fallbackDisruption(rawDescription) {
	const text = rawDescription.toLowerCase();
	if (text.includes('storm') || text.includes('weather') || text.includes('typhoon') || text.includes('hurricane')) {
		return {
			type: 'WEATHER',
			severity: 8,
			location: 'Pacific Ocean',
			epicenterLat: 25,
			epicenterLng: 140,
			confidence: 0.85,
			affectedZones: ['Pacific'],
			unverified: false,
			corroboratingSources: 1,
		};
	}
	if (text.includes('strike') || text.includes('port') || text.includes('labor')) {
		return {
			type: 'STRIKE',
			severity: 7,
			location: 'Major Port Hub',
			epicenterLat: 25.0,
			epicenterLng: 55.0,
			confidence: 0.7,
			affectedZones: ['Middle East Corridor'],
			unverified: false,
			corroboratingSources: 1,
		};
	}
	return {
		type: 'OTHER',
		severity: 5,
		location: 'Global Shipping Corridor',
		epicenterLat: 20,
		epicenterLng: 0,
		confidence: 0.65,
		affectedZones: [],
		unverified: true,
		corroboratingSources: 0,
	};
}

function parseDomain(url) {
	try {
		return new URL(url).hostname.toLowerCase();
	} catch {
		return '';
	}
}

function countCorroboratingSources(toolTrace = []) {
	const domains = new Set();
	for (const call of toolTrace) {
		if (call?.name !== 'search_web') continue;
		for (const result of call?.response?.results || []) {
			const sourceDomain = String(result?.source || '').toLowerCase();
			const urlDomain = parseDomain(result?.url || '');
			const domain = sourceDomain || urlDomain;
			if (domain) domains.add(domain);
		}
	}
	return domains.size;
}

function applyConfidenceCalibration(event, corroboratingSources) {
	const errors = [];
	const sourceCount = Number.isFinite(corroboratingSources) ? corroboratingSources : 0;

	event.corroboratingSources = sourceCount;

	if (sourceCount === 0) {
		if (event.confidence > 0.55) {
			errors.push(`confidence capped to 0.55 due to zero corroborating sources (was ${event.confidence})`);
			event.confidence = 0.55;
		}
		if (event.unverified !== true) {
			errors.push('unverified set to true due to zero corroborating sources');
			event.unverified = true;
		}
	}

	if (sourceCount < 2 && event.confidence > 0.9) {
		errors.push(`confidence capped to 0.9 due to fewer than 2 corroborating sources (was ${event.confidence})`);
		event.confidence = 0.9;
	}

	if (sourceCount >= 2 && event.unverified === undefined) {
		event.unverified = false;
	}

	return errors;
}

export async function classifyAndPublish(rawDescription, traceId = null) {
	let parsed;
	let rawModelResponse = '';
	let parseError = null;
	let retriesUsed = 0;
	let toolTrace = [];
	try {
		const toolHandlers = { get_weather_data: getWeatherData, search_web: searchWeb };
		const modelResult = await generateWithRetry(
			`${SYSTEM_PROMPT}\n\n## Event to Classify\n\n${rawDescription}`,
			SYSTEM_PROMPT,
			{
				maxRetries: 2,
				invokeModel: (prompt) =>
					generateWithToolsAndTrace(
						prompt,
						[weatherToolDeclaration, searchToolDeclaration],
						toolHandlers
					),
				extractText: (result) => result?.text ?? '',
			}
		);
		rawModelResponse = modelResult.raw;
		parsed = modelResult.parsed;
		retriesUsed = Math.max(0, modelResult.attempts - 1);
		toolTrace = modelResult.modelResult?.toolTrace || [];
	} catch (err) {
		console.warn('[DisruptionService] Gemini parse failed, using fallback classifier:', err.message);
		parseError = err.message;
		rawModelResponse = String(err.rawModelResponse || rawModelResponse || '');
		parsed = fallbackDisruption(rawDescription);
	}
	const corroboratingSources = countCorroboratingSources(toolTrace);
	const fallback = {
		...fallbackDisruption(rawDescription),
		corroboratingSources,
		unverified: corroboratingSources === 0,
	};
	const validated = validateAndRepair(parsed, DISRUPTION_SCHEMA, fallback);
	parsed = {
		...validated.data,
		corroboratingSources,
	};
	const confidenceCalibrationErrors = applyConfidenceCalibration(parsed, corroboratingSources);

	if (parsed.type === 'WEATHER' && parsed.epicenterLat && parsed.epicenterLng) {
		parsed._weatherData = await getWeatherData({
			latitude: parsed.epicenterLat,
			longitude: parsed.epicenterLng,
		}).catch(() => null);
	}

	const nonParseErrors = [...validated.errors, ...confidenceCalibrationErrors];
	const validationErrors = parseError
		? [`parse failure after retry: ${parseError}`, ...nonParseErrors]
		: nonParseErrors;
	const disruptionEvent = createDisruptionEvent({ ...parsed, rawDescription });
	validateDisruptionEvent(disruptionEvent);
	db.collection('disruptions').doc(disruptionEvent.id).set({
		...disruptionEvent,
		systemPromptSnapshot: SYSTEM_PROMPT.slice(0, 2000),
		inputPayloadSnapshot: rawDescription.slice(0, 3000),
		modelOutputSnapshot: String(rawModelResponse || '').slice(0, 10000),
		validationStatus: {
			valid: !parseError,
			errors: validationErrors,
			repairedCount: nonParseErrors.length,
			parseRetries: retriesUsed,
			corroboratingSources,
		},
	}).catch((err) => {
		console.warn('[DisruptionService] Firestore write failed (non-fatal):', err.message);
	});
	const { queued } = await resilientUpsert('disruptions', {
		id: disruptionEvent.id,
		trace_id: traceId || disruptionEvent.id,
		type: disruptionEvent.type,
		severity: disruptionEvent.severity,
		location: disruptionEvent.location,
		epicenter_lat: disruptionEvent.epicenterLat,
		epicenter_lng: disruptionEvent.epicenterLng,
		affected_zones: disruptionEvent.affectedZones,
		confidence: disruptionEvent.confidence,
		raw_description: rawDescription,
		weather_data: parsed._weatherData || null,
		published: disruptionEvent.confidence >= CONFIDENCE_THRESHOLD,
		detected_at: disruptionEvent.detectedAt,
	}, { onConflict: 'id' });
	if (queued) console.warn('[DisruptionService] Supabase disruptions write queued for retry');
	setLastEventAt(new Date().toISOString());
	if (disruptionEvent.confidence < CONFIDENCE_THRESHOLD) return { disruptionEvent, published: false };
	await sendPushToSubscribers(disruptionEvent);
	const agentPayload = createAgentPayload('monitor', disruptionEvent, traceId);
	await publish(TOPICS.DISRUPTION_EVENTS, agentPayload);
	return { disruptionEvent, published: true, traceId: agentPayload.traceId };
}

export async function pollPortCongestion() {
	try {
		const congested = await detectPortCongestionEvents(MONITORED_PORTS, 48);
		for (const port of congested) {
			const rawDescription = `Port congestion alert at ${port.portName} (${port.locode}): average vessel wait time is ${port.avgWaitHours.toFixed(1)} hours, congestion index ${port.congestionScore}/100.`;
			await classifyAndPublish(rawDescription);
		}
		if (congested.length) {
			console.log(`[DisruptionService] PortWatch generated ${congested.length} congestion events`);
		}
	} catch (err) {
		console.warn('[DisruptionService] PortWatch poll failed:', err.message);
	}
}

export async function pollCanalStatus() {
	try {
		const [suez, panama] = await Promise.all([
			assessSuezCanalStatus(),
			assessPanamaStatus(),
		]);
		if (suez?.isDisrupted) {
			await classifyAndPublish(suez.summary);
		}
		if (panama?.isDisrupted) {
			await classifyAndPublish(panama.summary);
		}
	} catch (err) {
		console.warn('[DisruptionService] Canal poll failed:', err.message);
	}
}

export async function pollCorridorWeather() {
	try {
		const corridors = await assessCorridorWeatherRisk();
		for (const corridor of corridors) {
			if (corridor.routingRiskLevel === 'SEVERE' || corridor.routingRiskLevel === 'EXTREME') {
				await classifyAndPublish(
					`ECMWF 7-day forecast: ${corridor.routingRiskLevel} conditions on ${corridor.corridor}. ` +
					`Max wave height ${corridor.maxWaveHeightM.toFixed(1)}m, ` +
					`winds ${corridor.maxWindSpeedKmh.toFixed(0)} km/h, ` +
					`peaking at ${corridor.peakConditionsAt}.`
				);
			}
		}
	} catch (err) {
		console.warn('[DisruptionService] Corridor weather poll failed:', err.message);
	}
}
