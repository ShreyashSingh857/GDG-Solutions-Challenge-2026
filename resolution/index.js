import Fastify from 'fastify';
import cors from '@fastify/cors';
import 'dotenv/config';

const app = Fastify({ logger: true });
await app.register(cors, { origin: '*' });

const startTime = Date.now();
let lastEventAt = null;

import('./api/options.route.js').then((m) => app.register(m.default));
import('./api/execute.route.js').then((m) => app.register(m.default));

app.get('/health', async (req, reply) => {
	reply.send({
		status: 'ok',
		agent: 'resolution-negotiator',
		uptime: Math.floor((Date.now() - startTime) / 1000),
		lastEventAt,
	});
});

export function setLastEventAt(ts) { lastEventAt = ts; }

try {
	await app.listen({ port: 3003, host: '0.0.0.0' });
	console.log('[ResolutionAgent] Running on port 3003');
} catch (err) {
	app.log.error(err);
	process.exit(1);
}
