import { NextResponse } from 'next/server';
import { adminDb } from '../../../lib/firebase-admin.js';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const disruptionId = searchParams.get('disruptionId');

    let resolutionQuery = adminDb.collection('resolutions').orderBy('createdAt', 'desc').limit(1);
    if (disruptionId) {
      resolutionQuery = adminDb
        .collection('resolutions')
        .where('disruptionId', '==', disruptionId)
        .orderBy('createdAt', 'desc')
        .limit(1);
    }

    const parent = await resolutionQuery.get();
    if (parent.empty) return NextResponse.json({ data: null, error: null });
    const doc = parent.docs[0];
    const opt = await adminDb.collection('resolutions').doc(doc.id).collection('options').get();
    const options = opt.docs.map((d) => ({ ...d.data() })).sort((a, b) => a.rank - b.rank);
    return NextResponse.json({ data: { id: doc.id, ...doc.data(), options }, error: null });
  } catch (err) {
    return NextResponse.json({ data: null, error: err.message }, { status: 500 });
  }
}