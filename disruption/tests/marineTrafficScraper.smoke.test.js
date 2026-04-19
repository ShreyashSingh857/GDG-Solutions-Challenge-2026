import test from 'node:test';
import assert from 'node:assert/strict';

import { fetchVesselDetails, fetchVesselsInPort } from '../tools/marineTrafficScraper.js';
import { resetScraperState } from '../../shared/lib/scraper.js';

test('fetchVesselDetails parses public vessel metadata', async () => {
  resetScraperState();
  const originalFetch = globalThis.fetch;

  const vesselHtml = `<!doctype html>
<html>
<head>
  <meta property="og:title" content="EVER GIVEN | MarineTraffic" />
  <meta property="og:description" content="EVER GIVEN (IMO: 9811000, MMSI: 353136000) is a CONTAINER SHIP, currently underway at speed of 13.4 kn to destination SINGAPORE and ETA APR 25." />
  <script type="application/ld+json">{"name":"EVER GIVEN"}</script>
</head>
<body>
  <script>window.__data={"latitude":30.0444,"longitude":31.2357}</script>
</body>
</html>`;

  globalThis.fetch = async (url) => {
    assert.match(String(url), /marinetraffic\.com\/en\/ais\/details\/ships\/mmsi:353136000/);
    return new Response(vesselHtml, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  };

  try {
    const vessel = await fetchVesselDetails('353136000');

    assert.equal(vessel.mmsi, '353136000');
    assert.equal(vessel.imo, '9811000');
    assert.equal(vessel.name, 'EVER GIVEN');
    assert.equal(vessel.type, 'CONTAINER SHIP');
    assert.equal(vessel.speed, 13.4);
    assert.equal(vessel.destination, 'SINGAPORE');
    assert.equal(vessel.navStatus, 'underway');
    assert.equal(vessel.lat, 30.0444);
    assert.equal(vessel.lng, 31.2357);
  } finally {
    globalThis.fetch = originalFetch;
    resetScraperState();
  }
});

test('fetchVesselsInPort parses vessel table rows', async () => {
  resetScraperState();
  const originalFetch = globalThis.fetch;

  const portHtml = `<!doctype html>
<html>
<body>
  <table class="vessels-table">
    <tr><th>Name</th><th>Flag</th><th>Type</th><th>Arrival</th></tr>
    <tr><td>Vessel A</td><td>SG</td><td>Container</td><td>2026-04-19 10:00</td></tr>
    <tr><td>Vessel B</td><td>PA</td><td>Tanker</td><td>2026-04-19 11:00</td></tr>
  </table>
</body>
</html>`;

  globalThis.fetch = async (url) => {
    assert.match(String(url), /term:Singapore/);
    return new Response(portHtml, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  };

  try {
    const data = await fetchVesselsInPort('Singapore');

    assert.equal(data.portName, 'Singapore');
    assert.equal(data.vesselCount, 2);
    assert.equal(data.vessels[0].name, 'Vessel A');
    assert.equal(data.vessels[1].type, 'Tanker');
  } finally {
    globalThis.fetch = originalFetch;
    resetScraperState();
  }
});
