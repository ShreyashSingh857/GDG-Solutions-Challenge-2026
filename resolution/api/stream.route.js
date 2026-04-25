import { getStreamText, isStreamComplete } from './options.service.js';

export default async function streamRoute(app) {
	app.get('/stream/:traceId', async (req, reply) => {
		reply.raw.writeHead(200, {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive',
			'X-Accel-Buffering': 'no',
		});

		const { traceId } = req.params;
		let closed = false;
		let lastSent = 0;
		let idleTicks = 0;

		const send = (payload) => {
			if (closed) return;
			reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
		};

		const cleanup = () => {
			if (closed) return;
			closed = true;
			clearInterval(interval);
			clearInterval(keepAlive);
			if (!reply.raw.destroyed) {
				reply.raw.end();
			}
		};

		const interval = setInterval(() => {
			const text = getStreamText(traceId) || '';
			if (text.length > lastSent) {
				send({ chunk: text.slice(lastSent), total: text.length });
				lastSent = text.length;
				idleTicks = 0;
			} else {
				idleTicks += 1;
			}

			if (isStreamComplete(traceId) && text.length === lastSent) {
				send({ done: true, total: text.length });
				cleanup();
			}

			if (idleTicks > 600) {
				send({ done: true, total: text.length, timedOut: true });
				cleanup();
			}
		}, 100);

		const keepAlive = setInterval(() => {
			if (!closed) {
				reply.raw.write(': ping\n\n');
			}
		}, 15000);

		req.raw.on('close', cleanup);
	});
}
