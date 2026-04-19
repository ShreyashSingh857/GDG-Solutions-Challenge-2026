'use client';

import { useCallback, useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { db, isFirebaseConfigured } from '../lib/firebase.js';
import { useShipmentStore } from '../store/shipmentStore.js';

/**
 * Subscribes to the Firestore `shipments` collection in real time.
 * Updates are pushed automatically by Firestore - no polling.
 * Populates the Zustand shipmentStore.
 */
export function useShipments() {
  const { setShipments } = useShipmentStore();
  const [authReady, setAuthReady] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  const loadFallback = useCallback(async () => {
    const res = await fetch('/api/shipments', { cache: 'no-store' });
    const json = await res.json();
    if (Array.isArray(json.data)) setShipments(json.data);
  }, [setShipments]);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      return;
    }

    const auth = getAuth();
    return onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthReady(true);
    });
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured || !db) {
      return;
    }
    if (!authReady || !currentUser) {
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
  }, [authReady, currentUser, loadFallback, setShipments]);

  return useShipmentStore((state) => state.shipments);
}
