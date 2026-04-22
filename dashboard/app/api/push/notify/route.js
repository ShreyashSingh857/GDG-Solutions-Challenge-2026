import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import webPush from 'web-push';
import { verifyInternalToken } from '../../_internal-auth.js';

export const runtime = 'nodejs';

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function configureWebPush() {
  const publicKey = process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || process.env.NEXT_PUBLIC_APP_URL || 'mailto:alerts@yourapp.com';

  if (!publicKey || !privateKey) return false;

  webPush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

function buildSubscription(record) {
  return {
    endpoint: record.endpoint,
    keys: {
      p256dh: record.p256dh,
      auth: record.auth,
    },
  };
}

export async function POST(req) {
  try {
    const unauthorized = verifyInternalToken(req);
    if (unauthorized) return unauthorized;

    if (!configureWebPush()) {
      return NextResponse.json({ error: 'Web push is not configured' }, { status: 503 });
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase is not configured' }, { status: 503 });
    }

    const body = await req.json();
    const title = String(body?.title || 'Supply Chain Alert').trim();
    const message = String(body?.body || 'A disruption has been detected.').trim();
    const url = String(body?.url || '/').trim() || '/';
    const orgId = String(body?.orgId || process.env.DEFAULT_ORG_ID || 'demo-org').trim();

    const { data: subscriptions, error } = await supabase
      .from('push_subscriptions')
      .select('endpoint,p256dh,auth')
      .eq('org_id', orgId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const payload = JSON.stringify({ title, body: message, url });
    const deliveries = await Promise.allSettled(
      (subscriptions || []).map(async (record) => {
        const subscription = buildSubscription(record);
        try {
          await webPush.sendNotification(subscription, payload);
          return { endpoint: record.endpoint, ok: true };
        } catch (err) {
          if (err?.statusCode === 410 || err?.statusCode === 404) {
            await supabase.from('push_subscriptions').delete().eq('endpoint', record.endpoint).then(() => null).catch(() => null);
          }
          throw err;
        }
      })
    );

    const sent = deliveries.filter((result) => result.status === 'fulfilled').length;
    const failed = deliveries.length - sent;

    return NextResponse.json({ ok: true, orgId, sent, failed });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Failed to notify subscribers' }, { status: 500 });
  }
}