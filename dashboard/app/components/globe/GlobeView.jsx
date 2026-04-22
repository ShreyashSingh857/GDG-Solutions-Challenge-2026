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
import { useVesselPositions } from '../../hooks/useVesselPositions.js';
import { usePortCongestion } from '../../hooks/usePortCongestion.js';
import { useCorridorWeather } from '../../hooks/useCorridorWeather.js';

const C = { active: '#22c55e', delayed: '#f97316', rerouted: '#38bdf8', disrupted: '#ef4444' };
const vesselTrailBuffer = new Map();
const TRAIL_LENGTH = 6;

function isValidCoord(lat, lon) {
  return !(lat === 0 && lon === 0) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}

function dominantStatus(statuses) {
  if (statuses.has('rerouted')) return 'rerouted';
  if (statuses.has('delayed')) return 'delayed';
  return 'active';
}

function getCoordValue(item, primary, fallback) {
  return item?.[primary] ?? item?.[fallback];
}

function getEndpointLabel(item, codeKey, nameKey, fallback) {
  return item?.[codeKey] || item?.[nameKey] || fallback;
}

function getEndpointKey(item, codeKey, nameKey, latKey, lonKey, prefix) {
  const label = item?.[codeKey] || item?.[nameKey];
  if (label) return String(label).trim().toUpperCase();
  const lat = getCoordValue(item, latKey, latKey === 'originLat' ? 'originLatitude' : 'destLatitude');
  const lon = getCoordValue(item, lonKey, lonKey === 'originLon' ? 'originLng' : 'destLng');
  return isValidCoord(lat, lon) ? `${prefix}:${lat.toFixed(2)},${lon.toFixed(2)}` : `${prefix}:unknown`;
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
  const cRef = useRef(null);
  const vRef = useRef(null);
  const hoverRafRef = useRef(null);
  const zoomRef = useRef('far');
  const entityMapRef = useRef(new Map());
  const disruptionEntitiesRef = useRef(new Map());
  const portLabelEntitiesRef = useRef(new Map());
  const portHeatmapEntitiesRef = useRef(new Map());
  const corridorEntitiesRef = useRef(new Map());
  const vesselEntitiesRef = useRef(new Map());
  const pulseRafRef = useRef(null);
  const tooltipRef = useRef(null);
  const autoRotateRafRef = useRef(null);
  const idleTimerRef = useRef(null);
  const isRotatingRef = useRef(false);
  const resetIdleTimerRef = useRef(null);
  const [f, setF] = useState('all');
  const [t, setT] = useState(null);
  const [zoomLevel, setZoomLevel] = useState('far');
  const setZoomLevelDebounced = useDebouncedCallback((next) => setZoomLevel(next), 300);
  const s = useShipmentStore((x) => x.shipments, shallow);
  const disruptions = useAlertStore((x) => x.disruptions);
  const reroutedRoutes = useAlertStore((x) => x.reroutedRoutes);
  const vessels = useVesselPositions();
  const ports = usePortCongestion();
  const corridors = useCorridorWeather();
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
      return () => {
        if (hoverRafRef.current) cancelAnimationFrame(hoverRafRef.current);
        if (pulseRafRef.current) cancelAnimationFrame(pulseRafRef.current);
        stopAutoRotate();
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        setZoomLevelDebounced.cancel();
        events.destroy();
        v.destroy();
        vRef.current = null;
      };
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
      const originKey = getEndpointKey(shipment, 'originCode', 'origin', 'originLat', 'originLon', 'origin');
      const destKey = getEndpointKey(shipment, 'destCode', 'destination', 'destLat', 'destLon', 'dest');
      const routeKey = [originKey, destKey].sort().join('|');
      const reroutedRoute = shipment.status === 'rerouted' && shipment.disruptionId ? reroutedRoutes[shipment.disruptionId] : null;
      if (!routeMap.has(routeKey)) {
        routeMap.set(routeKey, {
          routeKey,
          originKey,
          destKey,
          originLabel: getEndpointLabel(shipment, 'originCode', 'origin', 'Origin'),
          destLabel: getEndpointLabel(shipment, 'destCode', 'destination', 'Destination'),
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
    if (process.env.NODE_ENV === 'development' && result.length > 0) {
      console.log('[Globe] Route grouping:', { uniqueRoutes: result.length, totalShipments: s.length });
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

        const colorMap = { active: C.active, delayed: C.delayed, rerouted: C.rerouted };
        const color = Color.fromCssColorString(colorMap[route.status] || colorMap.active).withAlpha(0.75);
        const positions = generateGeodesicRoutePositions(getRoutePoints(route), routeIndex, 48);
        const width = Math.min(1 + Math.floor(route.count / 3), 5);
        const routeLabel = `${route.originLabel} -> ${route.destLabel}`;
        const arc = entities.add({
          id: `${route.routeKey}-arc`,
          polyline: { positions, width, material: color, clampToGround: false },
          properties: { kind: 'route', status: route.status, routeKey: route.routeKey, label: routeLabel },
        });
        const originDot = isValidCoord(route.originLat, route.originLon)
          ? entities.add({ id: `${route.routeKey}-origin-dot`, position: Cartesian3.fromDegrees(route.originLon, route.originLat), point: { pixelSize: 7, color, outlineColor: Color.BLACK, outlineWidth: 1 }, properties: { kind: 'dot', status: route.status, routeKey: route.routeKey, label: route.originLabel } })
          : null;
        const destinationDot = isValidCoord(route.destLat, route.destLon)
          ? entities.add({ id: `${route.routeKey}-destination-dot`, position: Cartesian3.fromDegrees(route.destLon, route.destLat), point: { pixelSize: 7, color, outlineColor: Color.BLACK, outlineWidth: 1 }, properties: { kind: 'dot', status: route.status, routeKey: route.routeKey, label: route.destLabel } })
          : null;
        routeEntities.set(route.routeKey, { arc, originDot, destinationDot });
      });

      const ports = new Map();
      groupedRoutes.forEach((route) => {
        const originLat = getCoordValue(route, 'originLat', 'originLatitude');
        const originLon = getCoordValue(route, 'originLon', 'originLng');
        const destLat = getCoordValue(route, 'destLat', 'destLatitude');
        const destLon = getCoordValue(route, 'destLon', 'destLng');
        ports.set(route.originKey, { label: route.originLabel, lat: originLat, lon: originLon });
        ports.set(route.destKey, { label: route.destLabel, lat: destLat, lon: destLon });
      });

    for (const [name, labelEntity] of portLabelEntitiesRef.current) {
      if (!ports.has(name)) {
        entities.remove(labelEntity);
        portLabelEntitiesRef.current.delete(name);
      }
    }

    for (const [name, port] of ports) {
      const existing = portLabelEntitiesRef.current.get(name);
      if (existing) {
        existing.position = Cartesian3.fromDegrees(port.lon, port.lat);
        existing.label.text = port.label;
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
          properties: { kind: 'port-label', label: name },
          show: new ConstantProperty(false),
        });
        portLabelEntitiesRef.current.set(name, labelEntity);
      }
    }

      viewer.scene.requestRender();
    } finally {
      entities.resumeEvents();
    }
  }, [groupedRoutes, reroutedRoutes]);

  useEffect(() => {
    if (!vRef.current) return;
    const routeEntities = entityMapRef.current;
    const statusByRoute = new Map(groupedRoutes.map((route) => [route.routeKey, route.status]));

    for (const [routeKey, refs] of routeEntities) {
      const status = statusByRoute.get(routeKey);
      const visible = status ? (f === 'all' || status === f) : false;
      if (refs.arc) refs.arc.show = visible;
      if (refs.originDot) refs.originDot.show = visible;
      if (refs.destinationDot) refs.destinationDot.show = visible;
    }

    vRef.current.scene.requestRender();
  }, [f, groupedRoutes]);

  useEffect(() => {
    const show = zoomLevel !== 'far';
    for (const entity of portLabelEntitiesRef.current.values()) {
      entity.show = new ConstantProperty(show);
    }
    vRef.current?.scene.requestRender();
  }, [zoomLevel]);

  useEffect(() => {
    if (!vRef.current) return;
    const viewer = vRef.current;

    for (const [locode, entity] of portHeatmapEntitiesRef.current) {
      if (!ports.find((port) => port.locode === locode)) {
        viewer.entities.remove(entity);
        portHeatmapEntitiesRef.current.delete(locode);
      }
    }

    ports.forEach((port) => {
      if (!isValidCoord(Number(port.lat), Number(port.lng))) return;

      const waitH = Number(port.avgWaitHours || 0);
      const score = Number(port.congestionScore || 0);
      const color = waitH > 96 || score > 75
        ? Color.fromCssColorString('#ef4444').withAlpha(0.55)
        : waitH > 48 || score > 40
          ? Color.fromCssColorString('#f59e0b').withAlpha(0.5)
          : Color.fromCssColorString('#22c55e').withAlpha(0.4);
      const radius = 60_000 + (score / 100) * 140_000;

      const existing = portHeatmapEntitiesRef.current.get(port.locode);
      if (existing) {
        existing.position = Cartesian3.fromDegrees(Number(port.lng), Number(port.lat), 0);
        existing.ellipse.semiMajorAxis = new ConstantProperty(radius);
        existing.ellipse.semiMinorAxis = new ConstantProperty(radius);
        existing.ellipse.material = color;
        if (existing.label) {
          existing.label.show = new ConstantProperty(zoomLevel === 'state' || zoomLevel === 'city');
          existing.label.text = `${port.name}\n${waitH.toFixed(0)}h wait`;
        }
      } else {
        const entity = viewer.entities.add({
          id: `port-heatmap-${port.locode}`,
          position: Cartesian3.fromDegrees(Number(port.lng), Number(port.lat), 0),
          ellipse: {
            semiMajorAxis: new ConstantProperty(radius),
            semiMinorAxis: new ConstantProperty(radius),
            material: color,
            outline: true,
            outlineColor: color.brighten(0.4, new Color()),
            outlineWidth: 1.5,
            heightReference: HeightReference.CLAMP_TO_GROUND,
          },
          label: {
            text: `${port.name}\n${waitH.toFixed(0)}h wait`,
            font: '11px monospace',
            fillColor: Color.WHITE,
            showBackground: true,
            backgroundColor: Color.BLACK.withAlpha(0.55),
            pixelOffset: new Cartesian2(0, -70),
            show: new ConstantProperty(zoomLevel === 'state' || zoomLevel === 'city'),
            style: LabelStyle.FILL_AND_OUTLINE,
            outlineWidth: 2,
            outlineColor: Color.BLACK,
            scaleByDistance: new NearFarScalar(1e5, 1.2, 1e7, 0.4),
          },
          properties: {
            kind: 'port',
            label: `${port.name} (${port.locode})`,
            status: `Wait: ${waitH.toFixed(0)}h | Congestion: ${score}/100`,
          },
        });
        portHeatmapEntitiesRef.current.set(port.locode, entity);
      }
    });

    viewer.scene.requestRender();
  }, [ports, zoomLevel]);

  useEffect(() => {
    if (!vRef.current) return;
    const viewer = vRef.current;

    for (const [name, entity] of corridorEntitiesRef.current) {
      if (!corridors.find((corridor) => corridor.name === name)) {
        viewer.entities.remove(entity);
        corridorEntitiesRef.current.delete(name);
      }
    }

    corridors.forEach((corridor) => {
      if (corridor.riskLevel === 'LOW' || corridor.riskLevel === 'UNKNOWN') {
        const existing = corridorEntitiesRef.current.get(corridor.name);
        if (existing) {
          viewer.entities.remove(existing);
          corridorEntitiesRef.current.delete(corridor.name);
        }
        return;
      }

      const color = corridor.riskLevel === 'SEVERE'
        ? Color.fromCssColorString('#ef4444').withAlpha(0.7)
        : Color.fromCssColorString('#f59e0b').withAlpha(0.55);
      const positions = Cartesian3.fromDegreesArray([
        corridor.fromLng, corridor.fromLat,
        corridor.lng, corridor.lat,
        corridor.toLng, corridor.toLat,
      ]);

      const existing = corridorEntitiesRef.current.get(corridor.name);
      if (existing) {
        existing.polyline.positions = new ConstantProperty(positions);
        existing.polyline.material = color;
      } else {
        const entity = viewer.entities.add({
          id: `weather-${corridor.name}`,
          polyline: {
            positions,
            width: corridor.riskLevel === 'SEVERE' ? 4 : 2.5,
            material: color,
            clampToGround: false,
          },
          properties: {
            kind: 'weather',
            label: `${corridor.name} Weather Risk`,
            status: `${corridor.riskLevel} | ${corridor.maxWaveHeight}m waves | ${corridor.maxWindSpeed} km/h winds`,
          },
        });
        corridorEntitiesRef.current.set(corridor.name, entity);
      }
    });

    viewer.scene.requestRender();
  }, [corridors, zoomLevel]);

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

  useEffect(() => {
    if (!vRef.current) return;
    const viewer = vRef.current;
    const entities = viewer.entities;
    const nextIds = new Set(vessels.map((v) => String(v.id || v.mmsi || '')));

    for (const [id, entity] of vesselEntitiesRef.current) {
      if (!nextIds.has(id)) {
        entities.remove(entity);
        vesselEntitiesRef.current.delete(id);
        const trailEntity = viewer.entities.getById(`vessel-trail-${id}`);
        if (trailEntity) viewer.entities.remove(trailEntity);
        vesselTrailBuffer.delete(id);
      }
    }

    vessels.forEach((v) => {
      const id = String(v.id || v.mmsi || '');
      if (!id || !isValidCoord(Number(v.lat), Number(v.lng))) return;

      const trail = vesselTrailBuffer.get(id) || [];
      trail.push({ lat: Number(v.lat), lng: Number(v.lng) });
      if (trail.length > TRAIL_LENGTH) trail.shift();
      vesselTrailBuffer.set(id, trail);

      if (trail.length > 1) {
        const trailId = `vessel-trail-${id}`;
        const trailPositions = trail.map((point) => Cartesian3.fromDegrees(point.lng, point.lat, 800));
        const trailColor = Number(v.speed || 0) < 0.5
          ? Color.fromCssColorString('#ef4444').withAlpha(0.5)
          : Color.fromCssColorString('#38bdf8').withAlpha(0.35);
        const existingTrail = viewer.entities.getById(trailId);
        if (existingTrail) {
          existingTrail.polyline.positions = new ConstantProperty(trailPositions);
          existingTrail.polyline.material = trailColor;
        } else {
          entities.add({
            id: trailId,
            polyline: {
              positions: new ConstantProperty(trailPositions),
              width: 1.5,
              material: trailColor,
            },
          });
        }
      }

      const speed = Number(v.speed || 0);
      const color = speed < 0.5
        ? Color.fromCssColorString('#ef4444')
        : speed < 8
          ? Color.fromCssColorString('#f59e0b')
          : Color.fromCssColorString('#22c55e');
      const existing = vesselEntitiesRef.current.get(id);
      if (existing) {
        existing.position = Cartesian3.fromDegrees(Number(v.lng), Number(v.lat));
        existing.point.color = color;
      } else {
        const entity = entities.add({
          id: `vessel-${id}`,
          position: Cartesian3.fromDegrees(Number(v.lng), Number(v.lat)),
          point: { pixelSize: 4, color, outlineColor: Color.BLACK, outlineWidth: 1 },
          properties: { kind: 'vessel', label: `MMSI ${id}`, status: `speed ${speed.toFixed(1)} kn` },
        });
        vesselEntitiesRef.current.set(id, entity);
      }
    });

    viewer.scene.requestRender();
  }, [vessels]);

  return <div className="relative w-full h-full bg-[#000108]"><GlobeControls onFilterChange={setF} /><div ref={cRef} className="h-full w-full" /><div ref={tooltipRef} style={{ position: "fixed", top: 0, left: 0, transform: "translate(-9999px, -9999px)", zIndex: 20, pointerEvents: "none", transition: "none" }} className={`bg-black/80 border border-white/10 rounded-lg p-3 text-xs text-white ${t ? 'visible' : 'invisible'}`}><p className="font-medium">{t?.label || ''}</p><p className="text-white/60 capitalize">{t?.kind || ''} • {t?.status || ''}</p></div></div>;
}
