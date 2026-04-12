import { db } from '../../shared/db/firebase.js';

export default async function impactRoute(app) {
	app.get('/impact/:id', async (req, reply) => {
		const doc = await db.collection('impactReports').doc(req.params.id).get();
		if (!doc.exists) return reply.status(404).send({ error: `ImpactReport not found: ${req.params.id}`, data: null });
		return { data: { id: doc.id, ...doc.data() }, error: null };
	});
	app.post('/impact/run', async (req, reply) => {
		const { disruptionId } = req.body || {}; if (!disruptionId) return reply.status(400).send({ error: 'disruptionId is required', data: null });
		const doc = await db.collection('disruptions').doc(disruptionId).get();
		if (!doc.exists) return reply.status(404).send({ error: `Disruption not found: ${disruptionId}`, data: null });
		return reply.status(202).send({ data: { message: 'Impact analysis queued', disruptionId }, error: null, traceId: `manual-${disruptionId}` });
	});
}
