'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArcType,
  Cartesian3,
  Color,
  CustomDataSource,
  GeoJsonDataSource,
  HeightReference,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Viewer,
} from 'cesium';
import { useShipmentStore } from '../../store/shipmentStore.js';
import { useAlertStore } from '../../store/alertStore.js';
import GlobeControls from './GlobeControls.jsx';

const C = { active: '#22c55e', delayed: '#ef4444', rerouted: '#3b82f6', disrupted: '#f97316' };
const CITIES = [['Shanghai', 31.2304, 121.4737], ['Singapore', 1.3521, 103.8198], ['Los Angeles', 34.0522, -118.2437], ['Rotterdam', 51.9244, 4.4777], ['Dubai', 25.2048, 55.2708], ['Mumbai', 19.076, 72.8777], ['Hong Kong', 22.3193, 114.1694], ['New York', 40.7128, -74.006]];
const STATES = [['California', 36.7783, -119.4179], ['Texas', 31.9686, -99.9018], ['Florida', 27.6648, -81.5158], ['New York State', 43, -75], ['Maharashtra', 19.7515, 75.7139], ['Gujarat', 22.2587, 71.1924], ['Tamil Nadu', 11.1271, 78.6569], ['Western Australia', -25.2744, 122]];

export default function GlobeView() {
  const cRef = useRef(null); const vRef = useRef(null); const dsRef = useRef(null); const hoverRafRef = useRef(null); const zoomRef = useRef('far'); const [f, setF] = useState('all'); const [t, setT] = useState(null); const [zoomLevel, setZoomLevel] = useState('far');
  const s = useShipmentStore((x) => x.shipments); const d = useAlertStore((x) => x.disruptions); const reroutedRoutes = useAlertStore((x) => x.reroutedRoutes);

  useEffect(() => {
    if (!cRef.current || vRef.current) return;
    const v = new Viewer(cRef.current, { animation: false, timeline: false, sceneModePicker: false, geocoder: false, baseLayerPicker: false, navigationHelpButton: false, homeButton: false, fullscreenButton: false, infoBox: false, selectionIndicator: false, shouldAnimate: true, requestRenderMode: true, maximumRenderTimeChange: Infinity });
    v.useBrowserRecommendedResolution = false;
    v.resolutionScale = Math.min(window.devicePixelRatio || 1, 2);
    v.scene.globe.enableLighting = true;
    v.scene.globe.baseColor = Color.fromCssColorString('#000108');
    v.scene.fxaa = false;
    v.camera.setView({ destination: Cartesian3.fromDegrees(10, 20, 25000000) });
    const ds = new CustomDataSource('shipments');
    v.dataSources.add(ds);
    vRef.current = v; dsRef.current = ds;
    const onCam = () => {
      const h = v.camera.positionCartographic.height / 10000000;
      const next = h < 1.95 ? 'state' : h < 2.3 ? 'city' : 'far';
      if (next !== zoomRef.current) {
        zoomRef.current = next;
        setZoomLevel(next);
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
    GeoJsonDataSource.load('https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson', { stroke: Color.fromCssColorString('#64748b'), fill: Color.fromCssColorString('#0f172a').withAlpha(0.05), strokeWidth: 1 }).then((cds) => v.dataSources.add(cds)).catch(() => null);
    return () => { if (hoverRafRef.current) cancelAnimationFrame(hoverRafRef.current); events.destroy(); v.destroy(); vRef.current = null; dsRef.current = null; };
  }, []);

  const ss = useMemo(() => (f === 'all' ? s : s.filter((x) => x.status === f)), [f, s]);
  useEffect(() => {
    if (!dsRef.current) return;
    const e = dsRef.current.entities; e.removeAll();
    ss.forEach((x) => {
      e.add({ position: Cartesian3.fromDegrees(x.currentLng, x.currentLat), point: { pixelSize: x.status === 'delayed' ? 10 : 8, color: Color.fromCssColorString(C[x.status] || C.active), outlineColor: Color.BLACK, outlineWidth: 1, heightReference: HeightReference.NONE }, properties: { kind: 'shipment', status: x.status, label: `${x.origin} -> ${x.destination}` } });
      const route = x.status === 'rerouted' && x.disruptionId ? reroutedRoutes[x.disruptionId] : null;
      const coords = route?.geometry?.coordinates || route?.features?.[0]?.geometry?.coordinates;
      if (Array.isArray(coords) && coords.length > 1) {
        for (let i = 0; i < coords.length - 1; i++) e.add({ polyline: { positions: Cartesian3.fromDegreesArray([coords[i][0], coords[i][1], coords[i + 1][0], coords[i + 1][1]]), width: 2, material: Color.fromCssColorString('#60A5FA'), arcType: ArcType.GEODESIC }, properties: { kind: 'route', status: 'rerouted', label: 'Rerouted Segment' } });
      } else {
        e.add({ polyline: { positions: Cartesian3.fromDegreesArray([x.originLng, x.originLat, x.destLng, x.destLat]), width: x.status === 'delayed' ? 2.6 : 1.8, material: Color.fromCssColorString(C[x.status] || C.active), arcType: ArcType.GEODESIC }, properties: { kind: 'route', status: x.status, label: 'Route Segment' } });
      }
    });
    if (zoomLevel !== 'far') CITIES.forEach(([name, lat, lng]) => e.add({ position: Cartesian3.fromDegrees(lng, lat), point: { pixelSize: 5, color: Color.fromCssColorString('#e2e8f0') }, properties: { kind: 'city', label: name, status: 'city' } }));
    if (zoomLevel === 'state') STATES.forEach(([name, lat, lng]) => e.add({ position: Cartesian3.fromDegrees(lng, lat), point: { pixelSize: 4, color: Color.fromCssColorString('#a78bfa') }, properties: { kind: 'state', label: name, status: 'state' } }));
  }, [ss, reroutedRoutes, zoomLevel]);

  return <div className="relative w-full h-full bg-[#000108]"><GlobeControls onFilterChange={setF} /><div ref={cRef} className="h-full w-full" />{t && <div className="fixed z-20 bg-black/80 border border-white/10 rounded-lg p-3 text-xs text-white" style={{ left: t.x + 12, top: t.y - 40 }}><p className="font-medium">{t.label}</p><p className="text-white/60 capitalize">{t.kind} • {t.status}</p></div>}<div className="absolute bottom-4 right-4 z-10 bg-black/50 backdrop-blur-md border border-white/10 rounded-xl px-4 py-2 flex gap-4 text-xs"><span className="text-green-400">{s.filter((x) => x.status === 'active').length} active</span><span className="text-red-400">{s.filter((x) => x.status === 'delayed').length} delayed</span><span className="text-blue-400">{s.filter((x) => x.status === 'rerouted').length} rerouted</span></div></div>;
}
