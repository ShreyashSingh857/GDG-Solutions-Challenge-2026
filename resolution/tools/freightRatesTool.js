import { fetchRssFeed } from '../../shared/lib/scraper.js';

const FBX_RSS = 'https://fbx.freightos.com/rss/';

export async function fetchCurrentFreightRates() {
	try {
		const items = await fetchRssFeed(FBX_RSS, { cacheTtlMs: 6 * 60 * 60_000 });
		const rates = {};
		for (const item of items) {
			const match = item.title.match(/\$([0-9,]+)\/FEU/i);
			if (!match) continue;
			const routeKey = item.title.split(':')[0]?.trim();
			if (!routeKey) continue;
			rates[routeKey] = Number.parseInt(match[1].replace(/,/g, ''), 10);
		}
		return rates;
	} catch (err) {
		console.warn('[ResolutionService] Freight rates fetch failed:', err.message);
		return {};
	}
}

export function summarizeFreightRates(rates, maxItems = 3) {
	const entries = Object.entries(rates || {}).slice(0, maxItems);
	if (!entries.length) return null;
	return entries.map(([routeKey, value]) => `${routeKey}: $${Number(value).toLocaleString()}/FEU`).join(' | ');
}