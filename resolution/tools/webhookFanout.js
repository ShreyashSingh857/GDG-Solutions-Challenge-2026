import { createHmac } from 'node:crypto';
import { supabase } from '../../shared/db/supabase.js';

function sign(body, secret) {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

export async function fanoutResolutionWebhooks(orgId, traceId, options) {
  try {
    const { data: webhooks, error } = await supabase
      .from('outbound_webhooks')
      .select('url,secret,event,active')
      .eq('org_id', orgId)
      .eq('event', 'resolution.ready')
      .eq('active', true);

    if (error || !webhooks?.length) return;

    const payload = JSON.stringify({
      event: 'resolution.ready',
      traceId,
      optionCount: options.length,
      options,
      sentAt: new Date().toISOString(),
    });

    await Promise.allSettled(
      webhooks.map(async (wh) => {
        const signature = sign(payload, wh.secret);
        await fetch(wh.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Signature': signature,
          },
          body: payload,
          signal: AbortSignal.timeout(10_000),
        });
      })
    );
  } catch (err) {
    console.warn('[WebhookFanout] Failed to fan out webhooks:', err.message);
  }
}
