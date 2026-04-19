'use client';

import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query, limit, getDocs } from 'firebase/firestore';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { db, isFirebaseConfigured } from '../lib/firebase.js';
import { useAlertStore } from '../store/alertStore.js';

function rebuildRoute(option) {
  const waypoints = Array.isArray(option.routeWaypoints) ? option.routeWaypoints : [];
  const coordinates = waypoints.map((point) => [point.lng, point.lat]);
  const first = waypoints[0] || {};
  const last = waypoints[waypoints.length - 1] || {};
  return {
    id: option.traceId || option.id || `route-${option.rank}`,
    originLat: first.lat ?? null,
    originLon: first.lng ?? null,
    destLat: last.lat ?? null,
    destLon: last.lng ?? null,
    waypoints,
    geometry: coordinates.length ? { type: 'LineString', coordinates } : null,
    properties: {
      mode: option.routeSummary?.mode || option.transportMode || 'sea-freight',
      distanceKm: option.routeSummary?.distanceKm ?? null,
      timeDeltaHours: option.routeSummary?.timeDeltaHours ?? null,
    },
  };
}

/**
 * Subscribes to Firestore resolutions collection.
 * When a new resolution parent document appears, fetches its options subcollection
 * and stores the combined object in the alert store.
 */
export function useResolutions() {
  const { setResolutionWithOptions } = useAlertStore();
  const [authReady, setAuthReady] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  async function loadFallback() {
    const res = await fetch('/api/resolutions', { cache: 'no-store' });
    const json = await res.json();
    if (json.data) setResolutionWithOptions(json.data);
  }

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
            .map((d) => {
              const data = { ...d.data() };
              return { ...data, route: data.route || rebuildRoute(data) };
            })
            .sort((a, b) => a.rank - b.rank);

          setResolutionWithOptions({ ...resolutionData, options });
        } catch (err) {
          console.error('[useResolutions] Failed to fetch options subcollection:', err.message);
          if (String(err.message || '').includes('insufficient permissions')) {
            loadFallback().catch(() => {});
            return;
          }
          setResolutionWithOptions({ ...resolutionData, options: [] });
        }
      },
      (err) => {
        console.error('[useResolutions] Firestore listener error:', err.message);
        if (String(err.message || '').includes('insufficient permissions')) {
          loadFallback().catch(() => {});
        }
      }
    );

    return () => unsubscribe();
  }, [setResolutionWithOptions, authReady, currentUser]);
}
