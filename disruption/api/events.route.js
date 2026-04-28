import { classifyAndPublish } from './events.service.js';
import { db } from '../shared/db/firebase.js';

export default async function eventsRoute(app) {
	app.post('/events', async (req, reply) => {
		const { description, rawDescription, traceId } = req.body || {};
		const eventText = description || rawDescription;
		if (!eventText || typeof eventText !== 'string' || eventText.trim().length < 10) return reply.status(400).send({ error: 'description is required and must be at least 10 characters', traceId: null });
		try {
			const result = await classifyAndPublish(eventText.trim(), traceId || null);
			return reply.status(201).send({ data: result.disruptionEvent, published: result.published, traceId: result.traceId || result.disruptionEvent.id, error: null });
		} catch (err) {
			return reply.status(500).send({ error: err.message, traceId: null, data: null });
		}
	});
	app.get('/events', async () => {
		const snapshot = await db.collection('disruptions').orderBy('detectedAt', 'desc').limit(20).get();
		return { data: snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })), error: null, count: snapshot.size };
	});
	app.get('/events/:id', async (req, reply) => {
		const doc = await db.collection('disruptions').doc(req.params.id).get();
		if (!doc.exists) return reply.status(404).send({ error: `Event not found: ${req.params.id}`, data: null });
		return { data: { id: doc.id, ...doc.data() }, error: null };
	});
}
