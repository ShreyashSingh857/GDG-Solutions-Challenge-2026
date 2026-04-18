import Fastify from 'fastify';
import cors from '@fastify/cors';
import 'dotenv/config';
import { lastEventAt } from './state.js';
import { createLogger } from '../shared/lib/logger.js';
import { createMetrics } from '../shared/lib/metrics.js';
import { validateEnv } from '../shared/lib/validateEnv.js';

validateEnv('DisruptionAgent', ['GEMINI_API_KEY', 'FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY']);
const logger = createLogger('disruption-agent');
const metrics = createMetrics('disruption-agent');

const app = Fastify({ logger: true });
await app.register(cors, { origin: '*' });

const startTime = Date.now();

app.addHook('onRequest', async (req) => {
	req._startAt = Date.now();
});
app.addHook('onResponse', async (req, reply) => {
	metrics.recordRequest(Date.now() - (req._startAt || Date.now()), reply.statusCode);
});

const { default: eventsRoute } = await import('./api/events.route.js');
if (typeof eventsRoute === 'function') app.register(eventsRoute);
const { pollPortCongestion, pollCanalStatus } = await import('./api/events.service.js');
const { startAISStream, MAJOR_CORRIDORS } = await import('./tools/aisStreamTool.js');

// Poll live port congestion signals hourly to auto-generate disruption events.
setInterval(() => {
	pollPortCongestion().catch((err) =>
		console.warn('[DisruptionAgent] pollPortCongestion failed:', err.message)
	);
	pollCanalStatus().catch((err) =>
		console.warn('[DisruptionAgent] pollCanalStatus failed:', err.message)
	);
}, 3600000);

pollPortCongestion().catch((err) =>
	console.warn('[DisruptionAgent] initial pollPortCongestion failed:', err.message)
);

pollCanalStatus().catch((err) =>
	console.warn('[DisruptionAgent] initial pollCanalStatus failed:', err.message)
);

startAISStream(MAJOR_CORRIDORS);

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
} catch (err) {
	app.log.error(err);
	process.exit(1);
}
