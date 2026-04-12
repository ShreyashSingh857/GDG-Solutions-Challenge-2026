import { generate } from '../../shared/lib/gemini.js';
import { db } from '../../shared/db/firebase.js';
import { publish } from '../../shared/eventBusClient.js';
import { TOPICS } from '../../event-bus/topics.js';
import { createAgentPayload } from '../../shared/types/AgentPayload.js';
import { createDisruptionEvent, validateDisruptionEvent } from '../types/DisruptionEvent.js';
import { weatherToolDeclaration, getWeatherData } from '../tools/weatherTool.js';
import { searchToolDeclaration } from '../tools/searchTool.js';
import { setLastEventAt } from '../state.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SYSTEM_PROMPT = readFileSync(join(__dirname, '../agent/prompt.md'), 'utf-8');
const CONFIDENCE_THRESHOLD = 0.6;

export async function classifyAndPublish(rawDescription, traceId = null) {
	const rawResponse = await generate(`${SYSTEM_PROMPT}\n\n## Event to Classify\n\n${rawDescription}`, [weatherToolDeclaration, searchToolDeclaration]);
	const parsed = JSON.parse(rawResponse.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim());
	if (parsed.type === 'WEATHER' && parsed.epicenterLat && parsed.epicenterLng) parsed._weatherData = await getWeatherData({ latitude: parsed.epicenterLat, longitude: parsed.epicenterLng }).catch(() => null);
	const disruptionEvent = createDisruptionEvent({ ...parsed, rawDescription });
	validateDisruptionEvent(disruptionEvent);
	await db.collection('disruptions').doc(disruptionEvent.id).set(disruptionEvent);
	setLastEventAt(new Date().toISOString());
	if (disruptionEvent.confidence < CONFIDENCE_THRESHOLD) return { disruptionEvent, published: false };
	const agentPayload = createAgentPayload('monitor', disruptionEvent, traceId);
	await publish(TOPICS.DISRUPTION_EVENTS, agentPayload);
	return { disruptionEvent, published: true, traceId: agentPayload.traceId };
}
