import { fetchVesselDetails } from './marineTrafficScraper.js';
import { fetchVesselFromVesselFinder } from './vesselFinderScraper.js';

const vesselRegistry = new Map();

export function updateVesselRegistry(mmsi, position) {
  vesselRegistry.set(mmsi, { ...position, updatedAt: Date.now() });
}

export function clearVesselRegistry() {
  vesselRegistry.clear();
}

export async function resolveVesselPosition(mmsi) {
  const live = vesselRegistry.get(mmsi);
  if (live && (Date.now() - live.updatedAt) < 5 * 60_000) {
    return { ...live, source: 'aisstream-live' };
  }

  try {
    const mt = await fetchVesselDetails(mmsi);
    if (Number.isFinite(mt.lat) && Number.isFinite(mt.lng)) {
      return { ...mt, source: 'marinetraffic-scrape' };
    }
  } catch (err) {
    console.warn(`[AISResolver] MarineTraffic scrape failed for ${mmsi}: ${err.message}`);
  }

  try {
    const vf = await fetchVesselFromVesselFinder(mmsi);
    if (Number.isFinite(vf.lat) && Number.isFinite(vf.lng)) {
      return { ...vf, source: 'vesselfinder-scrape' };
    }
  } catch (err) {
    console.warn(`[AISResolver] VesselFinder scrape failed for ${mmsi}: ${err.message}`);
  }

  return null;
}
