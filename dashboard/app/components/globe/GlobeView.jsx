'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useShipmentStore } from '../../store/shipmentStore.js';
import { useAlertStore } from '../../store/alertStore.js';
import { useGlobeCamera } from './useGlobeCamera.js';
import GlobeControls from './GlobeControls.jsx';

const Globe = dynamic(() => import('react-globe.gl'), { ssr: false });
const C = { active: '#22c55e', delayed: '#ef4444', rerouted: '#3b82f6', disrupted: '#f97316' };
const MAJOR_CITIES = [
  { id: 'city-shanghai', name: 'Shanghai', lat: 31.2304, lng: 121.4737 },
  { id: 'city-singapore', name: 'Singapore', lat: 1.3521, lng: 103.8198 },
  { id: 'city-los-angeles', name: 'Los Angeles', lat: 34.0522, lng: -118.2437 },
  { id: 'city-rotterdam', name: 'Rotterdam', lat: 51.9244, lng: 4.4777 },
  { id: 'city-dubai', name: 'Dubai', lat: 25.2048, lng: 55.2708 },
  { id: 'city-mumbai', name: 'Mumbai', lat: 19.076, lng: 72.8777 },
  { id: 'city-hongkong', name: 'Hong Kong', lat: 22.3193, lng: 114.1694 },
  { id: 'city-newyork', name: 'New York', lat: 40.7128, lng: -74.006 },
];

const MAJOR_STATES = [
  { id: 'state-california', name: 'California', lat: 36.7783, lng: -119.4179 },
  { id: 'state-texas', name: 'Texas', lat: 31.9686, lng: -99.9018 },
  { id: 'state-florida', name: 'Florida', lat: 27.6648, lng: -81.5158 },
  { id: 'state-ny', name: 'New York State', lat: 43.0, lng: -75.0 },
  { id: 'state-maharashtra', name: 'Maharashtra', lat: 19.7515, lng: 75.7139 },
  { id: 'state-gujarat', name: 'Gujarat', lat: 22.2587, lng: 71.1924 },
  { id: 'state-tamilnadu', name: 'Tamil Nadu', lat: 11.1271, lng: 78.6569 },
  { id: 'state-western-australia', name: 'Western Australia', lat: -25.2744, lng: 122.0 },
];

export default function GlobeView() {
  const globeRef = useRef(); const controlsCleanupRef = useRef(null); const [f, setF] = useState('all'); const [t, setT] = useState(null); const [countries, setCountries] = useState([]); const [hoveredCountry, setHoveredCountry] = useState(null); const [zoomAltitude, setZoomAltitude] = useState(2.5);
  const s = useShipmentStore((x) => x.shipments); const d = useAlertStore((x) => x.disruptions); const reroutedRoutes = useAlertStore((x) => x.reroutedRoutes);
  useGlobeCamera(globeRef);

  const syncZoomAltitude = () => {
    if (!globeRef.current) return;
    const pov = globeRef.current.pointOfView();
    if (typeof pov?.altitude === 'number') setZoomAltitude(pov.altitude);
  };

  useEffect(() => {
    let active = true;
    fetch('https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson')
      .then((r) => r.json())
      .then((g) => { if (active) setCountries(g?.features || []); })
      .catch(() => { if (active) setCountries([]); });
    return () => { active = false; };
  }, []);

  useEffect(() => () => {
    controlsCleanupRef.current?.();
  }, []);

  const ss = useMemo(() => (f === 'all' ? s : s.filter((x) => x.status === f)), [s, f]);
  const pts = useMemo(() => {
    const shipments = ss.map((x) => ({ id: x.id, lat: x.currentLat, lng: x.currentLng, color: C[x.status] || C.active, size: x.status === 'delayed' ? 0.6 : 0.4, label: `${x.origin} → ${x.destination}`, carrier: x.carrier, cargoValueUSD: x.cargoValueUSD, status: x.status, kind: 'shipment' }));
    const cities = zoomAltitude < 2.3 ? MAJOR_CITIES.map((c) => ({ id: c.id, lat: c.lat, lng: c.lng, color: '#e2e8f0', size: 0.18, label: c.name, carrier: 'City', cargoValueUSD: 0, status: 'city', kind: 'city' })) : [];
    const states = zoomAltitude < 1.95 ? MAJOR_STATES.map((st) => ({ id: st.id, lat: st.lat, lng: st.lng, color: '#a78bfa', size: 0.18, label: st.name, carrier: 'State', cargoValueUSD: 0, status: 'state', kind: 'state' })) : [];
    return [...shipments, ...cities, ...states];
  }, [ss, zoomAltitude]);
  const arcs = useMemo(() => ss.flatMap((x) => {
    const baseArc = { startLat: x.originLat, startLng: x.originLng, endLat: x.destLat, endLng: x.destLng, color: C[x.status] || C.active, status: x.status };
    if (x.status !== 'rerouted' || !x.disruptionId || !reroutedRoutes[x.disruptionId]) return [baseArc];

    const route = reroutedRoutes[x.disruptionId];
    const coords = route?.geometry?.coordinates || route?.features?.[0]?.geometry?.coordinates || [];
    if (!Array.isArray(coords) || coords.length < 2) return [baseArc];

    const segments = [];
    for (let i = 0; i < coords.length - 1; i++) {
      const c0 = coords[i];
      const c1 = coords[i + 1];
      if (!Array.isArray(c0) || !Array.isArray(c1) || c0.length < 2 || c1.length < 2) continue;
      segments.push({
        startLat: c0[1],
        startLng: c0[0],
        endLat: c1[1],
        endLng: c1[0],
        color: '#60A5FA',
        status: 'rerouted',
      });
    }

    return segments.length ? segments : [baseArc];
  }), [ss, reroutedRoutes]);
  return <div className="relative w-full h-full bg-[#000108]"><GlobeControls onFilterChange={setF} />{t && <div className="fixed z-20 bg-black/80 border border-white/10 rounded-lg p-3 text-xs text-white" style={{ left: t.x + 12, top: t.y - 40 }}><p className="font-medium">{t.kind === 'arc' ? 'Route Segment' : t.label}</p><p className="text-white/60">{t.kind === 'city' ? 'City Marker' : t.kind === 'state' ? 'State Marker' : t.kind === 'country' ? 'Country' : t.carrier}</p>{t.kind === 'shipment' && <p className="text-white/60">${(t.cargoValueUSD / 1e6).toFixed(1)}M cargo</p>}{t.kind === 'arc' && <p className="text-white/60 capitalize">Status: {t.status}</p>}</div>}<div className="absolute bottom-4 right-4 z-10 bg-black/50 backdrop-blur-md border border-white/10 rounded-xl px-4 py-2 flex gap-4 text-xs"><span className="text-green-400">{s.filter((x) => x.status === 'active').length} active</span><span className="text-red-400">{s.filter((x) => x.status === 'delayed').length} delayed</span><span className="text-blue-400">{s.filter((x) => x.status === 'rerouted').length} rerouted</span></div><Globe ref={globeRef} onGlobeReady={() => {
    if (!globeRef.current) return;
    const renderer = globeRef.current.renderer();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const controls = globeRef.current.controls();
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.14;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    const sync = () => syncZoomAltitude();
    controls.addEventListener('change', sync);
    sync();
    controlsCleanupRef.current = () => controls.removeEventListener('change', sync);
  }} backgroundColor="#000108" backgroundImageUrl="//unpkg.com/three-globe/example/img/night-sky.png" globeImageUrl="//unpkg.com/three-globe/example/img/earth-blue-marble.jpg" bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png" atmosphereColor="#0b3b6f" atmosphereAltitude={0.2} pointsData={pts} pointLat="lat" pointLng="lng" pointColor="color" pointRadius={(p) => (p.kind === 'shipment' ? p.size : zoomAltitude < 2.3 ? 0.18 : 0)} pointAltitude={0.01} onPointHover={(p, c) => setT(p ? { ...p, x: c?.clientX || 200, y: c?.clientY || 200 } : null)} onArcHover={(arc, e) => setT(arc ? { kind: 'arc', status: arc.status, carrier: 'Route', x: e?.clientX || 200, y: e?.clientY || 200 } : null)} arcsData={arcs} arcStartLat="startLat" arcStartLng="startLng" arcEndLat="endLat" arcEndLng="endLng" arcColor="color" arcAltitude={0.15} arcStroke={(x) => (x.status === 'delayed' ? 1.2 : x.status === 'rerouted' ? 1.4 : 0.8)} arcDashLength={0.5} arcDashGap={0.15} arcDashAnimateTime={(arc) => arc.status === 'delayed' ? 1400 : arc.status === 'active' ? 3200 : 0} polygonsData={countries} polygonCapColor={(feat) => feat === hoveredCountry ? 'rgba(56,189,248,0.16)' : 'rgba(148,163,184,0.06)'} polygonSideColor={() => 'rgba(15,23,42,0.25)'} polygonStrokeColor={(feat) => feat === hoveredCountry ? 'rgba(56,189,248,0.9)' : 'rgba(148,163,184,0.25)'} polygonAltitude={(feat) => feat === hoveredCountry ? 0.012 : 0.004} onPolygonHover={(feat, e) => { setHoveredCountry(feat || null); setT(feat ? { kind: 'country', label: feat?.properties?.name || 'Unknown', x: e?.clientX || 200, y: e?.clientY || 200 } : null); }} polygonLabel={(feat) => feat?.properties?.name || ''} onPolygonClick={(feat) => { const ring = feat?.geometry?.coordinates?.[0] || feat?.geometry?.coordinates?.[0]?.[0] || []; if (!Array.isArray(ring) || !ring.length || !globeRef.current) return; const [sumLng, sumLat] = ring.reduce((acc, c) => [acc[0] + (c[0] || 0), acc[1] + (c[1] || 0)], [0, 0]); globeRef.current.pointOfView({ lat: sumLat / ring.length, lng: sumLng / ring.length, altitude: 1.8 }, 1200); }} /></div>;
}
