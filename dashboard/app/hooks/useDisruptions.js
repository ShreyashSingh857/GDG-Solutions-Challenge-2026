'use client';

import { useEffect } from 'react';
import { collection, onSnapshot, orderBy, query, limit } from 'firebase/firestore';
import { db } from '../lib/firebase.js';
import { useAlertStore } from '../store/alertStore.js';

/**
 * Subscribes to Firestore disruptions collection.
 * Uses detectedAt (not receivedAt) — that is the field written by the disruption agent.
 */
export function useDisruptions() {
  const { addDisruption } = useAlertStore();

  useEffect(() => {
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
      }
    );

    return () => unsubscribe();
  }, []);

  return useAlertStore((state) => state.disruptions);
}
