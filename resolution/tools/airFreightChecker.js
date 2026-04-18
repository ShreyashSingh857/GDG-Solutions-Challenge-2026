const OPENSKY_BASE = 'https://opensky-network.org/api';

export async function checkAirFreightAvailability(lat, lng, radiusDeg = 2) {
  const url = new URL(`${OPENSKY_BASE}/states/all`);
  url.searchParams.set('lamin', lat - radiusDeg);
  url.searchParams.set('lamax', lat + radiusDeg);
  url.searchParams.set('lomin', lng - radiusDeg);
  url.searchParams.set('lomax', lng + radiusDeg);
  try {
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return { available: true, aircraftCount: 0, note: 'OpenSky unavailable' };
    const data = await res.json();
    const states = Array.isArray(data?.states) ? data.states : [];
    const freighters = states.filter((s) => !s[8] && Number(s[9] || 0) > 100);
    return {
      available: freighters.length > 0,
      aircraftCount: freighters.length,
      totalAircraft: states.length,
      note: `${freighters.length} large aircraft active near this airport`,
    };
  } catch {
    return { available: true, aircraftCount: 0, note: 'OpenSky error' };
  }
}
