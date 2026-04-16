import { db } from '../../shared/db/firebase.js';

const COLLECTION = 'news_processed_urls';
const TTL_MS = 24 * 60 * 60 * 1000;

const seen = new Set();
let persistenceEnabled = true;

function isFirebaseConfigError(err) {
  return String(err?.message || '').includes('Missing FIREBASE_* env vars');
}

export async function initDedupStore() {
  try {
    const cutoff = new Date(Date.now() - TTL_MS).toISOString();
    const snapshot = await db.collection(COLLECTION).where('processedAt', '>', cutoff).get();

    snapshot.forEach((doc) => seen.add(doc.id));
    console.log(`[DedupStore] Seeded ${seen.size} URLs from Firestore`);
  } catch (err) {
    if (isFirebaseConfigError(err)) {
      persistenceEnabled = false;
      console.warn('[DedupStore] Firestore unavailable. Dedup persistence disabled; using in-memory set only.');
      return;
    }
    throw err;
  }
}

export function isDuplicate(url) {
  return seen.has(urlToKey(url));
}

export function markProcessed(url) {
  const key = urlToKey(url);
  seen.add(key);

  if (!persistenceEnabled) {
    return;
  }

  try {
    db.collection(COLLECTION)
      .doc(key)
      .set({ url, processedAt: new Date().toISOString() })
      .catch((err) => {
        console.error('[DedupStore] Firestore write failed (non-fatal):', err.message);
      });
  } catch (err) {
    if (isFirebaseConfigError(err)) {
      persistenceEnabled = false;
      console.warn('[DedupStore] Firestore unavailable. Switched to in-memory dedup only.');
      return;
    }
    throw err;
  }
}

function urlToKey(url) {
  try {
    const { origin, pathname } = new URL(url);
    return Buffer.from(`${origin}${pathname}`).toString('base64url').slice(0, 40);
  } catch {
    return Buffer.from(String(url)).toString('base64url').slice(0, 40);
  }
}