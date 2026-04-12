import { useEffect } from 'react';
import { useAlertStore } from '../../store/alertStore.js';

/**
 * Animates the globe camera to focus on the latest disruption epicenter.
 * @param {React.MutableRefObject} globeRef
 */
export function useGlobeCamera(globeRef) {
  const disruptions = useAlertStore((s) => s.disruptions);

  useEffect(() => {
    if (!globeRef.current || disruptions.length === 0) return;
    const latest = disruptions[0];
    if (typeof latest.epicenterLat !== 'number' || typeof latest.epicenterLng !== 'number') return;

    globeRef.current.pointOfView(
      { lat: latest.epicenterLat, lng: latest.epicenterLng, altitude: 2.0 },
      1500
    );
  }, [disruptions, globeRef]);
}
