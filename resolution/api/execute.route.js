import { db } from '../../shared/db/firebase.js';
import { supabase } from '../../shared/db/supabase.js';

export default async function executeRoute(app) {
	app.post('/execute', async (req, reply) => {
		const { traceId, rank } = req.body || {};
		if (!traceId || !rank) {
			return reply.status(400).send({ error: 'traceId and rank are required', data: null });
		}
		if (![1, 2, 3].includes(Number(rank))) {
			return reply.status(400).send({ error: 'rank must be 1, 2, or 3', data: null });
		}

		const { data: existing, error: checkErr } = await supabase
			.from('resolution_options')
			.select('id, selected, rank, title')
			.eq('resolution_id', traceId)
			.eq('rank', Number(rank))
			.single();

		if (checkErr || !existing) {
			return reply.status(404).send({ error: `Option rank ${rank} not found for traceId: ${traceId}`, data: null });
		}

		if (existing.selected) {
			return reply.send({
				data: { message: 'Option already executed (idempotent)', option: existing },
				error: null,
				traceId,
			});
		}

		const { error: selErr } = await supabase
			.from('resolution_options')
			.update({ selected: true, executed_at: new Date().toISOString() })
			.eq('resolution_id', traceId)
			.eq('rank', Number(rank));

		if (selErr) {
			console.error('[ExecuteRoute] Supabase update failed:', selErr.message);
			return reply.status(500).send({ error: selErr.message, data: null });
		}

		await supabase
			.from('resolutions')
			.update({ status: 'resolved', selected_rank: Number(rank), resolved_at: new Date().toISOString() })
			.eq('id', traceId);

		try {
			const optionRef = db.collection('resolutions').doc(traceId).collection('options').doc(String(rank));
			await optionRef.update({ selected: true, executedAt: new Date().toISOString() });
			await db.collection('resolutions').doc(traceId).update({
				status: 'resolved',
				selectedRank: Number(rank),
				resolvedAt: new Date().toISOString(),
			});

			const resDoc = await db.collection('resolutions').doc(traceId).get();
			const resolution = resDoc.data();
			if (resolution?.disruptionId) {
				const shipmentsSnap = await db.collection('shipments').where('disruptionId', '==', resolution.disruptionId).get();
				if (!shipmentsSnap.empty) {
					const shipBatch = db.batch();
					shipmentsSnap.docs.forEach((doc) => shipBatch.update(doc.ref, {
						status: 'rerouted',
						selectedOptionRank: Number(rank),
						reroutedAt: new Date().toISOString(),
					}));
					await shipBatch.commit();
				}
			}
		} catch (fsErr) {
			console.error('[ExecuteRoute] Firestore update failed (non-fatal):', fsErr.message);
		}

		console.log(`[ExecuteRoute] Executed option rank ${rank} for traceId: ${traceId}`);
		return reply.send({
			data: { message: 'Resolution executed successfully', rank: Number(rank), traceId },
			error: null,
			traceId,
		});
	});
}
