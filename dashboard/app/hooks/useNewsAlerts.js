'use client';

import { useEffect } from 'react';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../lib/firebase.js';
import { useAlertStore } from '../store/alertStore.js';

export function useNewsAlerts() {
  const addNewsAlert = useAlertStore((state) => state.addNewsAlert);

  useEffect(() => {
    if (!isFirebaseConfigured || !db) {
      return;
    }

    const newsQuery = query(
      collection(db, 'news_alerts'),
      orderBy('detectedAt', 'desc'),
      limit(20)
    );

    const unsubscribe = onSnapshot(
      newsQuery,
      (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            addNewsAlert({ id: change.doc.id, ...change.doc.data() });
          }
        });
      },
      (err) => {
        console.error('[useNewsAlerts] Firestore listener error:', err.message);
      }
    );

    return () => unsubscribe();
  }, [addNewsAlert]);
}