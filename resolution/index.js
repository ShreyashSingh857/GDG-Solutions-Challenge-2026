import Fastify from 'fastify';
import cors from '@fastify/cors';
import 'dotenv/config';
import { lastEventAt } from './state.js';
import { createLogger } from '../shared/lib/logger.js';
import { createMetrics } from '../shared/lib/metrics.js';
import { validateEnv } from '../shared/lib/validateEnv.js';

validateEnv('ResolutionAgent', ['GEMINI_API_KEY', 'FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY']);
const logger = createLogger('resolution-agent');
const metrics = createMetrics('resolution-agent');

const app = Fastify({ logger: true });
await app.register(cors, { origin: '*' });

const startTime = Date.now();

app.addHook('onRequest', async (req) => {
	req._startAt = Date.now();
});
app.addHook('onResponse', async (req, reply) => {
	metrics.recordRequest(Date.now() - (req._startAt || Date.now()), reply.statusCode);
});

const { default: optionsRoute } = await import('./api/options.route.js');
if (typeof optionsRoute === 'function') app.register(optionsRoute);
const { default: executeRoute } = await import('./api/execute.route.js');
if (typeof executeRoute === 'function') app.register(executeRoute);
const { startResolutionSubscriber } = await import('./api/options.service.js');
startResolutionSubscriber();

app.get('/health', async (req, reply) => {
	reply.send({
		status: 'ok',
		agent: 'resolution-negotiator',
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
	await app.listen({ port: 3003, host: '0.0.0.0' });
	logger.info('Service started', { port: 3003 });
} catch (err) {
	app.log.error(err);
	process.exit(1);
}
