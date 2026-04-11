'use client';

import { useEffect } from 'react';
import { collection, onSnapshot, orderBy, query, limit } from 'firebase/firestore';
import { db } from '../lib/firebase.js';
import { useAlertStore } from '../store/alertStore.js';

/**
 * Subscribes to the Firestore `disruptions` collection in real time.
 * Each new disruption document triggers addDisruption in the alert store,
 * which triggers the AlertToast and updates the activeDisruptionId.
 */
export function useDisruptions() {
  const { addDisruption } = useAlertStore();

  useEffect(() => {
    const q = query(collection(db, 'disruptions'), orderBy('receivedAt', 'desc'), limit(20));

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
