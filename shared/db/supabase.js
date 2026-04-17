// Best-effort local env loading: skip if dotenv is unavailable in this package context.
try {
  await import('dotenv/config');
} catch {
  // no-op
}

let createClientFn = null;
try {
  const mod = await import('@supabase/supabase-js');
  createClientFn = mod.createClient;
} catch {
  // no-op
}

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
if (!createClientFn) {
  unavailableReason = '[Supabase] @supabase/supabase-js is not available in this package context';
}

const unavailable = new Proxy(
  {},
  {
    get() {
      throw new Error(unavailableReason || '[Supabase] Supabase is unavailable');
    },
  }
);

export const supabase = hasSupabaseConfig && createClientFn
  ? createClientFn(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
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
