import { db } from '../../shared/db/firebase.js';

export async function getShipmentsNearEpicenter(epicenterLat, epicenterLng, bboxDegrees = 15) {
	const snapshot = await db.collection('shipments').where('currentLat', '>=', epicenterLat - bboxDegrees).where('currentLat', '<=', epicenterLat + bboxDegrees).get();
	const minLng = epicenterLng - bboxDegrees, maxLng = epicenterLng + bboxDegrees;
	return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })).filter((s) => s.currentLng >= minLng && s.currentLng <= maxLng);
}
