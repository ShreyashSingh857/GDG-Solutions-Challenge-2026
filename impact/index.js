import Fastify from 'fastify';
import cors from '@fastify/cors';
import 'dotenv/config';

const app = Fastify({ logger: true });
await app.register(cors, { origin: '*' });

const startTime = Date.now();
let lastEventAt = null;

import('./api/impact.route.js').then((m) => {
	if (typeof m.default === 'function') app.register(m.default);
});

app.get('/health', async (req, reply) => {
	reply.send({
		status: 'ok',
		agent: 'impact-analyzer',
		uptime: Math.floor((Date.now() - startTime) / 1000),
		lastEventAt,
	});
});

export function setLastEventAt(ts) { lastEventAt = ts; }

try {
	await app.listen({ port: 3002, host: '0.0.0.0' });
	console.log('[ImpactAgent] Running on port 3002');
} catch (err) {
	app.log.error(err);
	process.exit(1);
}
