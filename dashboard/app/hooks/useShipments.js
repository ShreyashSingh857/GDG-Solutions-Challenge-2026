'use client';

import { useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../lib/firebase.js';
import { useShipmentStore } from '../store/shipmentStore.js';

/**
 * Subscribes to the Firestore `shipments` collection in real time.
 * Updates are pushed automatically by Firestore - no polling.
 * Populates the Zustand shipmentStore.
 */
export function useShipments() {
  const { setShipments, updateShipment } = useShipmentStore();

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
      }
    );

    return () => unsubscribe();
  }, [setShipments]);

  return useShipmentStore((state) => state.shipments);
}
