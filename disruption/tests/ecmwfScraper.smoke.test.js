import test from 'node:test';
import assert from 'node:assert/strict';

import { fetchEcmwfForecast } from '../tools/ecmwfScraper.js';
import { resetScraperState } from '../shared/lib/scraper.js';

test('fetchEcmwfForecast computes risk and includes hourly slices', async () => {
  resetScraperState();
  const originalFetch = globalThis.fetch;

  const payload = {
    hourly: {
      time: ['2026-04-19T00:00', '2026-04-19T01:00', '2026-04-19T02:00'],
      wave_height: [1.5, 4.8, 3.2],
      wind_speed_10m: [20, 76, 40],
      wind_direction_10m: [90, 95, 100],
    },
  };

  globalThis.fetch = async (url) => {
    assert.match(String(url), /api\.open-meteo\.com\/v1\/ecmwf/);
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  };

  try {
    const forecast = await fetchEcmwfForecast(20, 38, 7);

    assert.equal(forecast.maxWaveHeightM, 4.8);
    assert.equal(forecast.maxWindSpeedKmh, 76);
    assert.equal(forecast.routingRiskLevel, 'HIGH');
    assert.equal(forecast.isDangerousForShipping, true);
    assert.equal(forecast.hourlyData.waveHeight.length, 3);
    assert.equal(forecast.hourlyData.windDirection[0], 90);
  } finally {
    globalThis.fetch = originalFetch;
    resetScraperState();
  }
});
