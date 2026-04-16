import {
  ArcType,
  CallbackProperty,
  Color,
  PolylineArrowMaterialProperty,
  PolylineDashMaterialProperty,
  PolylineGlowMaterialProperty,
} from 'cesium';

const COLORS = { active: '#22c55e', delayed: '#ef4444', rerouted: '#60a5fa', disrupted: '#f97316' };
const SPEED = { delayed: 0.004, rerouted: 0.012, active: 0.008, disrupted: 0.006 };

function toNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function pickWaypoints(raw) {
  if (Array.isArray(raw?.waypoints)) {
    return raw.waypoints
      .map((w) => ({ lat: toNum(w.lat, NaN), lng: toNum(w.lng, NaN) }))
      .filter((w) => Number.isFinite(w.lat) && Number.isFinite(w.lng));
  }
  const g = raw?.rerouteGeoJSON || raw?.route || raw?.reroutedRoute || raw?.geojson;
  const c = g?.geometry?.coordinates || g?.features?.[0]?.geometry?.coordinates;
  if (!Array.isArray(c)) return [];
  return c.map(([lng, lat]) => ({ lat: toNum(lat, NaN), lng: toNum(lng, NaN) })).filter((w) => Number.isFinite(w.lat) && Number.isFinite(w.lng));
}

export function normalizeRoute(raw) {
  const origin = { name: raw.origin || raw.originName || 'Origin', lat: toNum(raw.originLat, NaN), lng: toNum(raw.originLng, NaN) };
  const destination = { name: raw.destination || raw.destinationName || 'Destination', lat: toNum(raw.destLat, NaN), lng: toNum(raw.destLng, NaN) };
  const currentLat = toNum(raw.currentLat, origin.lat);
  const currentLng = toNum(raw.currentLng, origin.lng);
  const status = ['active', 'delayed', 'rerouted', 'disrupted'].includes(raw.status) ? raw.status : 'active';
  return {
    id: raw.id || raw.traceId || '',
    origin,
    destination,
    current: { lat: currentLat, lng: currentLng },
    status,
    volumeUSD: toNum(raw.volumeUSD ?? raw.totalCargoAtRiskUSD ?? raw.cargoValueUSD, 0),
    corridor: raw.corridor || 'unknown',
    waypoints: pickWaypoints(raw),
    meta: {
      carrier: raw.carrier || raw.supplierName || 'unknown',
      eta: raw.eta || '',
      disruptionId: raw.disruptionId || null,
    },
  };
}

export function validateRoute(route) {
  if (!route.id) return console.warn('[tradeRoutePipeline] invalid route: missing id', route), false;
  const { origin, destination } = route;
  if (![origin.lat, origin.lng, destination.lat, destination.lng].every(Number.isFinite)) {
    return console.warn('[tradeRoutePipeline] invalid route: non-finite coordinates', route), false;
  }
  if (Math.abs(origin.lat) > 90 || Math.abs(origin.lng) > 180) {
    return console.warn('[tradeRoutePipeline] invalid route: origin out of range', route), false;
  }
  return true;
}

export function ingestRoutes(shipments = []) {
  return shipments.map(normalizeRoute).filter(validateRoute);
}

export function encodeRouteVisual(route) {
  const t = Math.min(1, Math.max(0, Math.log1p(Math.max(0, route.volumeUSD)) / Math.log1p(1e8)));
  const coreWidth = 1.5 + t * 2.0;
  return {
    color: COLORS[route.status] || COLORS.active,
    coreWidth,
    glowWidth: coreWidth * 4,
    glowPower: 0.2 + t * 0.3,
    animSpeed: SPEED[route.status] || SPEED.active,
    peakAltFactor: 0.45 + t * 0.2,
  };
}

export function buildCesiumEntities(ds, positions, visual, routeId) {
  const base = Color.fromCssColorString(visual.color);
  const glowEntity = ds.entities.add({
    id: `${routeId}-glow`,
    polyline: {
      positions,
      width: visual.glowWidth,
      material: new PolylineGlowMaterialProperty({ glowPower: visual.glowPower, taperPower: 0.9, color: base.withAlpha(0.35) }),
      arcType: ArcType.NONE,
      clampToGround: false,
    },
  });

  let offset = 0;
  const coreMat = new CallbackProperty(() => {
    offset = (offset + visual.animSpeed) % 1.0;
    return new PolylineDashMaterialProperty({ color: base.withAlpha(0.9), gapColor: Color.TRANSPARENT, dashLength: 40, dashOffset: offset });
  }, false);

  const coreEntity = ds.entities.add({
    id: `${routeId}-core`,
    polyline: { positions, width: visual.coreWidth, material: coreMat, arcType: ArcType.NONE, clampToGround: false },
  });

  const tail = positions.slice(Math.max(0, positions.length - 3));
  const arrowEntity = ds.entities.add({
    id: `${routeId}-arrow`,
    polyline: {
      positions: tail.length >= 2 ? tail : positions,
      width: visual.coreWidth * 5,
      material: new PolylineArrowMaterialProperty(base.withAlpha(0.85)),
      arcType: ArcType.NONE,
      clampToGround: false,
    },
  });

  return { glowEntity, coreEntity, arrowEntity };
}
