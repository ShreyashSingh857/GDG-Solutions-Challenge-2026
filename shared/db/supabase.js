// Best-effort local env loading: skip if dotenv is unavailable in this package context.
try {
  await import('dotenv/config');
} catch {
  // no-op
}

// Direct ESM import — Node's resolver walks up the directory tree and finds
// @supabase/supabase-js in the nearest node_modules (root or service-level).
// The old createRequire dance was broken in production because it was passed
// directory paths instead of file paths, causing it to resolve from the wrong
// node_modules scope.
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const hasSupabaseConfig = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY;

/**
 * Supabase admin client using the service role key.
 * This bypasses Row Level Security and must stay server-side only.
 */
let unavailableReason = null;
if (!hasSupabaseConfig) {
  unavailableReason = '[Supabase] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in environment variables';
}

const unavailable = new Proxy(
  {},
  {
    get() {
      throw new Error(unavailableReason || '[Supabase] Supabase is unavailable');
    },
  }
);

export const supabase = hasSupabaseConfig
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : unavailable;

/**
 * Throw a structured error for failed Supabase operations.
 * @param {object} error
 * @param {string} context
 */
export function assertNoSupabaseError(error, context) {
  if (error) {
    const msg = `[Supabase] ${context} failed: ${error.message} (code: ${error.code})`;
    console.error(msg);
    throw new Error(msg);
  }
}

const retryQueue = [];
let retryTickerStarted = false;

export function getSupabaseRetryQueueStats() {
  return { queued: retryQueue.length };
}

export async function resilientUpsert(table, data, options = {}) {
  const { error } = await supabase.from(table).upsert(data, options);
  if (!error) return { queued: false };

  console.warn(`[Supabase] ${table} write failed, queued for retry: ${error.message}`);
  retryQueue.push({ table, data, options, attempts: 0, queuedAt: new Date().toISOString() });
  return { queued: true, error };
}

export async function flushSupabaseRetryQueue(maxItems = 25) {
  let processed = 0;
  for (let i = 0; i < retryQueue.length && processed < maxItems; ) {
    const item = retryQueue[i];
    const { error } = await supabase.from(item.table).upsert(item.data, item.options);
    if (!error) {
      retryQueue.splice(i, 1);
    } else {
      item.attempts += 1;
      i += 1;
    }
    processed += 1;
  }
}

if (!retryTickerStarted) {
  retryTickerStarted = true;
  const retryTicker = setInterval(() => {
    flushSupabaseRetryQueue().catch((err) => {
      console.warn('[Supabase] Retry queue flush failed:', err.message);
    });
  }, 30000);
  retryTicker.unref?.();
}
