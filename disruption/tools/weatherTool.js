export const weatherToolDeclaration = { name: 'get_weather_data', description: 'Fetch current weather conditions at a geographic location.', parameters: { type: 'object', properties: { latitude: { type: 'number' }, longitude: { type: 'number' } }, required: ['latitude', 'longitude'] } };

export async function getWeatherData({ latitude, longitude }) {
	try {
		const url = new URL('https://api.open-meteo.com/v1/forecast');
		url.searchParams.set('latitude', latitude);
		url.searchParams.set('longitude', longitude);
		url.searchParams.set('current', 'windspeed_10m,precipitation,weathercode,winddirection_10m');
		url.searchParams.set('forecast_days', '1');
		const res = await fetch(url.toString());
		if (!res.ok) throw new Error(`Open-Meteo API returned ${res.status}`);
		const data = await res.json();
		return { windspeed: data.current.windspeed_10m, winddirection: data.current.winddirection_10m, precipitation: data.current.precipitation, weatherCode: data.current.weathercode, coordinates: { latitude, longitude }, unit: data.current_units };
	} catch (err) {
		console.error('[WeatherTool] Failed to fetch weather data:', err.message);
		return { windspeed: null, precipitation: null, weatherCode: null, coordinates: { latitude, longitude }, error: err.message };
	}
}
