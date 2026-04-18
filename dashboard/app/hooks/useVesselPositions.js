'use client';

import { useEffect, useState } from 'react';
import { collection, limit, onSnapshot, query } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../lib/firebase.js';

export function useVesselPositions() {
  const [vessels, setVessels] = useState([]);

  useEffect(() => {
    if (!isFirebaseConfigured || !db) return;
    const q = query(collection(db, 'vesselPositions'), limit(300));
    const unsub = onSnapshot(
      q,
      (snap) => setVessels(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => {}
    );
    return () => unsub();
  }, []);

  return vessels;
}
