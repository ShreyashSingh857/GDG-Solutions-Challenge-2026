import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function POST(req) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase is not configured' }, { status: 503 });
    }

    const body = await req.json();
    const endpoint = body?.endpoint;
    const p256dh = body?.keys?.p256dh || null;
    const auth = body?.keys?.auth || null;

    if (!endpoint) {
      return NextResponse.json({ error: 'Invalid push subscription' }, { status: 400 });
    }

    const orgId = process.env.DEFAULT_ORG_ID || 'demo-org';
    const userId = req.headers.get('x-user-id') || 'anonymous';

    const { error } = await supabase.from('push_subscriptions').upsert({
      org_id: orgId,
      user_id: userId,
      endpoint,
      p256dh,
      auth,
    }, { onConflict: 'endpoint' });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Failed to save subscription' }, { status: 500 });
  }
}
