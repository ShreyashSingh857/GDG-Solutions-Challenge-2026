import { db } from '../../shared/db/firebase.js';
import { supabase } from '../../shared/db/supabase.js';
import { fanoutResolutionWebhooks } from '../tools/webhookFanout.js';

export default async function executeRoute(app) {
	app.post('/execute', async (req, reply) => {
		const { traceId, rank } = req.body || {};
		if (!traceId || !rank) {
			return reply.status(400).send({ error: 'traceId and rank are required', data: null });
		}
		if (![1, 2, 3].includes(Number(rank))) {
			return reply.status(400).send({ error: 'rank must be 1, 2, or 3', data: null });
		}

		const nowIso = new Date().toISOString();

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
			.update({ selected: true, executed_at: nowIso, updated_at: nowIso })
			.eq('resolution_id', traceId)
			.eq('rank', Number(rank));

		if (selErr) {
			console.error('[ExecuteRoute] Supabase update failed:', selErr.message);
			return reply.status(500).send({ error: selErr.message, data: null });
		}

		await supabase
			.from('resolutions')
			.update({ status: 'resolved', selected_rank: Number(rank), resolved_at: nowIso, updated_at: nowIso })
			.eq('id', traceId);

		const { data: allOptions } = await supabase
			.from('resolution_options')
			.select('rank,title,summary,reasoning,cost_delta_usd,time_delta_days,co2_delta_kg')
			.eq('resolution_id', traceId)
			.order('rank', { ascending: true });

		await fanoutResolutionWebhooks(process.env.DEFAULT_ORG_ID || 'demo-org', traceId, allOptions || []);

		try {
			const optionRef = db.collection('resolutions').doc(traceId).collection('options').doc(String(rank));
			await optionRef.update({ selected: true, executedAt: nowIso, updatedAt: nowIso });
			await db.collection('resolutions').doc(traceId).update({
				status: 'resolved',
				selectedRank: Number(rank),
				resolvedAt: nowIso,
				updatedAt: nowIso,
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
