import { NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import '../../../../lib/firebase-admin.js';

export async function POST(req) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const orgId = String(body?.orgId || '').trim();
    if (!orgId) {
      return NextResponse.json({ error: 'orgId is required' }, { status: 400 });
    }

    if (token === process.env.INTERNAL_TOKEN) {
      const uid = String(body?.uid || '').trim();
      if (!uid) {
        return NextResponse.json({ error: 'uid is required for internal requests' }, { status: 400 });
      }
      const userRecord = await getAuth().getUser(uid);
      await getAuth().setCustomUserClaims(uid, { ...(userRecord.customClaims || {}), orgId });
      return NextResponse.json({ ok: true, uid, orgId });
    }

    const decoded = await getAuth().verifyIdToken(token);
    const uid = decoded.uid;
    const userRecord = await getAuth().getUser(uid);
    await getAuth().setCustomUserClaims(uid, { ...(userRecord.customClaims || {}), orgId });

    return NextResponse.json({ ok: true, uid, orgId });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Failed to set claims' }, { status: 500 });
  }
}
