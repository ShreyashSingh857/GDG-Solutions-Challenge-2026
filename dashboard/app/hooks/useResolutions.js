'use client';

import { useEffect } from 'react';
import { collection, onSnapshot, orderBy, query, limit } from 'firebase/firestore';
import { db } from '../lib/firebase.js';
import { useAlertStore } from '../store/alertStore.js';

export function useResolutions() {
  const { setResolutionOptions } = useAlertStore();
  useEffect(() => {
    const q = query(collection(db, 'resolutions'), orderBy('createdAt', 'desc'), limit(5));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => { if (change.type === 'added') setResolutionOptions([{ id: change.doc.id, ...change.doc.data() }]); });
    }, (err) => console.error('[useResolutions] Firestore listener error:', err.message));
    return () => unsubscribe();
  }, []);
}
