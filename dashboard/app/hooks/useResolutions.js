'use client';

import { useEffect } from 'react';
import { collection, onSnapshot, orderBy, query, limit, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase.js';
import { useAlertStore } from '../store/alertStore.js';

/**
 * Subscribes to Firestore resolutions collection.
 * When a new resolution parent document appears, fetches its options subcollection
 * and stores the combined object in the alert store.
 */
export function useResolutions() {
  const { setResolutionWithOptions } = useAlertStore();

  useEffect(() => {
    const q = query(
      collection(db, 'resolutions'),
      orderBy('createdAt', 'desc'),
      limit(5)
    );

    const unsubscribe = onSnapshot(
      q,
      async (snapshot) => {
        const latestDoc = snapshot.docs[0];
        if (!latestDoc) {
          return;
        }

        const resolutionData = { id: latestDoc.id, ...latestDoc.data() };

        try {
          const optionsSnap = await getDocs(
            collection(db, 'resolutions', latestDoc.id, 'options')
          );
          const options = optionsSnap.docs
            .map((d) => ({ ...d.data() }))
            .sort((a, b) => a.rank - b.rank);

          setResolutionWithOptions({ ...resolutionData, options });
        } catch (err) {
          console.error('[useResolutions] Failed to fetch options subcollection:', err.message);
          setResolutionWithOptions({ ...resolutionData, options: [] });
        }
      },
      (err) => {
        console.error('[useResolutions] Firestore listener error:', err.message);
      }
    );

    return () => unsubscribe();
  }, [setResolutionWithOptions]);
}
