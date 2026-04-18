'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDebouncedCallback } from 'use-debounce';
import { shallow } from 'zustand/shallow';
import {
  Cartesian2,
  Cartesian3,
  Color,
  ConstantProperty,
  EllipsoidTerrainProvider,
  Cartographic,
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
import { generateGeodesicRoutePositions } from '../../lib/arcGeometry.js';
import GlobeControls from './GlobeControls.jsx';
import { useGlobeCamera } from './useGlobeCamera.js';

const C = { active: '#22c55e', delayed: '#ef4444', rerouted: '#3b82f6', disrupted: '#f97316' };

function isValidCoord(lat, lon) {
  return !(lat === 0 && lon === 0) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}

function dominantStatus(statuses) {
  if (statuses.has('delayed')) return 'delayed';
  if (statuses.has('rerouted')) return 'rerouted';
  return 'active';
}

function getCoordValue(item, primary, fallback) {
  return item?.[primary] ?? item?.[fallback];
}

function getRoutePoints(shipment, reroutedRoute) {
  const source = reroutedRoute || shipment;
  const points = [
    { lat: getCoordValue(source, 'originLat', 'originLatitude'), lon: getCoordValue(source, 'originLon', 'originLng') },
    ...((source.waypoints || []).map((w) => ({ lat: getCoordValue(w, 'lat', 'latitude'), lon: getCoordValue(w, 'lon', 'lng') }))),
    { lat: getCoordValue(source, 'destLat', 'destLatitude'), lon: getCoordValue(source, 'destLon', 'destLng') },
  ];
  return points.filter((point) => isValidCoord(point.lat, point.lon));
}

export default function GlobeView() {
  const cRef = useRef(null); const vRef = useRef(null); const hoverRafRef = useRef(null); const zoomRef = useRef('far'); const entityMapRef = useRef(new Map()); const disruptionEntitiesRef = useRef(new Map()); const pulseRafRef = useRef(null); const pulseRadiusRef = useRef(50000); const tooltipRef = useRef(null); const autoRotateRafRef = useRef(null); const idleTimerRef = useRef(null); const isRotatingRef = useRef(false); const resetIdleTimerRef = useRef(null); const portEntitiesRef = useRef(new Map()); const [f, setF] = useState('all'); const [t, setT] = useState(null); const [zoomLevel, setZoomLevel] = useState('far');
  const setZoomLevelDebounced = useDebouncedCallback((next) => setZoomLevel(next), 300);
  const s = useShipmentStore((x) => x.shipments, shallow); const disruptions = useAlertStore((x) => x.disruptions); const reroutedRoutes = useAlertStore((x) => x.reroutedRoutes);
  const { setLastInteraction } = useGlobeCamera(vRef);

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
          animation: false, timeline: false, sceneModePicker: false, geocoder: false, baseLayerPicker: false, navigationHelpButton: false, homeButton: false, fullscreenButton: false, infoBox: false, selectionIndicator: false, shouldAnimate: false, requestRenderMode: true, maximumRenderTimeChange: Infinity, msaaSamples: 1, shadows: false, scene3DOnly: true,
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
      const scene = v.scene; const globe = scene.globe; v.resolutionScale = Math.min(window.devicePixelRatio || 1, 2.0); scene.fxaa = true; scene.highDynamicRange = true; globe.enableLighting = true; globe.dynamicAtmosphereLighting = true; globe.dynamicAtmosphereLightingFromSun = true; globe.showGroundAtmosphere = true; globe.atmosphereLightIntensity = 2.0; globe.tileCacheSize = 1000; globe.maximumScreenSpaceError = 1.0; globe.preloadAncestors = true; globe.preloadSiblings = true; globe.loadingDescendantLimit = 20; globe.depthTestAgainstTerrain = true; globe.baseColor = Color.fromCssColorString('#030D1F'); scene.skyAtmosphere.show = true; scene.skyAtmosphere.perFragmentAtmosphere = true; scene.skyAtmosphere.atmosphereLightIntensity = 12.0; scene.skyBox.show = true; scene.sun.show = true; scene.moon.show = false; scene.fog.enabled = true; scene.fog.density = 0.0002; scene.fog.minimumBrightness = 0.03; v.camera.setView({ destination: Cartesian3.fromDegrees(60, 20, 22000000) });
      scene.screenSpaceCameraController.enableCollisionDetection = false;
      scene.screenSpaceCameraController.inertiaSpin = 0.9;
      scene.screenSpaceCameraController.inertiaTranslate = 0.9;
      scene.screenSpaceCameraController.inertiaZoom = 0.8;
      scene.screenSpaceCameraController.minimumZoomDistance = 500000;
      scene.screenSpaceCameraController.maximumZoomDistance = 30000000;
      // Bloom disabled: post-process blur degrades satellite tile clarity at zoom
      scene.postProcessStages.bloom.enabled = false;
      // Visual cohesion: enhance contrast, brightness, saturation for deeper immersion
      scene.postProcessStages.fxaa.enabled = true;
      if (scene.postProcessStages.chromaticAberration) scene.postProcessStages.chromaticAberration.enabled = false;
      vRef.current = v;
      v.scene.canvas.addEventListener("mousedown", () => { resetIdleTimer(); setLastInteraction(); });
      v.scene.canvas.addEventListener("touchstart", () => { resetIdleTimer(); setLastInteraction(); });
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
      return () => { if (hoverRafRef.current) cancelAnimationFrame(hoverRafRef.current); if (pulseRafRef.current) cancelAnimationFrame(pulseRafRef.current); stopAutoRotate(); if (idleTimerRef.current) clearTimeout(idleTimerRef.current); setZoomLevelDebounced.cancel(); events.destroy(); v.destroy(); vRef.current = null; };
    })();
  }, [resetIdleTimer, setLastInteraction, setZoomLevelDebounced, stopAutoRotate]);

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

  const groupedRoutes = useMemo(() => {
    const routeMap = new Map();
    s.forEach((shipment) => {
      const routeKey = [shipment.originCode, shipment.destCode].sort().join('|');
      const reroutedRoute = shipment.status === 'rerouted' && shipment.disruptionId ? reroutedRoutes[shipment.disruptionId] : null;
      if (!routeMap.has(routeKey)) {
        routeMap.set(routeKey, {
          routeKey,
          originCode: shipment.originCode,
          destCode: shipment.destCode,
          originLat: getCoordValue(shipment, 'originLat', 'originLatitude'),
          originLon: getCoordValue(shipment, 'originLon', 'originLng'),
          destLat: getCoordValue(shipment, 'destLat', 'destLatitude'),
          destLon: getCoordValue(shipment, 'destLon', 'destLng'),
          waypoints: reroutedRoute?.waypoints || shipment.waypoints || [],
          statuses: new Set(),
          count: 0,
          ids: [],
        });
      }
      const route = routeMap.get(routeKey);
      route.statuses.add(shipment.status);
      route.count += 1;
      route.ids.push(shipment.id);
      if (reroutedRoute?.waypoints?.length) route.waypoints = reroutedRoute.waypoints;
    });
    const result = [...routeMap.values()].map((route) => ({ ...route, status: dominantStatus(route.statuses) }));
    if (result.length > 0) {
      console.log('[Globe] Route grouping:', { uniqueRoutes: result.length, totalShipments: s.length, routes: result.map(r => ({ key: r.routeKey, count: r.count, status: r.status })) });
    }
    return result;
  }, [s, reroutedRoutes]);

  useEffect(() => {
    if (!vRef.current) return;
    const viewer = vRef.current;
    const entities = viewer.entities;
    const routeEntities = entityMapRef.current;
    const nextKeys = new Set(groupedRoutes.map((route) => route.routeKey));

    entities.suspendEvents();
    try {
      for (const [routeKey, refs] of routeEntities) {
        if (nextKeys.has(routeKey)) continue;
        if (refs.arc) entities.remove(refs.arc);
        if (refs.originDot) entities.remove(refs.originDot);
        if (refs.destinationDot) entities.remove(refs.destinationDot);
        routeEntities.delete(routeKey);
      }

      groupedRoutes.forEach((route, routeIndex) => {
        const existing = routeEntities.get(route.routeKey);
        if (existing) {
          if (existing.arc) entities.remove(existing.arc);
          if (existing.originDot) entities.remove(existing.originDot);
          if (existing.destinationDot) entities.remove(existing.destinationDot);
        }

        const colorMap = { active: '#00FF88', delayed: '#FF4444', rerouted: '#FFB300' };
        const color = Color.fromCssColorString(colorMap[route.status] || colorMap.active).withAlpha(0.75);
        const positions = generateGeodesicRoutePositions(getRoutePoints(route), routeIndex, 48);
        const width = Math.min(1 + Math.floor(route.count / 3), 5);
        const arc = entities.add({
          id: `${route.routeKey}-arc`,
          polyline: { positions, width, material: color, clampToGround: false },
          properties: { kind: 'route', status: route.status, routeKey: route.routeKey, label: `${route.originCode} -> ${route.destCode}` },
        });
        const originDot = isValidCoord(route.originLat, route.originLon)
          ? entities.add({ id: `${route.routeKey}-origin-dot`, position: Cartesian3.fromDegrees(route.originLon, route.originLat), point: { pixelSize: 7, color, outlineColor: Color.BLACK, outlineWidth: 1 }, properties: { kind: 'dot', status: route.status, routeKey: route.routeKey, label: route.originCode } })
          : null;
        const destinationDot = isValidCoord(route.destLat, route.destLon)
          ? entities.add({ id: `${route.routeKey}-destination-dot`, position: Cartesian3.fromDegrees(route.destLon, route.destLat), point: { pixelSize: 7, color, outlineColor: Color.BLACK, outlineWidth: 1 }, properties: { kind: 'dot', status: route.status, routeKey: route.routeKey, label: route.destCode } })
          : null;
        routeEntities.set(route.routeKey, { arc, originDot, destinationDot });
      });

      const ports = new Map();
      groupedRoutes.forEach((route) => {
        const originLat = getCoordValue(route, 'originLat', 'originLatitude');
        const originLon = getCoordValue(route, 'originLon', 'originLng');
        const destLat = getCoordValue(route, 'destLat', 'destLatitude');
        const destLon = getCoordValue(route, 'destLon', 'destLng');
        ports.set(route.originCode, { lat: originLat, lon: originLon });
        ports.set(route.destCode, { lat: destLat, lon: destLon });
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
        existing.position = Cartesian3.fromDegrees(port.lon, port.lat);
        existing.label.text = name;
      } else {
        const labelEntity = entities.add({
          id: `port-${name}`,
          position: Cartesian3.fromDegrees(port.lon, port.lat),
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
          properties: { kind: 'port', label: name },
          show: new ConstantProperty(false),
        });
        portEntitiesRef.current.set(name, labelEntity);
      }
    }

      viewer.scene.requestRender();
    } finally {
      entities.resumeEvents();
    }
  }, [groupedRoutes, reroutedRoutes]);

  useEffect(() => {
    if (!vRef.current) return;
    vRef.current.entities.values.forEach((entity) => {
      const status = entity.properties?.status?.getValue();
      if (status === 'active' || status === 'delayed' || status === 'rerouted') {
        entity.show = f === 'all' || status === f;
      }
    });
    vRef.current.scene.requestRender();
  }, [f]);

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

    viewer.entities.suspendEvents();
    try {
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
    } finally {
      viewer.entities.resumeEvents();
    }

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
