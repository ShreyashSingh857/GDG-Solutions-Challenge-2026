import { db } from '../../shared/db/firebase.js';
import { getStreamText } from './options.service.js';

export default async function optionsRoute(app) {
	app.get('/options/stream/:traceId', async (req, reply) => {
		reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
		const send = (type, data) => reply.raw.write(`data: ${JSON.stringify({ type, data })}\n\n`); const existingText = getStreamText(req.params.traceId); if (existingText) { send('chunk', existingText); send('done', { traceId: req.params.traceId }); return reply.raw.end(); }
		let lastLength = 0; const interval = setInterval(() => { const currentText = getStreamText(req.params.traceId); if (currentText && currentText.length > lastLength) { send('chunk', currentText.slice(lastLength)); lastLength = currentText.length; } }, 100);
		const timeout = setTimeout(() => { send('done', { traceId: req.params.traceId }); clearInterval(interval); reply.raw.end(); }, 30000);
		req.raw.on('close', () => { clearInterval(interval); clearTimeout(timeout); });
	});
	app.get('/options/:traceId', async (req, reply) => {
		const snapshot = await db.collection('resolutions').doc(req.params.traceId).collection('options').get();
		if (snapshot.empty) return reply.status(404).send({ error: `No options found for traceId: ${req.params.traceId}`, data: null });
		return { data: snapshot.docs.map((doc) => ({ ...doc.data() })).sort((a, b) => a.rank - b.rank), error: null, traceId: req.params.traceId };
	});
}
