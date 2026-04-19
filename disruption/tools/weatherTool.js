export const weatherToolDeclaration = {
	name: 'get_weather_data',
	description: 'Fetch current weather and marine conditions at a geographic location.',
	parameters: {
		type: 'object',
		properties: { latitude: { type: 'number' }, longitude: { type: 'number' } },
		required: ['latitude', 'longitude']
	}
};

export async function getWeatherData({ latitude, longitude }) {
	try {
		const marineUrl = new URL('https://marine-api.open-meteo.com/v1/marine');
		marineUrl.searchParams.set('latitude', latitude);
		marineUrl.searchParams.set('longitude', longitude);
		marineUrl.searchParams.set('hourly', 'wave_height,swell_wave_height,ocean_current_velocity');
		marineUrl.searchParams.set('current', 'wave_height,swell_wave_height');
		marineUrl.searchParams.set('forecast_days', '3');

		const atmUrl = new URL('https://api.open-meteo.com/v1/forecast');
		atmUrl.searchParams.set('latitude', latitude);
		atmUrl.searchParams.set('longitude', longitude);
		atmUrl.searchParams.set('current', 'windspeed_10m,winddirection_10m,precipitation,weathercode');
		atmUrl.searchParams.set('forecast_days', '1');

		const [marineRes, atmRes] = await Promise.all([
			fetch(marineUrl.toString(), { signal: AbortSignal.timeout(10000) }),
			fetch(atmUrl.toString(), { signal: AbortSignal.timeout(10000) }),
		]);
		if (!marineRes.ok || !atmRes.ok) throw new Error(`Open-Meteo API returned ${marineRes.status}/${atmRes.status}`);

		const marine = await marineRes.json();
		const atm = await atmRes.json();
		const waves = marine?.hourly?.wave_height?.slice(0, 72) || [];
		const maxWaveHeight72h = waves.length ? Math.max(...waves) : null;
		const isDangerousForShipping = (Number(atm?.current?.windspeed_10m || 0) > 89) || (Number(maxWaveHeight72h || 0) > 6);

		return {
			windspeed: atm?.current?.windspeed_10m ?? null,
			winddirection: atm?.current?.winddirection_10m ?? null,
			precipitation: atm?.current?.precipitation ?? null,
			weatherCode: atm?.current?.weathercode ?? null,
			currentWaveHeight: marine?.current?.wave_height ?? null,
			currentSwell: marine?.current?.swell_wave_height ?? null,
			maxWaveHeight72h,
			isDangerousForShipping,
			coordinates: { latitude, longitude },
		};
	} catch (err) {
		console.error('[WeatherTool] Failed to fetch weather data:', err.message);
		return { windspeed: null, precipitation: null, weatherCode: null, currentWaveHeight: null, maxWaveHeight72h: null, isDangerousForShipping: false, coordinates: { latitude, longitude }, error: err.message };
	}
}
