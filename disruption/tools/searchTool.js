export const searchToolDeclaration = { name: 'search_web', description: 'Search the web for current news and information about a disruption event.', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } };

export async function searchWeb({ query }) {
	try {
		const params = new URLSearchParams({
			query,
			mode: 'artlist',
			format: 'json',
			maxrecords: '5',
			sort: 'DateDesc',
		});
		let data = await fetchGdelt(params);
		if (!data) {
			const safeQuery = String(query || '').replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
			if (safeQuery && safeQuery !== query) {
				const fallback = new URLSearchParams({ query: safeQuery, mode: 'artlist', format: 'json', maxrecords: '5', sort: 'DateDesc' });
				data = await fetchGdelt(fallback);
			}
		}
		if (!data) return { results: [], error: 'GDELT returned non-JSON response' };
		const articles = Array.isArray(data?.articles) ? data.articles : [];
		return {
			results: articles.slice(0, 5).map((a) => ({
				title: a.title ?? 'Untitled',
				url: a.url,
				source: a.domain,
				date: a.seendate,
			})),
			query,
		};
	} catch (err) {
		console.error('[SearchTool] Failed:', err.message);
		return { results: [], error: err.message };
	}
}

async function fetchGdelt(params) {
	const res = await fetch(`https://api.gdeltproject.org/api/v2/doc/doc?${params}`, { signal: AbortSignal.timeout(8000) });
	if (!res.ok) return null;
	const text = await res.text();
	try { return JSON.parse(text); } catch { return null; }
}
