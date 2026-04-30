import { db } from '../../shared/db/firebase.js';
import { supabase } from '../../shared/db/supabase.js';

/**
 * Query Supabase shipments table as a fallback when Firestore is unavailable.
 * Column names use snake_case (Supabase) and are remapped to camelCase to match
 * the shape that scoreShipmentsWithTradeWeight expects.
 */
async function getShipmentsFromSupabase(epicenterLat, epicenterLng, bboxDegrees) {
	const minLat = epicenterLat - bboxDegrees;
	const maxLat = epicenterLat + bboxDegrees;
	const minLng = epicenterLng - bboxDegrees;
	const maxLng = epicenterLng + bboxDegrees;

	const { data, error } = await supabase
		.from('shipments')
		.select('id, origin, destination, carrier, cargo_value_usd, corridor, current_lat, current_lng, eta, status')
		.gte('current_lat', minLat)
		.lte('current_lat', maxLat)
		.gte('current_lng', minLng)
		.lte('current_lng', maxLng)
		.in('status', ['active', 'delayed']);

	if (error) throw new Error(`[ShipmentLookup] Supabase fallback failed: ${error.message}`);

	// Remap snake_case -> camelCase to match Firestore doc shape.
	return (data || []).map((row) => ({
		id: row.id,
		origin: row.origin,
		destination: row.destination,
		carrier: row.carrier,
		cargoValueUSD: Number(row.cargo_value_usd || 0),
		corridor: row.corridor,
		currentLat: Number(row.current_lat),
		currentLng: Number(row.current_lng),
		eta: row.eta,
		status: row.status,
	}));
}

export async function getShipmentsNearEpicenter(epicenterLat, epicenterLng, bboxDegrees = 15) {
	// Primary: Firestore.
	try {
		const snapshot = await db.collection('shipments')
			.where('currentLat', '>=', epicenterLat - bboxDegrees)
			.where('currentLat', '<=', epicenterLat + bboxDegrees)
			.get();

		const minLng = epicenterLng - bboxDegrees;
		const maxLng = epicenterLng + bboxDegrees;

		return snapshot.docs
			.map((doc) => ({ id: doc.id, ...doc.data() }))
			.filter((s) => ['active', 'delayed'].includes(s.status))
			.filter((s) => s.currentLng >= minLng && s.currentLng <= maxLng);
	} catch (firestoreErr) {
		console.warn('[ShipmentLookup] Firestore read failed, falling back to Supabase:', firestoreErr.message);
	}

	// Fallback: Supabase.
	try {
		return await getShipmentsFromSupabase(epicenterLat, epicenterLng, bboxDegrees);
	} catch (supabaseErr) {
		console.warn('[ShipmentLookup] Supabase fallback also failed:', supabaseErr.message);
		return [];
	}
}
