import Fastify from 'fastify';
import cors from '@fastify/cors';
import 'dotenv/config';
import { lastEventAt } from './state.js';

const app = Fastify({ logger: true });
await app.register(cors, { origin: '*' });

const startTime = Date.now();

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

try {
	await app.listen({ port: 3001, host: '0.0.0.0' });
	console.log('[DisruptionAgent] Running on port 3001');
} catch (err) {
	app.log.error(err);
	process.exit(1);
}
