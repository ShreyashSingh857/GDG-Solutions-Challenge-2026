import { NextResponse } from 'next/server';
import { adminDb } from '../../../lib/firebase-admin.js';

export async function GET() {
  try {
    const snap = await adminDb.collection('disruptions').orderBy('detectedAt', 'desc').limit(20).get();
    const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ data, error: null });
  } catch (err) {
    return NextResponse.json({ data: null, error: err.message }, { status: 500 });
  }
}