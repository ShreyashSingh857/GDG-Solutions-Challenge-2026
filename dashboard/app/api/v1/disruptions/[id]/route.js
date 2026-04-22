import { NextResponse } from 'next/server';
import { adminDb } from '../../../../../lib/firebase-admin.js';
import { verifyApiKey } from '../../_auth.js';

export async function GET(req, context) {
  const auth = await verifyApiKey(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await context.params;
  const disruptionDoc = await adminDb.collection('disruptions').doc(id).get();
  if (!disruptionDoc.exists) {
    return NextResponse.json({ error: 'Disruption not found' }, { status: 404 });
  }

  const disruption = { id: disruptionDoc.id, ...disruptionDoc.data() };

  const resSnap = await adminDb
    .collection('resolutions')
    .where('disruptionId', '==', id)
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get();

  let resolution = null;
  if (!resSnap.empty) {
    const resDoc = resSnap.docs[0];
    const optionsSnap = await resDoc.ref.collection('options').orderBy('rank', 'asc').get();
    resolution = {
      id: resDoc.id,
      ...resDoc.data(),
      options: optionsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    };
  }

  return NextResponse.json({ data: { disruption, resolution } });
}
