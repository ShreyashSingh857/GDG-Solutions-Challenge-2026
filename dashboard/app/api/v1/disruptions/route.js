import { NextResponse } from 'next/server';
import { adminDb } from '../../../../lib/firebase-admin.js';
import { verifyApiKey } from '../_auth.js';

export async function GET(req) {
  const auth = await verifyApiKey(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const limit = Math.min(Number(searchParams.get('limit') || 50), 200);

  const snapshot = await adminDb.collection('disruptions').orderBy('detectedAt', 'desc').limit(limit).get();
  let rows = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

  if (from) {
    const fromDate = new Date(from);
    rows = rows.filter((row) => new Date(row.detectedAt || row.receivedAt || 0) >= fromDate);
  }
  if (to) {
    const toDate = new Date(to);
    rows = rows.filter((row) => new Date(row.detectedAt || row.receivedAt || 0) <= toDate);
  }

  return NextResponse.json({ data: rows });
}
