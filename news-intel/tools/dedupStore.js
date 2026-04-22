import { supabase } from '../../shared/db/supabase.js';

const COLLECTION = 'news_alert_dedup';

function externalIdFor(url) {
  return String(url || '').trim();
}

export async function initDedupStore() {
  try {
    const { count, error } = await supabase
      .from(COLLECTION)
      .select('external_id', { count: 'exact', head: true });

    if (error) throw error;
    console.log(`[DedupStore] Supabase dedup store ready (${count || 0} known alerts)`);
  } catch (err) {
    console.warn('[DedupStore] Supabase load failed:', err.message);
  }
}

export async function isDuplicate(url) {
  const externalId = externalIdFor(url);
  if (!externalId) return false;

  try {
    const { data, error } = await supabase
      .from(COLLECTION)
      .select('external_id')
      .eq('external_id', externalId)
      .maybeSingle();

    if (error) throw error;
    return Boolean(data);
  } catch (err) {
    console.warn('[DedupStore] Supabase read failed:', err.message);
    return false;
  }
}

export async function markProcessed(url) {
  const externalId = externalIdFor(url);
  if (!externalId) return;

  try {
    await supabase.from(COLLECTION).upsert({
      external_id: externalId,
      source_url: url,
      processed_at: new Date().toISOString(),
    }, { onConflict: 'external_id' });
  } catch (err) {
    console.warn('[DedupStore] Supabase write failed:', err.message);
  }
}