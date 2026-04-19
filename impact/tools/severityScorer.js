import { getTradeWeight } from './tradeFlowWeighter.js';

function haversineDistanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371; const dLat = ((lat2 - lat1) * Math.PI) / 180; const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}
export function scoreShipments(disruption, shipments, topN = 20) {
  const MAX_RANGE_KM = 2000, MAX_CARGO_VALUE = 10000000;
  return shipments.map((shipment) => {
    const distanceKm = haversineDistanceKm(disruption.epicenterLat, disruption.epicenterLng, shipment.currentLat, shipment.currentLng);
    if (distanceKm > MAX_RANGE_KM) return null;
    const proximitFactor = 1 - distanceKm / MAX_RANGE_KM, severityFactor = disruption.severity / 10, cargoFactor = Math.min(shipment.cargoValueUSD / MAX_CARGO_VALUE, 1);
    const impactScore = Math.min(proximitFactor * severityFactor * cargoFactor + (proximitFactor * severityFactor * 0.3), 1);
    return { id: shipment.id, origin: shipment.origin, destination: shipment.destination, carrier: shipment.carrier, cargoValueUSD: shipment.cargoValueUSD, corridor: shipment.corridor, currentLat: shipment.currentLat, currentLng: shipment.currentLng, eta: shipment.eta, distanceKm: Math.round(distanceKm), impactScore: +impactScore.toFixed(4) };
  }).filter(Boolean).sort((a, b) => b.impactScore - a.impactScore).slice(0, topN);
}

export async function scoreShipmentsWithTradeWeight(disruption, shipments, topN = 20) {
  const base = scoreShipments(disruption, shipments, topN);
  const top = base.slice(0, 10);
  const weighted = await Promise.all(top.map(async (s) => {
    const { weight } = await getTradeWeight(s.origin, s.destination);
    const adjusted = Math.min(1, +(s.impactScore * weight).toFixed(4));
    return { ...s, impactScore: adjusted, tradeWeight: weight };
  }));
  return [...weighted, ...base.slice(10)].sort((a, b) => b.impactScore - a.impactScore);
}
