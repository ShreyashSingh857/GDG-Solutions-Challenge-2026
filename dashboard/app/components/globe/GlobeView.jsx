'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDebouncedCallback } from 'use-debounce';
import { shallow } from 'zustand/shallow';
import {
  ArcType,
  Cartesian2,
  Cartesian3,
  Color,
  CustomDataSource,
  EllipsoidTerrainProvider,
  DistanceDisplayCondition,
  HeightReference,
  ImageryLayer,
  Ion,
  IonWorldImageryStyle,
  LabelStyle,
  NearFarScalar,
  OpenStreetMapImageryProvider,
  PolylineDashMaterialProperty,
  PolylineGlowMaterialProperty,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Viewer,
  createWorldTerrainAsync,
} from 'cesium';
import { useShipmentStore } from '../../store/shipmentStore.js';
import { useAlertStore } from '../../store/alertStore.js';
import GlobeControls from './GlobeControls.jsx';
import { useGlobeCamera } from './useGlobeCamera.js';

const C = { active: '#22c55e', delayed: '#ef4444', rerouted: '#3b82f6', disrupted: '#f97316' };
const CITIES = [['Shanghai', 31.2304, 121.4737], ['Singapore', 1.3521, 103.8198], ['Los Angeles', 34.0522, -118.2437], ['Rotterdam', 51.9244, 4.4777], ['Dubai', 25.2048, 55.2708], ['Mumbai', 19.076, 72.8777], ['Hong Kong', 22.3193, 114.1694], ['New York', 40.7128, -74.006]];
const STATES = [['California', 36.7783, -119.4179], ['Texas', 31.9686, -99.9018], ['Florida', 27.6648, -81.5158], ['New York State', 43, -75], ['Maharashtra', 19.7515, 75.7139], ['Gujarat', 22.2587, 71.1924], ['Tamil Nadu', 11.1271, 78.6569], ['Western Australia', -25.2744, 122]];

function getLineMaterial(status, colorCss) {
  const color = Color.fromCssColorString(colorCss);
  if (status === 'delayed') return new PolylineDashMaterialProperty({ color, dashLength: 16.0, dashPattern: 255 });
  return new PolylineGlowMaterialProperty({ color, glowPower: status === 'rerouted' ? 0.3 : 0.15, taperPower: 1.0 });
}

export default function GlobeView() {
  const cRef = useRef(null); const vRef = useRef(null); const dsRef = useRef(null); const hoverRafRef = useRef(null); const zoomRef = useRef('far'); const entityMapRef = useRef(new Map()); const disruptionEntitiesRef = useRef(new Map()); const pulseRafRef = useRef(null); const pulseRadiusRef = useRef(50000); const tooltipRef = useRef(null); const autoRotateRafRef = useRef(null); const idleTimerRef = useRef(null); const isRotatingRef = useRef(false); const resetIdleTimerRef = useRef(null); const zoomEntityIdsRef = useRef(new Set()); const [f, setF] = useState('all'); const [t, setT] = useState(null); const [zoomLevel, setZoomLevel] = useState('far');
  const setZoomLevelDebounced = useDebouncedCallback((next) => setZoomLevel(next), 300);
  const s = useShipmentStore((x) => x.shipments, shallow); const disruptions = useAlertStore((x) => x.disruptions); const reroutedRoutes = useAlertStore((x) => x.reroutedRoutes);
  useGlobeCamera(vRef);

  const startAutoRotate = useCallback(() => {
    if (isRotatingRef.current) return;
    isRotatingRef.current = true;
    function rotateFrame() {
      if (!isRotatingRef.current || !vRef.current) return;
      const alt = vRef.current.camera.positionCartographic.height;
      let speed = 0;
      if (alt > 5_000_000) speed = -0.0003;
      else if (alt > 500_000) speed = -0.00005;
      if (speed !== 0) {
        vRef.current.camera.rotate(Cartesian3.UNIT_Z, speed);
        vRef.current.scene.requestRender();
      }
      autoRotateRafRef.current = requestAnimationFrame(rotateFrame);
    }
    autoRotateRafRef.current = requestAnimationFrame(rotateFrame);
  }, []);

  const stopAutoRotate = useCallback(() => {
    isRotatingRef.current = false;
    if (autoRotateRafRef.current) cancelAnimationFrame(autoRotateRafRef.current);
  }, []);

  const resetIdleTimer = useCallback(() => {
    stopAutoRotate();
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(startAutoRotate, 10000);
  }, [startAutoRotate, stopAutoRotate]);

  useEffect(() => {
    resetIdleTimerRef.current = resetIdleTimer;
  }, [resetIdleTimer]);

  useEffect(() => {
    if (!cRef.current || vRef.current) return;
    let v;
    (async () => {
      try {
        const ionToken = process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN;
        if (ionToken) Ion.defaultAccessToken = ionToken;
        
        v = new Viewer(cRef.current, { 
          animation: false, timeline: false, sceneModePicker: false, geocoder: false, baseLayerPicker: false, navigationHelpButton: false, homeButton: false, fullscreenButton: false, infoBox: false, selectionIndicator: false, shouldAnimate: false, requestRenderMode: false, 
          terrainProvider: ionToken
            ? await createWorldTerrainAsync({ requestVertexNormals: true, requestWaterMask: true })
            : new EllipsoidTerrainProvider(),
          baseLayer: ionToken
            ? ImageryLayer.fromWorldImagery({ style: IonWorldImageryStyle.AERIAL_WITH_LABELS })
            : new ImageryLayer(new OpenStreetMapImageryProvider({ url: 'https://tile.openstreetmap.org/', maximumLevel: 19, credit: 'OSM' }))
        });
      } catch (err) {
        console.error('[GlobeView] Failed to initialize Cesium Viewer:', err);
        return;
      }
      const scene = v.scene; const globe = scene.globe; v.resolutionScale = Math.min(window.devicePixelRatio || 1, 2.0); scene.fxaa = true; scene.highDynamicRange = true; if (scene.context.msaaSupported) { scene.msaaSamples = 4; } globe.enableLighting = true; globe.dynamicAtmosphereLighting = true; globe.dynamicAtmosphereLightingFromSun = true; globe.showGroundAtmosphere = true; globe.atmosphereLightIntensity = 2.0; globe.tileCacheSize = 1000; globe.maximumScreenSpaceError = 1.0; globe.preloadAncestors = true; globe.preloadSiblings = true; globe.loadingDescendantLimit = 20; globe.depthTestAgainstTerrain = true; globe.baseColor = Color.fromCssColorString('#020B18'); scene.skyAtmosphere.show = true; scene.skyAtmosphere.perFragmentAtmosphere = true; scene.skyAtmosphere.atmosphereLightIntensity = 5.0; scene.skyBox.show = true; scene.sun.show = true; scene.moon.show = false; scene.fog.enabled = true; scene.fog.density = 0.0002; scene.fog.minimumBrightness = 0.03; v.camera.setView({ destination: Cartesian3.fromDegrees(60, 20, 22000000) });
      scene.screenSpaceCameraController.minimumZoomDistance = 200; scene.screenSpaceCameraController.maximumZoomDistance = 25000000;
      scene.screenSpaceCameraController.inertiaSpin = 0.5;
      scene.screenSpaceCameraController.inertiaTranslate = 0.5;
      scene.screenSpaceCameraController.inertiaZoom = 0.5;
      scene.screenSpaceCameraController.enableCollisionDetection = true;
      // Bloom disabled: post-process blur degrades satellite tile clarity at zoom
      scene.postProcessStages.bloom.enabled = false;
      const ds = new CustomDataSource('shipments');
      v.dataSources.add(ds);
      vRef.current = v; dsRef.current = ds;
      v.scene.canvas.addEventListener("mousedown", resetIdleTimer);
      v.scene.canvas.addEventListener("touchstart", resetIdleTimer);
      resetIdleTimer();
      const onCam = () => {
        const altM = v.camera.positionCartographic.height;
        const next = altM < 500000 ? 'state' : altM < 2000000 ? 'city' : 'far';
        if (next !== zoomRef.current) {
          zoomRef.current = next;
          setZoomLevelDebounced(next);
        }
      };
      v.camera.changed.addEventListener(onCam);
      const events = new ScreenSpaceEventHandler(v.scene.canvas);
      events.setInputAction((m) => {
        if (hoverRafRef.current) cancelAnimationFrame(hoverRafRef.current);
        hoverRafRef.current = requestAnimationFrame(() => {
          const p = v.scene.pick(m.endPosition);
          const pr = p?.id?.properties;
          if (!pr) {
            setT(null);
            if (tooltipRef.current) tooltipRef.current.style.transform = 'translate(-9999px, -9999px)';
            return;
          }
          const x = Math.min(m.endPosition.x + 12, window.innerWidth - 200);
          const y = Math.max(m.endPosition.y - 40, 8);
          if (tooltipRef.current) tooltipRef.current.style.transform = `translate(${x}px, ${y}px)`;
          setT({ label: pr.label?.getValue() || 'Item', kind: pr.kind?.getValue() || 'entity', status: pr.status?.getValue() || '' });
        });
      }, ScreenSpaceEventType.MOUSE_MOVE);
      return () => { if (hoverRafRef.current) cancelAnimationFrame(hoverRafRef.current); if (pulseRafRef.current) cancelAnimationFrame(pulseRafRef.current); stopAutoRotate(); if (idleTimerRef.current) clearTimeout(idleTimerRef.current); setZoomLevelDebounced.cancel(); events.destroy(); v.destroy(); vRef.current = null; dsRef.current = null; };
    })();
  }, [resetIdleTimer, setZoomLevelDebounced, stopAutoRotate]);

  useEffect(() => {
    const onVisibility = () => {
      if (!vRef.current) return;
      if (document.hidden) {
        isRotatingRef.current = false;
        if (autoRotateRafRef.current) cancelAnimationFrame(autoRotateRafRef.current);
        if (pulseRafRef.current) {
          cancelAnimationFrame(pulseRafRef.current);
          pulseRafRef.current = null;
        }
      } else {
        if (vRef.current) resetIdleTimerRef.current?.();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const ss = useMemo(() => (f === 'all' ? s : s.filter((x) => x.status === f)), [f, s]);
  useEffect(() => {
    if (!dsRef.current) return;
    const entities = dsRef.current.entities;
    const entityMap = entityMapRef.current;
    const currentIds = new Set(ss.map((x) => x.id));

    for (const [id, refs] of entityMap) {
      if (!currentIds.has(id)) {
        if (refs.point) entities.remove(refs.point);
        if (refs.line) entities.remove(refs.line);
        entityMap.delete(id);
      }
    }

    ss.forEach((x) => {
      const route = x.status === 'rerouted' && x.disruptionId ? reroutedRoutes[x.disruptionId] : null;
      const coords = route?.geometry?.coordinates || route?.features?.[0]?.geometry?.coordinates;
      const positions = Array.isArray(coords) && coords.length > 1
        ? Cartesian3.fromDegreesArray(coords.flatMap(([lng, lat]) => [lng, lat]))
        : Cartesian3.fromDegreesArray([x.originLng, x.originLat, x.destLng, x.destLat]);
      const colorCss = x.status === 'rerouted' ? '#60A5FA' : (C[x.status] || C.active);
      const pointSize = x.status === 'delayed' ? 10 : 8;
      const lineWidth = x.status === 'delayed' ? 2.6 : 1.8;

      if (!entityMap.has(x.id)) {
        const point = entities.add({ position: Cartesian3.fromDegrees(x.currentLng, x.currentLat), point: { pixelSize: pointSize, color: Color.fromCssColorString(C[x.status] || C.active), outlineColor: Color.BLACK, outlineWidth: 1 }, properties: { kind: 'shipment', status: x.status, label: `${x.origin} -> ${x.destination}` } });
        const line = entities.add({ polyline: { positions, width: lineWidth, material: Color.fromCssColorString(colorCss), arcType: ArcType.GEODESIC, clampToGround: false }, properties: { kind: 'route', status: x.status, label: x.status === 'rerouted' ? 'Rerouted Segment' : 'Route Segment' } });
        entityMap.set(x.id, { point, line });
      } else {
        const refs = entityMap.get(x.id);
        refs.point.position = Cartesian3.fromDegrees(x.currentLng, x.currentLat);
        refs.point.properties = { kind: 'shipment', status: x.status, label: `${x.origin} -> ${x.destination}` };
        refs.point.point.color = Color.fromCssColorString(C[x.status] || C.active);
        refs.point.point.pixelSize = pointSize;
        refs.line.polyline.positions = positions;
        refs.line.polyline.width = lineWidth;
        refs.line.polyline.material = Color.fromCssColorString(colorCss);
        refs.line.properties = { kind: 'route', status: x.status, label: x.status === 'rerouted' ? 'Rerouted Segment' : 'Route Segment' };
      }
    });

    vRef.current?.scene.requestRender();
  }, [ss, reroutedRoutes]);

  useEffect(() => {
    if (!dsRef.current) return;
    const entities = dsRef.current.entities;

    zoomEntityIdsRef.current.forEach((id) => {
      const z = entities.getById(id);
      if (z) entities.remove(z);
    });
    zoomEntityIdsRef.current.clear();

    if (zoomLevel !== 'far') {
      CITIES.forEach(([name, lat, lng]) => {
        const id = `city-${name}`;
        entities.add({ 
          id, 
          position: Cartesian3.fromDegrees(lng, lat), 
          point: { pixelSize: 5, color: Color.fromCssColorString('#e2e8f0') }, 
          label: {
            text: name,
            font: "bold 14px sans-serif",
            style: LabelStyle.FILL_AND_OUTLINE,
            fillColor: Color.WHITE,
            outlineColor: Color.BLACK,
            outlineWidth: 2,
            pixelOffset: new Cartesian2(0, -14),
            translucencyByDistance: new NearFarScalar(1.5e6, 1.0, 5.0e6, 0.0),
            scaleByDistance: new NearFarScalar(1.5e6, 1.0, 5.0e6, 0.5),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          properties: { kind: 'city', label: name, status: 'city' } 
        });
        zoomEntityIdsRef.current.add(id);
      });
    }
    if (zoomLevel === 'state') {
      STATES.forEach(([name, lat, lng]) => {
        const id = `state-${name}`;
        entities.add({ id, position: Cartesian3.fromDegrees(lng, lat), point: { pixelSize: 4, color: Color.fromCssColorString('#a78bfa') }, properties: { kind: 'state', label: name, status: 'state' } });
        zoomEntityIdsRef.current.add(id);
      });
    }

    vRef.current?.scene.requestRender();
  }, [zoomLevel]);

  useEffect(() => {
    if (!vRef.current) return;
    const viewer = vRef.current;
    const activeIds = new Set(disruptions.map((d) => d.id));

    disruptionEntitiesRef.current.forEach((entity, id) => {
      if (!activeIds.has(id)) {
        viewer.entities.remove(entity);
        disruptionEntitiesRef.current.delete(id);
      }
    });

    disruptions.forEach((d) => {
      if (!d.epicenterLat || !d.epicenterLng || disruptionEntitiesRef.current.has(d.id)) return;
      const entity = viewer.entities.add({
        id: `disruption-${d.id}`,
        position: Cartesian3.fromDegrees(d.epicenterLng, d.epicenterLat),
        ellipse: {
          semiMajorAxis: 250000,
          semiMinorAxis: 250000,
          material: Color.fromCssColorString('#EF4444').withAlpha(0.25),
          outline: true,
          outlineColor: Color.fromCssColorString('#EF4444'),
          outlineWidth: 2.0,
          heightReference: HeightReference.CLAMP_TO_GROUND,
        },
      });
      disruptionEntitiesRef.current.set(d.id, entity);
    });

    const pulseLoop = () => {
      const t = Date.now() / 1000;
      const radius = 80000 + Math.sin(t * 2.0) * 60000;
      for (const entity of disruptionEntitiesRef.current.values()) {
        entity.ellipse.semiMajorAxis = radius;
        entity.ellipse.semiMinorAxis = radius;
      }
      vRef.current?.scene.requestRender();
      pulseRafRef.current = requestAnimationFrame(pulseLoop);
    };
    if (disruptionEntitiesRef.current.size > 0 && !pulseRafRef.current) {
      pulseRafRef.current = requestAnimationFrame(pulseLoop);
    }

    return () => {
      if (pulseRafRef.current) {
        cancelAnimationFrame(pulseRafRef.current);
        pulseRafRef.current = null;
      }
    };
  }, [disruptions]);

  return <div className="relative w-full h-full bg-[#000108]"><GlobeControls onFilterChange={setF} /><div ref={cRef} className="h-full w-full" /><div ref={tooltipRef} style={{ position: "fixed", top: 0, left: 0, transform: "translate(-9999px, -9999px)", zIndex: 20, pointerEvents: "none", transition: "none" }} className={`bg-black/80 border border-white/10 rounded-lg p-3 text-xs text-white ${t ? 'visible' : 'invisible'}`}><p className="font-medium">{t?.label || ''}</p><p className="text-white/60 capitalize">{t?.kind || ''} • {t?.status || ''}</p></div></div>;
}
