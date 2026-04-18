import { db } from '../../shared/db/firebase.js';

const memoryCache = new Set();
const COLLECTION = 'dedup_store';
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function initDedupStore() {
  try {
    const cutoff = new Date(Date.now() - TTL_MS).toISOString();
    const snap = await db.collection(COLLECTION).where('processedAt', '>', cutoff).get();
    snap.docs.forEach((d) => memoryCache.add(d.id));
    console.log(`[DedupStore] Loaded ${memoryCache.size} entries from Firestore`);
  } catch (err) {
    console.warn('[DedupStore] Firestore load failed, using empty cache:', err.message);
  }
}

export function isDuplicate(url) {
  return memoryCache.has(encodeURL(url));
}

export async function markProcessed(url) {
  const key = encodeURL(url);
  memoryCache.add(key);

  try {
    await db.collection(COLLECTION).doc(key).set({ url, processedAt: new Date().toISOString() });
  } catch (err) {
    console.warn('[DedupStore] Firestore write failed:', err.message);
  }
}

function encodeURL(url) {
  return Buffer.from(url).toString('base64').replace(/[/+=]/g, '_').slice(0, 499);
}