import test from 'node:test';
import assert from 'node:assert/strict';

import { fetchVesselFromVesselFinder } from '../tools/vesselFinderScraper.js';
import { resetScraperState } from '../shared/lib/scraper.js';

test('fetchVesselFromVesselFinder parses table and json-ld', async () => {
  resetScraperState();
  const originalFetch = globalThis.fetch;

  const html = `<!doctype html>
<html>
<body>
  <h1>EVERGREEN ACE - particulars</h1>
  <script type="application/ld+json">{"name":"EVERGREEN ACE"}</script>
  <table class="tparams">
    <tr><td>Flag</td><td>PA</td></tr>
    <tr><td>Vessel Type</td><td>Container Ship</td></tr>
    <tr><td>Speed</td><td>14.5</td></tr>
    <tr><td>Course</td><td>88.2</td></tr>
    <tr><td>Destination</td><td>SINGAPORE</td></tr>
    <tr><td>Draught</td><td>13.2</td></tr>
    <tr><td>Latitude</td><td>1.29027</td></tr>
    <tr><td>Longitude</td><td>103.851959</td></tr>
    <tr><td>Navigational Status</td><td>Underway</td></tr>
  </table>
</body>
</html>`;

  globalThis.fetch = async (url) => {
    assert.match(String(url), /vesselfinder\.com\/vessels\/details\/353136000/);
    return new Response(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  };

  try {
    const vessel = await fetchVesselFromVesselFinder('353136000');

    assert.equal(vessel.mmsi, '353136000');
    assert.equal(vessel.name, 'EVERGREEN ACE');
    assert.equal(vessel.flag, 'PA');
    assert.equal(vessel.type, 'Container Ship');
    assert.equal(vessel.speed, 14.5);
    assert.equal(vessel.lat, 1.29027);
    assert.equal(vessel.lng, 103.851959);
    assert.equal(vessel.source, 'VesselFinder');
  } finally {
    globalThis.fetch = originalFetch;
    resetScraperState();
  }
});
