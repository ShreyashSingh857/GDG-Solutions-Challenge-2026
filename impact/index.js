import Fastify from 'fastify';
import cors from '@fastify/cors';
import 'dotenv/config';
import { lastEventAt } from './state.js';

const app = Fastify({ logger: true });
await app.register(cors, { origin: '*' });

const startTime = Date.now();

const { default: impactRoute } = await import('./api/impact.route.js');
if (typeof impactRoute === 'function') app.register(impactRoute);
const { startImpactSubscriber } = await import('./api/impact.service.js');
startImpactSubscriber();

app.get('/health', async (req, reply) => {
	reply.send({
		status: 'ok',
		agent: 'impact-analyzer',
		uptime: Math.floor((Date.now() - startTime) / 1000),
		lastEventAt,
	});
});

try {
	await app.listen({ port: 3002, host: '0.0.0.0' });
	console.log('[ImpactAgent] Running on port 3002');
} catch (err) {
	app.log.error(err);
	process.exit(1);
}
