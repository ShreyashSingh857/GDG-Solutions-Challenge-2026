import Fastify from 'fastify';
import cors from '@fastify/cors';
import 'dotenv/config';
import { db } from '../shared/db/firebase.js';

const app = Fastify({ logger: true });
await app.register(cors, { origin: '*' });

const startTime = Date.now();
let lastEventAt = null;

// Register routes
import('./api/events.route.js').then((m) => app.register(m.default));

app.get('/health', async (req, reply) => {
	reply.send({
		status: 'ok',
		agent: 'disruption-monitor',
		uptime: Math.floor((Date.now() - startTime) / 1000),
		lastEventAt,
	});
});

// Export lastEventAt setter so the service layer can update it
export function setLastEventAt(ts) { lastEventAt = ts; }

try {
	await app.listen({ port: 3001, host: '0.0.0.0' });
	console.log('[DisruptionAgent] Running on port 3001');
} catch (err) {
	app.log.error(err);
	process.exit(1);
}
