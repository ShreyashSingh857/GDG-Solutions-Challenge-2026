'use client';

import { useEffect, useMemo, useState } from 'react';
import { Circle, CircleMarker, MapContainer, TileLayer, useMap } from 'react-leaflet';

function FlyToSelection({ center }) {
  const map = useMap();

  useEffect(() => {
    map.flyTo(center, Math.max(map.getZoom(), 4), { duration: 0.7 });
  }, [center, map]);

  return null;
}

export default function ReplayMap({ lat, lng, severity = 0 }) {
  const hasCoords = Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));
  const center = useMemo(() => (
    hasCoords ? [Number(lat), Number(lng)] : [18, 0]
  ), [hasCoords, lat, lng]);
  const [pulseRadius, setPulseRadius] = useState(35000);

  useEffect(() => {
    if (!hasCoords) return undefined;

    let direction = 1;
    const minRadius = 25000;
    const maxRadius = 70000;
    const interval = setInterval(() => {
      setPulseRadius((current) => {
        let next = current + direction * 5000;
        if (next >= maxRadius) {
          next = maxRadius;
          direction = -1;
        }
        if (next <= minRadius) {
          next = minRadius;
          direction = 1;
        }
        return next;
      });
    }, 180);

    return () => clearInterval(interval);
  }, [hasCoords]);

  if (!hasCoords) {
    return (
      <div className="flex h-72 items-center justify-center rounded-2xl border border-dashed border-white/15 bg-black/20 text-sm text-white/45">
        No epicenter coordinates available for this event.
      </div>
    );
  }

  const markerColor = Number(severity) >= 8 ? '#ef4444' : Number(severity) >= 6 ? '#f59e0b' : '#22d3ee';

  return (
    <div className="h-72 overflow-hidden rounded-2xl border border-white/10">
      <MapContainer
        center={center}
        zoom={4}
        scrollWheelZoom={false}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FlyToSelection center={center} />
        <Circle
          center={center}
          radius={pulseRadius}
          pathOptions={{ color: markerColor, fillColor: markerColor, fillOpacity: 0.12, weight: 1 }}
        />
        <CircleMarker
          center={center}
          radius={8}
          pathOptions={{ color: '#ffffff', fillColor: markerColor, fillOpacity: 0.95, weight: 1.5 }}
        />
      </MapContainer>
    </div>
  );
}
