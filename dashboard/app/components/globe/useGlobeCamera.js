import { useEffect, useRef } from 'react';
import { Cartesian3, EasingFunction, Math as CesiumMath } from 'cesium';
import { useAlertStore } from '../../store/alertStore.js';

/**
 * Animates the globe camera to focus on the latest disruption epicenter.
 * @param {React.MutableRefObject} viewerRef
 */
export function useGlobeCamera(viewerRef) {
  const disruptions = useAlertStore((s) => s.disruptions);
  const lastFlownToId = useRef(null);

  useEffect(() => {
    if (!viewerRef.current || disruptions.length === 0) return;
    const latest = disruptions[0];
    if (typeof latest.epicenterLat !== 'number' || typeof latest.epicenterLng !== 'number') return;

    const latestId = latest.id || latest.traceId;
    if (lastFlownToId.current === latestId) return;
    lastFlownToId.current = latestId;

    viewerRef.current.camera.flyTo({
      destination: Cartesian3.fromDegrees(latest.epicenterLng, latest.epicenterLat, 8000000),
      orientation: {
        heading: CesiumMath.toRadians(0),
        pitch: CesiumMath.toRadians(-90),
        roll: 0,
      },
      duration: 3.0,
      easingFunction: EasingFunction.QUADRATIC_OUT,
    });
  }, [disruptions, viewerRef]);
}
