import Fastify from 'fastify';
import cors from '@fastify/cors';
import 'dotenv/config';
import { lastEventAt } from './state.js';
import { createLogger } from '../shared/lib/logger.js';
import { createMetrics } from '../shared/lib/metrics.js';
import { validateEnv } from '../shared/lib/validateEnv.js';
import { supabase } from '../shared/db/supabase.js';
import { sendDailyDigest } from '../shared/lib/emailDigest.js';

validateEnv('DisruptionAgent', ['GEMINI_API_KEY', 'FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY']);
const logger = createLogger('disruption-agent');
const metrics = createMetrics('disruption-agent');

const app = Fastify({ logger: true });
await app.register(cors, { origin: '*' });

const startTime = Date.now();

function scheduleDailyDigest() {
	if (!process.env.DIGEST_EMAIL) return;

	const now = new Date();
	const nextRun = new Date(now);
	nextRun.setHours(7, 0, 0, 0);
	if (nextRun <= now) {
		nextRun.setDate(nextRun.getDate() + 1);
	}

	const delay = nextRun.getTime() - now.getTime();
	const timer = setTimeout(async () => {
		try {
			const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
			const [{ data: disruptions }, { data: resolutions }] = await Promise.all([
				supabase.from('disruptions').select('type,severity,location,detected_at').gte('detected_at', sinceIso),
				supabase.from('resolutions').select('status,created_at').gte('created_at', sinceIso),
			]);

			await sendDailyDigest({
				orgId: process.env.DEFAULT_ORG_ID || 'demo-org',
				recipientEmail: process.env.DIGEST_EMAIL,
				disruptions: disruptions || [],
				resolutions: resolutions || [],
			});
		} catch (err) {
			logger.warn('Daily digest failed', { error: err.message });
		}

		scheduleDailyDigest();
	}, delay);

	timer.unref?.();
}

app.addHook('onRequest', async (req) => {
	req._startAt = Date.now();
});
app.addHook('onResponse', async (req, reply) => {
	metrics.recordRequest(Date.now() - (req._startAt || Date.now()), reply.statusCode);
});

const { default: eventsRoute } = await import('./api/events.route.js');
if (typeof eventsRoute === 'function') app.register(eventsRoute);
const { pollPortCongestion, pollCanalStatus, pollCorridorWeather } = await import('./api/events.service.js');
const { startAISStream, MAJOR_CORRIDORS } = await import('./tools/aisStreamTool.js');

app.get('/health', async (req, reply) => {
	reply.send({
		status: 'ok',
		agent: 'disruption-monitor',
		uptime: Math.floor((Date.now() - startTime) / 1000),
		lastEventAt,
	});
});

app.get('/metrics', async (req, reply) => {
	reply.send(metrics.snapshot({
		uptime: Math.floor((Date.now() - startTime) / 1000),
		lastEventAt,
	}));
});

try {
	await app.listen({ port: 3001, host: '0.0.0.0' });
	logger.info('Service started', { port: 3001 });
	startAISStream(MAJOR_CORRIDORS);

	setTimeout(() => {
		pollPortCongestion().catch((err) =>
			console.warn('[DisruptionAgent] initial pollPortCongestion failed:', err.message)
		);
	}, 15_000);

	setTimeout(() => {
		pollCanalStatus().catch((err) =>
			console.warn('[DisruptionAgent] initial pollCanalStatus failed:', err.message)
		);
	}, 20_000);

	setTimeout(() => {
		pollCorridorWeather().catch((err) =>
			console.warn('[DisruptionAgent] initial pollCorridorWeather failed:', err.message)
		);
	}, 25_000);

	scheduleDailyDigest();

	// Staggered polling schedule to avoid simultaneous external calls.
	setInterval(() => {
		pollPortCongestion().catch((err) =>
			console.warn('[DisruptionAgent] pollPortCongestion failed:', err.message)
		);
	}, 60 * 60_000);

	setInterval(() => {
		pollCanalStatus().catch((err) =>
			console.warn('[DisruptionAgent] pollCanalStatus failed:', err.message)
		);
	}, 65 * 60_000);

	setInterval(() => {
		pollCorridorWeather().catch((err) =>
			console.warn('[DisruptionAgent] pollCorridorWeather failed:', err.message)
		);
	}, 3 * 60 * 60_000);
} catch (err) {
	app.log.error(err);
	process.exit(1);
}
