import { NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import '../../../../lib/firebase-admin.js';

export async function POST(req) {
  try {
    if (req.headers.get('authorization') !== `Bearer ${process.env.INTERNAL_TOKEN}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { uid, orgId } = await req.json();
    if (!uid || !orgId) {
      return NextResponse.json({ error: 'uid and orgId are required' }, { status: 400 });
    }

    await getAuth().setCustomUserClaims(uid, { orgId });
    return NextResponse.json({ ok: true, uid, orgId });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Failed to set claims' }, { status: 500 });
  }
}
