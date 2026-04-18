import { generateWithTools } from '../../shared/lib/gemini.js';
import { db } from '../../shared/db/firebase.js';
import { resilientUpsert } from '../../shared/db/supabase.js';
import { publish } from '../../shared/eventBusClient.js';
import { TOPICS } from '../../event-bus/topics.js';
import { createAgentPayload } from '../../shared/types/AgentPayload.js';
import { createDisruptionEvent, validateDisruptionEvent } from '../types/DisruptionEvent.js';
import { weatherToolDeclaration, getWeatherData } from '../tools/weatherTool.js';
import { searchToolDeclaration, searchWeb } from '../tools/searchTool.js';
import { detectPortCongestionEvents } from '../tools/portWatchTool.js';
import { checkSuezCanalStatus, checkPanamaWaterLevel } from '../tools/canalStatusTool.js';
import { setLastEventAt } from '../state.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SYSTEM_PROMPT = readFileSync(join(__dirname, '../agent/prompt.md'), 'utf-8');
const CONFIDENCE_THRESHOLD = 0.6;
const MONITORED_PORTS = [
	'CNSHA', 'CNNGB', 'SGSIN', 'USLAX', 'USNYC', 'DEHAM', 'NLRTM', 'AEJEA', 'EGPSD', 'KRPUS',
];

function fallbackDisruption(rawDescription) {
	const text = rawDescription.toLowerCase();
	if (text.includes('storm') || text.includes('weather') || text.includes('typhoon') || text.includes('hurricane')) {
		return { type: 'WEATHER', severity: 8, location: 'Pacific Ocean', epicenterLat: 25, epicenterLng: 140, confidence: 0.85, affectedZones: ['Pacific'] };
	}
	if (text.includes('strike') || text.includes('port') || text.includes('labor')) {
		return { type: 'STRIKE', severity: 7, location: 'Major Port Hub', epicenterLat: 25.0, epicenterLng: 55.0, confidence: 0.7, affectedZones: ['Middle East Corridor'] };
	}
	return { type: 'OTHER', severity: 5, location: 'Global Shipping Corridor', epicenterLat: 20, epicenterLng: 0, confidence: 0.65, affectedZones: [] };
}

export async function classifyAndPublish(rawDescription, traceId = null) {
	let parsed;
	try {
		const toolHandlers = { get_weather_data: getWeatherData, search_web: searchWeb };
		const rawResponse = await generateWithTools(
			`${SYSTEM_PROMPT}\n\n## Event to Classify\n\n${rawDescription}`,
			[weatherToolDeclaration, searchToolDeclaration],
			toolHandlers
		);
		parsed = JSON.parse(rawResponse.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim());
	} catch (err) {
		console.warn('[DisruptionService] Gemini parse failed, using fallback classifier:', err.message);
		parsed = fallbackDisruption(rawDescription);
	}
	if (parsed.type === 'WEATHER' && parsed.epicenterLat && parsed.epicenterLng) parsed._weatherData = await getWeatherData({ latitude: parsed.epicenterLat, longitude: parsed.epicenterLng }).catch(() => null);
	const disruptionEvent = createDisruptionEvent({ ...parsed, rawDescription });
	validateDisruptionEvent(disruptionEvent);
	await db.collection('disruptions').doc(disruptionEvent.id).set(disruptionEvent);
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
			checkSuezCanalStatus(),
			checkPanamaWaterLevel(),
		]);
		if (suez?.disrupted) {
			await classifyAndPublish(`Suez Canal disruption detected: ${suez.latestHeadline || suez.note}`);
		}
		if (panama?.draftRestricted) {
			await classifyAndPublish(`Panama Canal draft restriction: ${panama.note}`);
		}
	} catch (err) {
		console.warn('[DisruptionService] Canal poll failed:', err.message);
	}
}
