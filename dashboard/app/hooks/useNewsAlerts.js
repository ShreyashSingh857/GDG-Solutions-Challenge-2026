'use client';

import { useEffect } from 'react';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../lib/firebase.js';
import { useAlertStore } from '../store/alertStore.js';

export function useNewsAlerts() {
  const addNewsAlert = useAlertStore((state) => state.addNewsAlert);

  async function loadFallback() {
    const res = await fetch('/api/news-alerts', { cache: 'no-store' });
    const json = await res.json();
    (json.data || []).forEach((item) => addNewsAlert(item));
  }

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
        if (String(err.message || '').includes('insufficient permissions')) {
          loadFallback().catch(() => {});
        }
      }
    );

    return () => unsubscribe();
  }, [addNewsAlert]);
}