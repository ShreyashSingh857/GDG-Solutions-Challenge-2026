import { v4 as uuidv4 } from 'uuid';

export function createDisruptionEvent(fields) {
	return { id: `disruption-${uuidv4()}`, detectedAt: new Date().toISOString(), affectedZones: [], confidence: 0, ...fields };
}

export function validateDisruptionEvent(obj) {
	const required = ['id', 'type', 'severity', 'location', 'epicenterLat', 'epicenterLng', 'confidence', 'rawDescription', 'detectedAt'];
	for (const field of required) if (obj[field] === undefined || obj[field] === null) throw new Error(`DisruptionEvent missing required field: ${field}`);
	if (obj.severity < 1 || obj.severity > 10) throw new Error('severity must be 1-10');
	if (obj.confidence < 0 || obj.confidence > 1) throw new Error('confidence must be 0-1');
	const validTypes = ['WEATHER', 'STRIKE', 'GEOPOLITICAL', 'INFRASTRUCTURE', 'OTHER'];
	if (!validTypes.includes(obj.type)) throw new Error(`type must be one of: ${validTypes.join(', ')}`);
	return obj;
}
