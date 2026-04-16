import { v4 as uuidv4 } from 'uuid';

export function createNewsAlert(fields = {}) {
  return {
    id: `news-${uuidv4()}`,
    sourceUrl: '',
    headline: '',
    summary: '',
    source: 'Unknown',
    publishedAt: new Date().toISOString(),
    detectedAt: new Date().toISOString(),
    relevanceScore: 0,
    disruptionType: 'OTHER',
    severity: 5,
    location: 'Unknown',
    epicenterLat: 0,
    epicenterLng: 0,
    affectedCorridors: [],
    apiSource: 'gdelt',
    injected: false,
    ...fields,
  };
}

export function validateNewsAlert(obj) {
  const required = ['id', 'sourceUrl', 'headline', 'relevanceScore', 'disruptionType', 'severity', 'location', 'epicenterLat', 'epicenterLng'];

  for (const field of required) {
    if (obj[field] === undefined || obj[field] === null) {
      throw new Error(`NewsAlert missing required field: ${field}`);
    }
  }

  if (obj.relevanceScore < 0 || obj.relevanceScore > 1) {
    throw new Error('relevanceScore must be 0..1');
  }

  if (obj.severity < 1 || obj.severity > 10) {
    throw new Error('severity must be 1..10');
  }

  const validTypes = ['WEATHER', 'STRIKE', 'GEOPOLITICAL', 'INFRASTRUCTURE', 'OTHER'];
  if (!validTypes.includes(obj.disruptionType)) {
    throw new Error(`disruptionType must be one of: ${validTypes.join(', ')}`);
  }

  return obj;
}