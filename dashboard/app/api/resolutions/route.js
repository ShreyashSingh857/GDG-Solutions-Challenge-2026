import { NextResponse } from 'next/server';
import { adminDb } from '../../../lib/firebase-admin.js';

export async function GET() {
  try {
    const parent = await adminDb.collection('resolutions').orderBy('createdAt', 'desc').limit(1).get();
    if (parent.empty) return NextResponse.json({ data: null, error: null });
    const doc = parent.docs[0];
    const opt = await adminDb.collection('resolutions').doc(doc.id).collection('options').get();
    const options = opt.docs.map((d) => ({ ...d.data() })).sort((a, b) => a.rank - b.rank);
    return NextResponse.json({ data: { id: doc.id, ...doc.data(), options }, error: null });
  } catch (err) {
    return NextResponse.json({ data: null, error: err.message }, { status: 500 });
  }
}