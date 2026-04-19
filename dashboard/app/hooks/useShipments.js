'use client';

import { useCallback, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../lib/firebase.js';
import { useShipmentStore } from '../store/shipmentStore.js';

/**
 * Subscribes to the Firestore `shipments` collection in real time.
 * Updates are pushed automatically by Firestore - no polling.
 * Populates the Zustand shipmentStore.
 */
export function useShipments() {
  const { setShipments } = useShipmentStore();

  const loadFallback = useCallback(async () => {
    const res = await fetch('/api/shipments', { cache: 'no-store' });
    const json = await res.json();
    if (Array.isArray(json.data)) setShipments(json.data);
  }, [setShipments]);

  useEffect(() => {
    if (!isFirebaseConfigured || !db) {
      return;
    }

    const unsubscribe = onSnapshot(
      collection(db, 'shipments'),
      (snapshot) => {
        const shipments = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setShipments(shipments);
      },
      (err) => {
        console.error('[useShipments] Firestore listener error:', err.message);
        if (String(err.message || '').includes('insufficient permissions')) {
          loadFallback().catch(() => {});
        }
      }
    );

    return () => unsubscribe();
  }, [loadFallback, setShipments]);

  return useShipmentStore((state) => state.shipments);
}
