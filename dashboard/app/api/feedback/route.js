import { NextResponse } from 'next/server';
import { adminDb } from '../../../lib/firebase-admin.js';

const ALLOWED_THUMBS = new Set(['up', 'down']);

export async function POST(req) {
  try {
    const body = await req.json();
    const traceId = String(body?.traceId || '').trim();
    const rank = Number(body?.rank);
    const thumbs = String(body?.thumbs || '').trim();

    if (!traceId || !Number.isFinite(rank) || !ALLOWED_THUMBS.has(thumbs)) {
      return NextResponse.json({ error: 'Invalid feedback payload' }, { status: 400 });
    }

    const feedbackId = `${traceId}:${rank}`;
    await adminDb.collection('feedback').doc(feedbackId).set({
      traceId,
      rank,
      thumbs,
      createdAt: new Date().toISOString(),
    }, { merge: true });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Failed to store feedback' }, { status: 500 });
  }
}