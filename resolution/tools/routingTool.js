const STATIC_ROUTES = {
	pacific_storm: {
		balanced: {
			title: 'Northern Arc via Aleutian Islands',
			coordinates: [[121.5, 31.2], [140, 38], [155, 50], [170, 54], [-170, 55], [-155, 52], [-135, 47], [-118.2, 33.7]],
			distanceKm: 11800,
			mode: 'sea-freight',
			timeDeltaHours: 36,
		},
		fastest: {
			title: 'Air Freight via Anchorage Hub',
			coordinates: [[121.5, 31.2], [149.9, 61.2], [-118.4, 33.9]],
			distanceKm: 9800,
			mode: 'air-freight',
			timeDeltaHours: -48,
		},
		cheapest: {
			title: 'Wait and Southern Pacific Deviation',
			coordinates: [[121.5, 31.2], [130, 25], [140, 18], [-130, 20], [-118.2, 33.7]],
			distanceKm: 12500,
			mode: 'sea-freight',
			timeDeltaHours: 72,
		},
	},
	atlantic_storm: {
		balanced: {
			title: 'North Atlantic Diversion via Azores',
			coordinates: [[-95.2, 29.7], [-82, 28], [-66, 31], [-45, 36], [-28.2, 38.7], [-9.1, 38.7], [2.3, 51.3]],
			distanceKm: 9700,
			mode: 'sea-freight',
			timeDeltaHours: 30,
		},
		fastest: {
			title: 'Air Bridge via Reykjavik',
			coordinates: [[-95.3, 29.8], [-22.6, 63.9], [2.3, 51.3]],
			distanceKm: 8600,
			mode: 'air-freight',
			timeDeltaHours: -36,
		},
		cheapest: {
			title: 'Hold and Resume Gulf Departure',
			coordinates: [[-95.2, 29.7], [-90, 27], [-80, 24], [-62, 27], [-30, 38], [2.3, 51.3]],
			distanceKm: 10150,
			mode: 'sea-freight',
			timeDeltaHours: 60,
		},
	},
	port_strike: {
		balanced: {
			title: 'Reroute to Nhava Sheva (JNPT)',
			coordinates: [[72.8, 18.9], [57, 22], [45, 12], [32, 28], [32.3, 30.1]],
			distanceKm: 3200,
			mode: 'sea-freight',
			timeDeltaHours: 18,
		},
		fastest: {
			title: 'Air Freight via Mumbai Airport',
			coordinates: [[72.8, 19.1], [55.4, 25.2], [2.5, 49], [-73.8, 40.6]],
			distanceKm: 12000,
			mode: 'air-freight',
			timeDeltaHours: -72,
		},
		cheapest: {
			title: 'Pipavav Port Alternative',
			coordinates: [[72.4, 20.9], [60, 22], [45, 12]],
			distanceKm: 2800,
			mode: 'sea-freight',
			timeDeltaHours: 24,
		},
	},
	europe_port_strike: {
		balanced: {
			title: 'Divert to Le Havre and Rail Feeder',
			coordinates: [[4.5, 51.9], [2.4, 49.5], [2.3, 51.3]],
			distanceKm: 720,
			mode: 'multimodal',
			timeDeltaHours: 16,
		},
		fastest: {
			title: 'Urgent Air Uplift via Paris CDG',
			coordinates: [[4.5, 51.9], [2.55, 49.01], [8.6, 50.03]],
			distanceKm: 610,
			mode: 'air-freight',
			timeDeltaHours: -20,
		},
		cheapest: {
			title: 'Shift to Antwerp Feeder Network',
			coordinates: [[4.5, 51.9], [4.3, 51.3], [8.2, 53.5]],
			distanceKm: 860,
			mode: 'sea-freight',
			timeDeltaHours: 28,
		},
	},
	us_west_port_strike: {
		balanced: {
			title: 'Divert to Oakland and Inland Rail',
			coordinates: [[-118.3, 33.7], [-122.3, 37.8], [-104.99, 39.74], [-95.36, 29.76]],
			distanceKm: 4100,
			mode: 'multimodal',
			timeDeltaHours: 22,
		},
		fastest: {
			title: 'Air Cargo Lift via Ontario',
			coordinates: [[-118.2, 34.1], [-117.6, 34.06], [-87.9, 41.97], [-74.17, 40.69]],
			distanceKm: 4200,
			mode: 'air-freight',
			timeDeltaHours: -26,
		},
		cheapest: {
			title: 'Slow Steaming to Tacoma',
			coordinates: [[-118.3, 33.7], [-124, 40], [-122.4, 47.6]],
			distanceKm: 2050,
			mode: 'sea-freight',
			timeDeltaHours: 42,
		},
	},
	suez_closure: {
		balanced: {
			title: 'Cape of Good Hope Reroute',
			coordinates: [[103.8, 1.3], [80, -5], [60, -20], [20, -35], [18.4, -33.9], [0, -20], [-10, 5], [-8, 38], [4.9, 52.4]],
			distanceKm: 21000,
			mode: 'sea-freight',
			timeDeltaHours: 168,
		},
		fastest: {
			title: 'Air Freight - Critical Cargo Only',
			coordinates: [[103.9, 1.4], [55.4, 25.2], [4.8, 52.3]],
			distanceKm: 10500,
			mode: 'air-freight',
			timeDeltaHours: -48,
		},
		cheapest: {
			title: 'Extended Cape Route with Slow Steaming',
			coordinates: [[103.8, 1.3], [75, -10], [35, -30], [18.4, -33.9], [4.9, 52.4]],
			distanceKm: 22500,
			mode: 'sea-freight',
			timeDeltaHours: 240,
		},
	},
	panama_closure: {
		balanced: {
			title: 'Intermodal Bridge via Mexico',
			coordinates: [[-79.9, 9.3], [-96.14, 19.2], [-106.4, 23.2], [-118.25, 34.05]],
			distanceKm: 5900,
			mode: 'multimodal',
			timeDeltaHours: 34,
		},
		fastest: {
			title: 'Air Lift via Panama City Hub',
			coordinates: [[-79.9, 9.3], [-79.38, 9.07], [-95.34, 29.98], [-118.4, 33.9]],
			distanceKm: 5600,
			mode: 'air-freight',
			timeDeltaHours: -30,
		},
		cheapest: {
			title: 'Cape Horn Long Route',
			coordinates: [[-79.9, 9.3], [-77, -5], [-75, -20], [-71, -45], [-68, -55], [-75, -45], [-90, -10], [-118.3, 33.7]],
			distanceKm: 15600,
			mode: 'sea-freight',
			timeDeltaHours: 210,
		},
	},
	malacca_disruption: {
		balanced: {
			title: 'Lombok Strait Diversion',
			coordinates: [[103.8, 1.3], [106, -1], [115.8, -8.5], [121, -3], [130, 8], [139.7, 35.6]],
			distanceKm: 7600,
			mode: 'sea-freight',
			timeDeltaHours: 42,
		},
		fastest: {
			title: 'Air Consolidation via Singapore and Narita',
			coordinates: [[103.9, 1.35], [103.99, 1.36], [140.39, 35.77]],
			distanceKm: 5350,
			mode: 'air-freight',
			timeDeltaHours: -24,
		},
		cheapest: {
			title: 'Makassar Strait Slow Route',
			coordinates: [[103.8, 1.3], [108, -3], [119, -4], [126, 2], [136, 20], [139.7, 35.6]],
			distanceKm: 8450,
			mode: 'sea-freight',
			timeDeltaHours: 60,
		},
	},
	geopolitical: {
		balanced: {
			title: 'Neutral Corridor Diversification',
			coordinates: [[55.3, 25.2], [63, 21], [70, 13], [78, 8], [88.3, 22.6]],
			distanceKm: 4800,
			mode: 'sea-freight',
			timeDeltaHours: 26,
		},
		fastest: {
			title: 'Controlled Air Bridge',
			coordinates: [[55.3, 25.2], [72.9, 19.1], [88.4, 22.7]],
			distanceKm: 2500,
			mode: 'air-freight',
			timeDeltaHours: -18,
		},
		cheapest: {
			title: 'Insurance-Optimized Maritime Detour',
			coordinates: [[55.3, 25.2], [58, 18], [66, 12], [75, 8], [88.3, 22.6]],
			distanceKm: 5200,
			mode: 'sea-freight',
			timeDeltaHours: 38,
		},
	},
};

export function getRoutesForScenario(scenarioKey) {
	return STATIC_ROUTES[scenarioKey] || STATIC_ROUTES.pacific_storm;
}

export function detectScenario(disruption) {
	const text = [
		disruption?.location,
		...(disruption?.affectedZones || []),
		disruption?.type,
	]
		.join(' ')
		.toLowerCase();

	// Order matters: most specific first.
	if (/suez|red sea|aden|bab.el.mandeb|houthi/.test(text)) return 'suez_closure';
	if (/panama/.test(text)) return 'panama_closure';
	if (/malacca|strait of malacca|singapore strait/.test(text)) return 'malacca_disruption';
	if (/strike|labor|lockout|union/.test(text)) {
		if (/rotterdam|hamburg|antwerp|europe/.test(text)) return 'europe_port_strike';
		if (/los angeles|long beach|west coast/.test(text)) return 'us_west_port_strike';
		return 'port_strike';
	}
	if (/typhoon|hurricane|cyclone|tropical storm|\bweather\b/.test(text)) {
		if (/atlantic|gulf|caribbean/.test(text)) return 'atlantic_storm';
		return 'pacific_storm';
	}
	if (/sanctions|embargo|geopolit/.test(text)) return 'geopolitical';
	return 'pacific_storm';
}

export function toGeoJSON(route) {
	return {
		type: 'Feature',
		geometry: { type: 'LineString', coordinates: route.coordinates },
		properties: {
			mode: route.mode,
			distanceKm: route.distanceKm,
			timeDeltaHours: route.timeDeltaHours,
		},
	};
}
