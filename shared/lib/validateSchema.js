function isPlainObject(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function matchesType(value, type) {
	if (type === 'array') return Array.isArray(value);
	if (type === 'object') return isPlainObject(value);
	return typeof value === type;
}

function coerceType(value, type, fallbackValue) {
	switch (type) {
		case 'number': {
			const cast = Number(value);
			return Number.isFinite(cast) ? cast : Number(fallbackValue);
		}
		case 'string':
			return value === undefined || value === null ? String(fallbackValue ?? '') : String(value);
		case 'boolean': {
			if (typeof value === 'boolean') return value;
			if (typeof value === 'string') {
				if (value.toLowerCase() === 'true') return true;
				if (value.toLowerCase() === 'false') return false;
			}
			return Boolean(fallbackValue);
		}
		case 'array':
			return Array.isArray(value) ? value : Array.isArray(fallbackValue) ? fallbackValue : [];
		case 'object':
			return isPlainObject(value) ? value : isPlainObject(fallbackValue) ? fallbackValue : {};
		default:
			return fallbackValue;
	}
}

export function validateAndRepair(parsed, schema, fallback = {}) {
	const errors = [];
	const repaired = isPlainObject(parsed) ? { ...parsed } : {};
	const requiredSet = new Set(schema.required || []);

	for (const field of schema.required || []) {
		if (repaired[field] === undefined || repaired[field] === null || repaired[field] === '') {
			errors.push(`missing required field: ${field}`);
			repaired[field] = fallback[field];
		}
	}

	for (const [field, type] of Object.entries(schema.types || {})) {
		const value = repaired[field];
		if (!requiredSet.has(field) && (value === undefined || value === null || value === '')) {
			continue;
		}
		if (!matchesType(repaired[field], type)) {
			errors.push(`wrong type for ${field}: expected ${type}`);
			repaired[field] = coerceType(repaired[field], type, fallback[field]);
		}
	}

	for (const [field, [min, max]] of Object.entries(schema.ranges || {})) {
		const rawValue = repaired[field];
		if (!requiredSet.has(field) && (rawValue === undefined || rawValue === null || rawValue === '')) {
			continue;
		}
		const value = Number(repaired[field]);
		if (!Number.isFinite(value)) {
			errors.push(`non-numeric value for ${field}`);
			repaired[field] = Number(fallback[field]);
			continue;
		}
		if (value < min || value > max) {
			errors.push(`out of range ${field}: ${value} not in [${min}, ${max}]`);
			repaired[field] = Math.min(max, Math.max(min, value));
		}
	}

	for (const [field, enumValues] of Object.entries(schema.enums || {})) {
		const value = repaired[field];
		if (!requiredSet.has(field) && (value === undefined || value === null || value === '')) {
			continue;
		}
		if (!enumValues.includes(repaired[field])) {
			errors.push(`invalid enum for ${field}: ${repaired[field]}`);
			const fallbackValue = fallback[field];
			repaired[field] = enumValues.includes(fallbackValue) ? fallbackValue : enumValues[0];
		}
	}

	return {
		data: repaired,
		errors,
		valid: errors.length === 0,
		repairedCount: errors.length,
	};
}

export const DISRUPTION_SCHEMA = {
	required: ['type', 'severity', 'location', 'epicenterLat', 'epicenterLng', 'affectedZones', 'confidence'],
	types: {
		type: 'string',
		severity: 'number',
		location: 'string',
		epicenterLat: 'number',
		epicenterLng: 'number',
		affectedZones: 'array',
		confidence: 'number',
		unverified: 'boolean',
	},
	ranges: {
		severity: [1, 10],
		confidence: [0, 1],
		epicenterLat: [-90, 90],
		epicenterLng: [-180, 180],
	},
	enums: {
		type: ['WEATHER', 'STRIKE', 'GEOPOLITICAL', 'INFRASTRUCTURE', 'OTHER'],
	},
};

export const IMPACT_SCHEMA = {
	required: ['cascadeRisk', 'urgency', 'analysisText'],
	types: {
		cascadeRisk: 'string',
		urgency: 'number',
		analysisText: 'string',
	},
	ranges: {
		urgency: [1, 10],
	},
	enums: {
		cascadeRisk: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
	},
};

export const RESOLUTION_OPTION_SCHEMA = {
	required: ['rank', 'title', 'description', 'costDelta', 'timeDelta', 'supplierName', 'supplierId', 'confidence'],
	types: {
		rank: 'number',
		title: 'string',
		description: 'string',
		costDelta: 'number',
		timeDelta: 'number',
		supplierName: 'string',
		supplierId: 'string',
		confidence: 'number',
	},
	ranges: {
		rank: [1, 3],
		confidence: [0, 1],
	},
};

export const NEWS_ALERT_RESULT_SCHEMA = {
	required: ['sourceUrl', 'headline', 'summary', 'relevanceScore', 'disruptionType', 'severity', 'location', 'epicenterLat', 'epicenterLng', 'affectedCorridors'],
	types: {
		sourceUrl: 'string',
		headline: 'string',
		summary: 'string',
		relevanceScore: 'number',
		disruptionType: 'string',
		severity: 'number',
		location: 'string',
		epicenterLat: 'number',
		epicenterLng: 'number',
		affectedCorridors: 'array',
	},
	ranges: {
		relevanceScore: [0, 1],
		severity: [1, 10],
		epicenterLat: [-90, 90],
		epicenterLng: [-180, 180],
	},
	enums: {
		disruptionType: ['WEATHER', 'STRIKE', 'GEOPOLITICAL', 'INFRASTRUCTURE', 'OTHER'],
	},
};
