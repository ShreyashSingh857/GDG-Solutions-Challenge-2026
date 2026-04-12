import { db } from '../../shared/db/firebase.js';

export async function findSuppliers(region, capability = null, limit = 3) {
	let query = db.collection('suppliers').where('region', '==', region); if (capability) query = query.where('capabilities', 'array-contains', capability);
	const snapshot = await query.get(); const suppliers = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })).sort((a, b) => b.reliabilityScore - a.reliabilityScore).slice(0, limit);
	if (suppliers.length === 0) return (await db.collection('suppliers').orderBy('reliabilityScore', 'desc').limit(limit).get()).docs.map((doc) => ({ id: doc.id, ...doc.data() }));
	return suppliers;
}
