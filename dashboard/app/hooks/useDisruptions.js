'use client';

import { useCallback, useEffect } from 'react';
import { collection, onSnapshot, orderBy, query, limit } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../lib/firebase.js';
import { useAlertStore } from '../store/alertStore.js';

/**
 * Subscribes to Firestore disruptions collection.
 * Uses detectedAt (not receivedAt) — that is the field written by the disruption agent.
 */
export function useDisruptions() {
  const { addDisruption } = useAlertStore();

  const loadFallback = useCallback(async () => {
    const res = await fetch('/api/disruptions', { cache: 'no-store' });
    const json = await res.json();
    (json.data || []).forEach((item) => addDisruption(item));
  }, [addDisruption]);

  useEffect(() => {
    if (!isFirebaseConfigured || !db) {
      return;
    }

    const q = query(
      collection(db, 'disruptions'),
      orderBy('detectedAt', 'desc'),
      limit(20)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const data = { id: change.doc.id, ...change.doc.data() };
            addDisruption(data);
          }
        });
      },
      (err) => {
        console.error('[useDisruptions] Firestore listener error:', err.message);
        if (String(err.message || '').includes('insufficient permissions')) {
          loadFallback().catch(() => {});
        }
      }
    );

    return () => unsubscribe();
  }, [addDisruption, loadFallback]);

  return useAlertStore((state) => state.disruptions);
}
