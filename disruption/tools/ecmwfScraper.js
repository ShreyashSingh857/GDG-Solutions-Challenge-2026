import { politeFetch } from '../../shared/lib/scraper.js';

const ECMWF_POINT_API = 'https://api.open-meteo.com/v1/ecmwf';

export async function fetchEcmwfForecast(lat, lng, forecastDays = 7) {
  const url = new URL(ECMWF_POINT_API);
  url.searchParams.set('latitude', lat);
  url.searchParams.set('longitude', lng);
  url.searchParams.set('hourly', [
    'wind_speed_10m',
    'wind_direction_10m',
    'wave_height',
    'wave_period',
    'wave_direction',
  ].join(','));
  url.searchParams.set('forecast_days', String(forecastDays));
  url.searchParams.set('models', 'ecmwf_ifs025');

  const raw = await politeFetch(url.toString(), {
    minIntervalMs: 2_000,
    cacheTtlMs: 3 * 60 * 60_000,
  });

  const data = JSON.parse(raw);
  const waveHeights = data.hourly?.wave_height || [];
  const windSpeeds = data.hourly?.wind_speed_10m || [];

  const safeWaveHeights = waveHeights.filter((n) => Number.isFinite(n));
  const safeWindSpeeds = windSpeeds.filter((n) => Number.isFinite(n));
  const maxWaveHeight = safeWaveHeights.length ? Math.max(...safeWaveHeights) : 0;
  const maxWindSpeed = safeWindSpeeds.length ? Math.max(...safeWindSpeeds) : 0;

  const peakWaveIdx = waveHeights.indexOf(maxWaveHeight);
  const peakWaveTime = peakWaveIdx >= 0 ? data.hourly?.time?.[peakWaveIdx] : null;

  const routingRiskLevel =
    maxWaveHeight > 8 ? 'EXTREME'
    : maxWaveHeight > 6 ? 'SEVERE'
    : maxWaveHeight > 4 ? 'HIGH'
    : maxWaveHeight > 2 ? 'MODERATE'
    : 'LOW';

  return {
    coordinates: { lat, lng },
    forecastDays,
    maxWaveHeightM: maxWaveHeight,
    maxWindSpeedKmh: maxWindSpeed,
    peakConditionsAt: peakWaveTime,
    routingRiskLevel,
    isDangerousForShipping: maxWaveHeight > 4 || maxWindSpeed > 70,
    model: 'ECMWF IFS 0.25 deg (via Open-Meteo proxy)',
    hourlyData: {
      time: (data.hourly?.time || []).slice(0, 168),
      waveHeight: waveHeights.slice(0, 168),
      windSpeed: windSpeeds.slice(0, 168),
      windDirection: (data.hourly?.wind_direction_10m || []).slice(0, 168),
    },
    fetchedAt: new Date().toISOString(),
  };
}

export async function assessCorridorWeatherRisk() {
  const corridors = [
    { name: 'Pacific Typhoon Belt', lat: 15.0, lng: 135.0 },
    { name: 'Red Sea / Suez', lat: 20.0, lng: 38.0 },
    { name: 'Cape of Good Hope', lat: -34.0, lng: 18.0 },
    { name: 'Bay of Biscay', lat: 46.0, lng: -5.0 },
    { name: 'Malacca Strait', lat: 3.0, lng: 101.0 },
    { name: 'Panama Approaches', lat: 8.0, lng: -79.0 },
    { name: 'North Atlantic', lat: 45.0, lng: -30.0 },
  ];

  const results = await Promise.allSettled(
    corridors.map((c) => fetchEcmwfForecast(c.lat, c.lng, 7).then((f) => ({ corridor: c.name, ...f })))
  );

  return results
    .filter((r) => r.status === 'fulfilled')
    .map((r) => r.value)
    .sort((a, b) => b.maxWaveHeightM - a.maxWaveHeightM);
}