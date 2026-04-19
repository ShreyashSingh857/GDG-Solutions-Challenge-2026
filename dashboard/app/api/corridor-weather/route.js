import { NextResponse } from 'next/server';

const CORRIDORS = [
  { name: 'Pacific', lat: 15.0, lng: 135.0, fromLat: 35.18, fromLng: 129.07, toLat: 34.05, toLng: -118.24 },
  { name: 'Red Sea', lat: 20.0, lng: 38.0, fromLat: 1.35, fromLng: 103.82, toLat: 51.92, toLng: 4.48 },
  { name: 'Cape of Hope', lat: -34.0, lng: 18.0, fromLat: 25.2, fromLng: 55.27, toLat: 51.92, toLng: 4.48 },
  { name: 'Malacca', lat: 3.0, lng: 101.0, fromLat: 31.23, fromLng: 121.47, toLat: 1.35, toLng: 103.82 },
  { name: 'North Atlantic', lat: 45.0, lng: -30.0, fromLat: 53.55, fromLng: 9.99, toLat: 40.71, toLng: -74.01 },
];

export async function GET() {
  const results = await Promise.allSettled(
    CORRIDORS.map(async (corridor) => {
      const url = new URL('https://api.open-meteo.com/v1/ecmwf');
      url.searchParams.set('latitude', corridor.lat);
      url.searchParams.set('longitude', corridor.lng);
      url.searchParams.set('hourly', 'wave_height,wind_speed_10m');
      url.searchParams.set('forecast_days', '3');
      url.searchParams.set('models', 'ecmwf_ifs025');

      try {
        const response = await fetch(url.toString(), {
          signal: AbortSignal.timeout(8000),
          next: { revalidate: 10800 },
        });

        if (!response.ok) {
          return { ...corridor, riskLevel: 'UNKNOWN', maxWaveHeight: 0, maxWindSpeed: 0 };
        }

        const data = await response.json();
        const waves = (data.hourly?.wave_height || []).filter(Number.isFinite);
        const winds = (data.hourly?.wind_speed_10m || []).filter(Number.isFinite);
        const maxWave = waves.length ? Math.max(...waves) : 0;
        const maxWind = winds.length ? Math.max(...winds) : 0;

        return {
          ...corridor,
          maxWaveHeight: Number(maxWave.toFixed(1)),
          maxWindSpeed: Number(maxWind.toFixed(0)),
          riskLevel: maxWave > 6 ? 'SEVERE' : maxWave > 4 ? 'HIGH' : maxWave > 2 ? 'MODERATE' : 'LOW',
        };
      } catch {
        return { ...corridor, riskLevel: 'UNKNOWN', maxWaveHeight: 0, maxWindSpeed: 0 };
      }
    })
  );

  return NextResponse.json({
    data: results
      .filter((result) => result.status === 'fulfilled')
      .map((result) => result.value),
  });
}
