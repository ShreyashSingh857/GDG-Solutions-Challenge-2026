import { useCallback, useEffect, useRef } from 'react';
import { Cartesian3, EasingFunction, Math as CesiumMath } from 'cesium';
import { useAlertStore } from '../../store/alertStore.js';

/**
 * Animates the globe camera to focus on the latest disruption epicenter.
 * Only auto-flies when user has been idle for >= 30s.
 * @param {React.MutableRefObject} viewerRef
 */
export function useGlobeCamera(viewerRef) {
  const disruptions = useAlertStore((s) => s.disruptions);
  const lastFlownToId = useRef(null);
  const lastInteractionRef = useRef(Date.now());

  const setLastInteraction = useCallback(() => {
    lastInteractionRef.current = Date.now();
  }, []);

  useEffect(() => {
    if (!viewerRef.current || disruptions.length === 0) return;
    const latest = disruptions[0];
    const lat = Number(latest.epicenterLat);
    const lng = Number(latest.epicenterLng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const latestId = latest.id || latest.traceId;
    if (lastFlownToId.current === latestId) return;
    if (Date.now() - lastInteractionRef.current < 30_000) return;
    lastFlownToId.current = latestId;

    viewerRef.current.camera.flyTo({
      destination: Cartesian3.fromDegrees(lng, lat, 8000000),
      orientation: {
        heading: CesiumMath.toRadians(0),
        pitch: CesiumMath.toRadians(-90),
        roll: 0,
      },
      duration: 3.0,
      easingFunction: EasingFunction.QUADRATIC_OUT,
    });
  }, [disruptions, viewerRef]);

  return { setLastInteraction };
}
