'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDebouncedCallback } from 'use-debounce';
import { shallow } from 'zustand/shallow';
import {
  ArcType,
  Cartesian2,
  Cartesian3,
  Color,
  ConstantProperty,
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
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Viewer,
  createWorldTerrainAsync,
} from 'cesium';
import { useShipmentStore } from '../../store/shipmentStore.js';
import { useAlertStore } from '../../store/alertStore.js';
import { ingestRoutes, encodeRouteVisual, buildCesiumEntities } from '../../lib/tradeRoutePipeline.js';
import { generateArcFromWaypoints, generateArcPositions } from '../../lib/arcGeometry.js';
import GlobeControls from './GlobeControls.jsx';
import { useGlobeCamera } from './useGlobeCamera.js';

const C = { active: '#22c55e', delayed: '#ef4444', rerouted: '#3b82f6', disrupted: '#f97316' };

const isValidCoord = (v) => typeof v === 'number' && isFinite(v) && v !== 0;

export default function GlobeView() {
  const cRef = useRef(null); const vRef = useRef(null); const dsRef = useRef(null); const hoverRafRef = useRef(null); const zoomRef = useRef('far'); const entityMapRef = useRef(new Map()); const disruptionEntitiesRef = useRef(new Map()); const pulseRafRef = useRef(null); const pulseRadiusRef = useRef(50000); const tooltipRef = useRef(null); const autoRotateRafRef = useRef(null); const idleTimerRef = useRef(null); const isRotatingRef = useRef(false); const resetIdleTimerRef = useRef(null); const portEntitiesRef = useRef(new Map()); const [f, setF] = useState('all'); const [t, setT] = useState(null); const [zoomLevel, setZoomLevel] = useState('far');
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
      const scene = v.scene; const globe = scene.globe; v.resolutionScale = Math.min(window.devicePixelRatio || 1, 2.0); scene.fxaa = true; scene.highDynamicRange = true; if (scene.context.msaaSupported) { scene.msaaSamples = 4; } globe.enableLighting = true; globe.dynamicAtmosphereLighting = true; globe.dynamicAtmosphereLightingFromSun = true; globe.showGroundAtmosphere = true; globe.atmosphereLightIntensity = 2.0; globe.tileCacheSize = 1000; globe.maximumScreenSpaceError = 1.0; globe.preloadAncestors = true; globe.preloadSiblings = true; globe.loadingDescendantLimit = 20; globe.depthTestAgainstTerrain = true; globe.baseColor = Color.fromCssColorString('#030D1F'); scene.skyAtmosphere.show = true; scene.skyAtmosphere.perFragmentAtmosphere = true; scene.skyAtmosphere.atmosphereLightIntensity = 12.0; scene.skyBox.show = true; scene.sun.show = true; scene.moon.show = false; scene.fog.enabled = true; scene.fog.density = 0.0002; scene.fog.minimumBrightness = 0.03; v.camera.setView({ destination: Cartesian3.fromDegrees(60, 20, 22000000) });
      scene.screenSpaceCameraController.minimumZoomDistance = 200; scene.screenSpaceCameraController.maximumZoomDistance = 25000000;
      scene.screenSpaceCameraController.inertiaSpin = 0.5;
      scene.screenSpaceCameraController.inertiaTranslate = 0.5;
      scene.screenSpaceCameraController.inertiaZoom = 0.5;
      scene.screenSpaceCameraController.enableCollisionDetection = true;
      // Bloom disabled: post-process blur degrades satellite tile clarity at zoom
      scene.postProcessStages.bloom.enabled = false;
      // Visual cohesion: enhance contrast, brightness, saturation for deeper immersion
      scene.postProcessStages.fxaa.enabled = true;
      if (scene.postProcessStages.chromaticAberration) scene.postProcessStages.chromaticAberration.enabled = false;
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
    const routes = ingestRoutes(ss.map((x) => {
      const route = x.status === 'rerouted' && x.disruptionId ? reroutedRoutes[x.disruptionId] : null;
      return route ? { ...x, route } : x;
    }));
    const currentIds = new Set(routes.map((r) => r.id));

    for (const [id, refs] of entityMap) {
      if (!currentIds.has(id)) {
        if (refs.point) entities.remove(refs.point);
        if (refs.glowEntity) entities.remove(refs.glowEntity);
        if (refs.coreEntity) entities.remove(refs.coreEntity);
        if (refs.arrowEntity) entities.remove(refs.arrowEntity);
        entityMap.delete(id);
      }
    }

    routes.forEach((route) => {
      const refs = entityMap.get(route.id);
      if (refs) {
        if (refs.point) entities.remove(refs.point);
        if (refs.glowEntity) entities.remove(refs.glowEntity);
        if (refs.coreEntity) entities.remove(refs.coreEntity);
        if (refs.arrowEntity) entities.remove(refs.arrowEntity);
      }

      const visual = encodeRouteVisual(route);
      const positions = route.waypoints.length >= 2
        ? generateArcFromWaypoints(route.waypoints)
        : generateArcPositions(route.origin.lng, route.origin.lat, route.destination.lng, route.destination.lat, 64, undefined, visual.peakAltFactor);
      const arcEntities = buildCesiumEntities(dsRef.current, positions, visual, route.id);
      const point = isValidCoord(route.current.lng) && isValidCoord(route.current.lat)
        ? entities.add({ position: Cartesian3.fromDegrees(route.current.lng, route.current.lat), point: { pixelSize: route.status === 'delayed' ? 10 : 8, color: Color.fromCssColorString(C[route.status] || C.active), outlineColor: Color.BLACK, outlineWidth: 1 }, properties: { kind: 'shipment', status: route.status, label: `${route.origin.name} -> ${route.destination.name}` } })
        : null;
      entityMap.set(route.id, { ...arcEntities, point });
    });

    const ports = new Map();
    routes.forEach((r) => {
      ports.set(r.origin.name, r.origin);
      ports.set(r.destination.name, r.destination);
    });

    for (const [name, labelEntity] of portEntitiesRef.current) {
      if (!ports.has(name)) {
        entities.remove(labelEntity);
        portEntitiesRef.current.delete(name);
      }
    }

    for (const [name, port] of ports) {
      const existing = portEntitiesRef.current.get(name);
      if (existing) {
        existing.position = Cartesian3.fromDegrees(port.lng, port.lat);
        existing.label.text = name;
      } else {
        const labelEntity = entities.add({
          id: `port-${name}`,
          position: Cartesian3.fromDegrees(port.lng, port.lat),
          point: { pixelSize: 5, color: Color.fromCssColorString('#e2e8f0') },
          label: {
            text: name,
            font: 'bold 14px sans-serif',
            style: LabelStyle.FILL_AND_OUTLINE,
            fillColor: Color.WHITE,
            outlineColor: Color.BLACK,
            outlineWidth: 2,
            pixelOffset: new Cartesian2(0, -14),
            translucencyByDistance: new NearFarScalar(1.5e6, 1.0, 5.0e6, 0.0),
            scaleByDistance: new NearFarScalar(1.5e6, 1.0, 5.0e6, 0.5),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          properties: { kind: 'port', label: name, status: 'port' },
          show: new ConstantProperty(false),
        });
        portEntitiesRef.current.set(name, labelEntity);
      }
    }

    vRef.current?.scene.requestRender();
  }, [ss, reroutedRoutes]);

  useEffect(() => {
    const show = zoomLevel !== 'far';
    for (const entity of portEntitiesRef.current.values()) {
      entity.show = new ConstantProperty(show);
    }
    vRef.current?.scene.requestRender();
  }, [zoomLevel]);

  useEffect(() => {
    if (!vRef.current) return;
    const viewer = vRef.current;
    if (pulseRafRef.current) {
      cancelAnimationFrame(pulseRafRef.current);
      pulseRafRef.current = null;
    }
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
