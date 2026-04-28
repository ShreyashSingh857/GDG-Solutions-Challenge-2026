const buckets = new Map();

/**
 * Returns true if a write to `collection` is allowed.
 * Default: 100 writes/min per collection.
 */
export function allowFirestoreWrite(collection, { maxPerMinute = 100 } = {}) {
	const now = Date.now();
	if (!buckets.has(collection)) {
		buckets.set(collection, { count: 0, resetAt: now + 60_000 });
	}
	const bucket = buckets.get(collection);
	if (now > bucket.resetAt) {
		bucket.count = 0;
		bucket.resetAt = now + 60_000;
	}
	if (bucket.count >= maxPerMinute) return false;
	bucket.count += 1;
	return true;
}
