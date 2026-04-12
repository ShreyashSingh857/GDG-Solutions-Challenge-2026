import Fastify from 'fastify';
import cors from '@fastify/cors';
import 'dotenv/config';
import { lastEventAt } from './state.js';

const app = Fastify({ logger: true });
await app.register(cors, { origin: '*' });

const startTime = Date.now();

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

try {
	await app.listen({ port: 3003, host: '0.0.0.0' });
	console.log('[ResolutionAgent] Running on port 3003');
} catch (err) {
	app.log.error(err);
	process.exit(1);
}
