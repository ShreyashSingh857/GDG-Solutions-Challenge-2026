import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

function createSupabaseClient({ useServiceRole = true } = {}) {
  const url = process.env.SUPABASE_URL;
  const key = useServiceRole ? process.env.SUPABASE_SERVICE_ROLE_KEY : process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function getSupabaseAdmin() {
  return createSupabaseClient({ useServiceRole: true });
}

export function getSupabaseAnon() {
  return createSupabaseClient({ useServiceRole: false });
}

export function getSupabaseClientForRequest(req) {
  const bearer = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!bearer) {
    return getSupabaseAdmin();
  }

  const anonClient = getSupabaseAnon();
  if (!anonClient) {
    return getSupabaseAdmin();
  }

  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${bearer}` } },
  });
}

export function hashKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

export async function verifyApiKey(req) {
  const rawHeader = req.headers.get('x-api-key') || req.headers.get('authorization') || '';
  const key = rawHeader.replace(/^Bearer\s+/i, '').trim();
  if (!key) {
    return { ok: false, status: 401, error: 'Missing API key' };
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { ok: false, status: 503, error: 'Supabase is not configured' };
  }

  const keyHash = hashKey(key);
  const { data, error } = await supabase
    .from('api_keys')
    .select('id,org_id,label')
    .eq('key_hash', keyHash)
    .maybeSingle();

  if (error) {
    return { ok: false, status: 500, error: error.message };
  }

  if (!data) {
    return { ok: false, status: 401, error: 'Invalid API key' };
  }

  await supabase
    .from('api_keys')
    .update({ last_used: new Date().toISOString() })
    .eq('id', data.id)
    .then(() => null)
    .catch(() => null);

  return { ok: true, auth: { orgId: data.org_id, label: data.label, apiKeyId: data.id }, supabase };
}
