import { db } from '../../shared/db/firebase.js';

export default async function executeRoute(app) {
	app.post('/execute', async (req, reply) => {
		const { traceId, rank } = req.body || {}; if (!traceId || !rank) return reply.status(400).send({ error: 'traceId and rank are required', data: null }); if (![1,2,3].includes(Number(rank))) return reply.status(400).send({ error: 'rank must be 1, 2, or 3', data: null });
		const optionRef = db.collection('resolutions').doc(traceId).collection('options').doc(String(rank)); const optionDoc = await optionRef.get(); if (!optionDoc.exists) return reply.status(404).send({ error: `Option rank ${rank} not found for traceId: ${traceId}`, data: null }); const option = optionDoc.data(); if (option.selected === true) return reply.send({ data: { message: 'Option already executed (idempotent)', option }, error: null, traceId });
		await optionRef.update({ selected: true, executedAt: new Date().toISOString() }); await db.collection('resolutions').doc(traceId).update({ status: 'resolved', selectedRank: rank, resolvedAt: new Date().toISOString() }); const resolution = (await db.collection('resolutions').doc(traceId).get()).data(); if (resolution?.disruptionId) { const shipmentsSnap = await db.collection('shipments').where('disruptionId', '==', resolution.disruptionId).get(); if (!shipmentsSnap.empty) { const batch = db.batch(); shipmentsSnap.docs.forEach((doc) => batch.update(doc.ref, { status: 'rerouted', selectedOptionRank: rank, reroutedAt: new Date().toISOString() })); await batch.commit(); } }
		return reply.send({ data: { message: 'Resolution executed successfully', option: { ...option, selected: true } }, error: null, traceId });
	});
}
