'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useDebouncedCallback } from 'use-debounce';
import {
  ArcType,
  Cartesian2,
  Cartesian3,
  CallbackProperty,
  Color,
  CustomDataSource,
  EllipsoidTerrainProvider,
  DistanceDisplayCondition,
  HeightReference,
  ImageryLayer,
  JulianDate,
  LabelStyle,
  NearFarScalar,
  PolylineDashMaterialProperty,
  PolylineGlowMaterialProperty,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  TileMapServiceImageryProvider,
  Viewer,
  buildModuleUrl,
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
  const cRef = useRef(null); const vRef = useRef(null); const dsRef = useRef(null); const hoverRafRef = useRef(null); const zoomRef = useRef('far'); const entityMapRef = useRef(new Map()); const disruptionEntitiesRef = useRef(new Map()); const pulseRafRef = useRef(null); const pulseRadiusRef = useRef(50000); const zoomEntityIdsRef = useRef(new Set()); const [f, setF] = useState('all'); const [t, setT] = useState(null); const [zoomLevel, setZoomLevel] = useState('far');
  const setZoomLevelDebounced = useDebouncedCallback((next) => setZoomLevel(next), 300);
  const s = useShipmentStore((x) => x.shipments); const disruptions = useAlertStore((x) => x.disruptions); const reroutedRoutes = useAlertStore((x) => x.reroutedRoutes);
  useGlobeCamera(vRef);

  useEffect(() => {
    if (!cRef.current || vRef.current) return;
    let v;
    try {
      v = new Viewer(cRef.current, { animation: false, timeline: false, sceneModePicker: false, geocoder: false, baseLayerPicker: false, navigationHelpButton: false, homeButton: false, fullscreenButton: false, infoBox: false, selectionIndicator: false, shouldAnimate: false, requestRenderMode: true, maximumRenderTimeChange: Infinity, terrainProvider: new EllipsoidTerrainProvider(), baseLayer: ImageryLayer.fromProviderAsync(TileMapServiceImageryProvider.fromUrl(buildModuleUrl('Assets/Textures/NaturalEarthII'))) });
    } catch (err) {
      console.error('[GlobeView] Failed to initialize Cesium Viewer:', err);
      return;
    }
    const scene = v.scene; const globe = scene.globe; v.useBrowserRecommendedResolution = false; v.resolutionScale = Math.min(window.devicePixelRatio || 1, 1.5); scene.fxaa = true; globe.enableLighting = true; globe.dynamicAtmosphereLighting = true; globe.dynamicAtmosphereLightingFromSun = true; globe.showGroundAtmosphere = true; globe.atmosphereLightIntensity = 10.0; globe.tileCacheSize = 50; globe.baseColor = Color.fromCssColorString('#020B18'); scene.skyAtmosphere.show = true; scene.skyAtmosphere.perFragmentAtmosphere = true; scene.skyAtmosphere.atmosphereLightIntensity = 20.0; scene.skyBox.show = true; scene.sun.show = true; scene.moon.show = false; scene.fog.enabled = true; scene.fog.density = 0.0002; scene.fog.minimumBrightness = 0.0; v.camera.setView({ destination: Cartesian3.fromDegrees(60, 20, 22000000) });
    const ds = new CustomDataSource('shipments');
    v.dataSources.add(ds);
    vRef.current = v; dsRef.current = ds;
    const onCam = () => {
      const h = v.camera.positionCartographic.height / 10000000;
      const next = h < 1.95 ? 'state' : h < 2.3 ? 'city' : 'far';
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
        if (!pr) return setT(null);
        setT({ x: m.endPosition.x, y: m.endPosition.y, label: pr.label?.getValue() || 'Item', kind: pr.kind?.getValue() || 'entity', status: pr.status?.getValue() || '' });
      });
    }, ScreenSpaceEventType.MOUSE_MOVE);
    return () => { if (hoverRafRef.current) cancelAnimationFrame(hoverRafRef.current); if (pulseRafRef.current) cancelAnimationFrame(pulseRafRef.current); setZoomLevelDebounced.cancel(); events.destroy(); v.destroy(); vRef.current = null; dsRef.current = null; };
  }, [setZoomLevelDebounced]);

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
        const line = entities.add({ polyline: { positions, width: lineWidth, material: Color.fromCssColorString(colorCss), arcType: ArcType.GEODESIC }, properties: { kind: 'route', status: x.status, label: x.status === 'rerouted' ? 'Rerouted Segment' : 'Route Segment' } });
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
        entities.add({ id, position: Cartesian3.fromDegrees(lng, lat), point: { pixelSize: 5, color: Color.fromCssColorString('#e2e8f0') }, properties: { kind: 'city', label: name, status: 'city' } });
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

  return <div className="relative w-full h-full bg-[#000108]"><GlobeControls onFilterChange={setF} /><div ref={cRef} className="h-full w-full" /><AnimatePresence>{t && <motion.div key={`${t.label}-${t.x}-${t.y}`} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="fixed z-20 bg-black/80 border border-white/10 rounded-lg p-3 text-xs text-white" style={{ left: Math.min(t.x + 12, window.innerWidth - 180), top: t.y - 40 }}><p className="font-medium">{t.label}</p><p className="text-white/60 capitalize">{t.kind} • {t.status}</p></motion.div>}</AnimatePresence><div className="absolute bottom-4 right-4 z-10 bg-black/50 backdrop-blur-md border border-white/10 rounded-xl px-4 py-2 flex gap-4 text-xs text-white/80"><div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: '#22c55e', boxShadow: '0 0 10px #22c55e' }} /><span>{s.filter((x) => x.status === 'active').length} active</span></div><div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: '#ef4444', boxShadow: '0 0 10px #ef4444' }} /><span>{s.filter((x) => x.status === 'delayed').length} delayed</span></div><div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: '#60a5fa', boxShadow: '0 0 10px #60a5fa' }} /><span>{s.filter((x) => x.status === 'rerouted').length} rerouted</span></div></div></div>;
}
