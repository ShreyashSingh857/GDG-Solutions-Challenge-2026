'use client';

import { useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useShipmentStore } from '../../store/shipmentStore.js';
import { useAlertStore } from '../../store/alertStore.js';
import { useGlobeCamera } from './useGlobeCamera.js';
import GlobeControls from './GlobeControls.jsx';

const Globe = dynamic(() => import('react-globe.gl'), { ssr: false });
const C = { active: '#22c55e', delayed: '#ef4444', rerouted: '#3b82f6', disrupted: '#f97316' };
const circle = (lat, lng, r) => ({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [[...Array(33)].map((_, i) => [lng + r * Math.cos(i / 16 * Math.PI), lat + r * Math.sin(i / 16 * Math.PI)])] } });

export default function GlobeView() {
  const globeRef = useRef(); const [f, setF] = useState('all'); const [t, setT] = useState(null);
  const s = useShipmentStore((x) => x.shipments); const d = useAlertStore((x) => x.disruptions);
  useGlobeCamera(globeRef);
  const ss = useMemo(() => (f === 'all' ? s : s.filter((x) => x.status === f)), [s, f]);
  const pts = useMemo(() => ss.map((x) => ({ id: x.id, lat: x.currentLat, lng: x.currentLng, color: C[x.status] || C.active, size: x.status === 'delayed' ? 0.6 : 0.4, label: `${x.origin} → ${x.destination}`, carrier: x.carrier, cargoValueUSD: x.cargoValueUSD, status: x.status })), [ss]);
  const arcs = useMemo(() => ss.map((x) => ({ startLat: x.originLat, startLng: x.originLng, endLat: x.destLat, endLng: x.destLng, color: C[x.status] || C.active, status: x.status })), [ss]);
  const polys = useMemo(() => d.slice(0, 3).filter((x) => typeof x.epicenterLat === 'number').map((x) => ({ ...circle(x.epicenterLat, x.epicenterLng, Math.max(2, x.severity * 0.8)), id: x.id })), [d]);
  return <div className="relative w-full h-full bg-[#020617]"><GlobeControls onFilterChange={setF} />{t && <div className="absolute z-20 bg-black/80 border border-white/10 rounded-lg p-3 text-xs text-white" style={{ left: t.x + 12, top: t.y - 40 }}><p className="font-medium">{t.label}</p><p className="text-white/60">{t.carrier}</p><p className="text-white/60">${(t.cargoValueUSD / 1e6).toFixed(1)}M cargo</p></div>}<div className="absolute bottom-4 right-4 z-10 bg-black/50 backdrop-blur-md border border-white/10 rounded-xl px-4 py-2 flex gap-4 text-xs"><span className="text-green-400">{s.filter((x) => x.status === 'active').length} active</span><span className="text-red-400">{s.filter((x) => x.status === 'delayed').length} delayed</span><span className="text-blue-400">{s.filter((x) => x.status === 'rerouted').length} rerouted</span></div><Globe ref={globeRef} backgroundColor="#020617" globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg" atmosphereColor="#1e3a5f" atmosphereAltitude={0.15} pointsData={pts} pointLat="lat" pointLng="lng" pointColor="color" pointRadius="size" pointAltitude={0.01} onPointHover={(p, c) => setT(p ? { ...p, x: c?.x || 200, y: c?.y || 200 } : null)} arcsData={arcs} arcStartLat="startLat" arcStartLng="startLng" arcEndLat="endLat" arcEndLng="endLng" arcColor="color" arcAltitude={0.15} arcStroke={(x) => (x.status === 'delayed' ? 2.5 : x.status === 'rerouted' ? 3 : 1.5)} arcDashLength={0.4} arcDashGap={0.1} arcDashAnimateTime={2000} polygonsData={polys} polygonCapColor={() => 'rgba(239,68,68,.15)'} polygonSideColor={() => 'rgba(239,68,68,.05)'} polygonStrokeColor={() => 'rgba(239,68,68,.6)'} polygonAltitude={0.005} /></div>;
}
