import Fastify from 'fastify';
import cors from '@fastify/cors';
import 'dotenv/config';
import { lastEventAt } from './state.js';
import { createLogger } from '../shared/lib/logger.js';
import { createMetrics } from '../shared/lib/metrics.js';
import { validateEnv } from '../shared/lib/validateEnv.js';
import { startTelemetry } from '../shared/lib/telemetry.js';
import { buildHealthPayload } from '../shared/lib/health.js';

validateEnv('ImpactAgent', ['GEMINI_API_KEY', 'FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY']);
const logger = createLogger('impact-agent');
const metrics = createMetrics('impact-agent');
startTelemetry('impact-agent');

const app = Fastify({ logger: true });
await app.register(cors, { origin: '*' });

const startTime = Date.now();

app.addHook('onRequest', async (req) => {
	req._startAt = Date.now();
});
app.addHook('onResponse', async (req, reply) => {
	metrics.recordRequest(Date.now() - (req._startAt || Date.now()), reply.statusCode);
});

const { default: impactRoute } = await import('./api/impact.route.js');
if (typeof impactRoute === 'function') app.register(impactRoute);
const { startImpactSubscriber } = await import('./api/impact.service.js');
startImpactSubscriber();

app.get('/health', async (req, reply) => {
	reply.send(
		buildHealthPayload({
			agent: 'impact-analyzer',
			startedAt: startTime,
			lastEventAt,
			pendingQueueDepth: 0,
		})
	);
});

app.get('/metrics', async (req, reply) => {
	reply.send(metrics.snapshot({
		uptime: Math.floor((Date.now() - startTime) / 1000),
		lastEventAt,
	}));
});

try {
	await app.listen({ port: 3002, host: '0.0.0.0' });
	logger.info('Service started', { port: 3002 });
} catch (err) {
	app.log.error(err);
	process.exit(1);
}
