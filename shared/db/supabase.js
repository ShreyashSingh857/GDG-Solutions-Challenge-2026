import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('[Supabase] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in environment variables');
}

/**
 * Supabase admin client using the service role key.
 * This bypasses Row Level Security and must stay server-side only.
 */
export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

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
