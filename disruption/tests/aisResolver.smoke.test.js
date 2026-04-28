import test from 'node:test';
import assert from 'node:assert/strict';

import { clearVesselRegistry, resolveVesselPosition, updateVesselRegistry } from '../tools/aisResolver.js';
import { resetScraperState } from '../shared/lib/scraper.js';

test('resolveVesselPosition prefers recent live AIS data', async () => {
  clearVesselRegistry();
  updateVesselRegistry('111000111', { lat: 12.34, lng: 56.78, heading: 91 });

  const resolved = await resolveVesselPosition('111000111');
  assert.equal(resolved.source, 'aisstream-live');
  assert.equal(resolved.lat, 12.34);
  assert.equal(resolved.lng, 56.78);

  clearVesselRegistry();
});

test('resolveVesselPosition falls back to MarineTraffic then VesselFinder', async () => {
  clearVesselRegistry();
  resetScraperState();
  const originalFetch = globalThis.fetch;

  const mtHtml = `<!doctype html>
<html>
<head>
  <meta property="og:title" content="NO-COORDS | MarineTraffic" />
  <meta property="og:description" content="NO-COORDS (IMO: 1234567, MMSI: 222000222) is a BULK CARRIER underway at speed of 10.0 kn to destination JEDDAH and ETA APR 26." />
</head>
<body></body>
</html>`;

  const vfHtml = `<!doctype html>
<html>
<body>
  <h1>FALLBACK VESSEL - particulars</h1>
  <table class="tparams">
    <tr><td>Latitude</td><td>24.4667</td></tr>
    <tr><td>Longitude</td><td>54.3667</td></tr>
    <tr><td>Vessel Type</td><td>Tanker</td></tr>
  </table>
</body>
</html>`;

  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('marinetraffic.com')) {
      return new Response(mtHtml, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }
    if (u.includes('vesselfinder.com')) {
      return new Response(vfHtml, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }
    return new Response('not found', { status: 404, statusText: 'Not Found' });
  };

  try {
    const resolved = await resolveVesselPosition('222000222');
    assert.equal(resolved.source, 'vesselfinder-scrape');
    assert.equal(resolved.lat, 24.4667);
    assert.equal(resolved.lng, 54.3667);
  } finally {
    globalThis.fetch = originalFetch;
    clearVesselRegistry();
    resetScraperState();
  }
});
