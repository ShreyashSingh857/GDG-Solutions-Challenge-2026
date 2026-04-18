const GDACS_FEED = 'https://www.gdacs.org/xml/rss.xml';

export async function fetchGdacsAlerts() {
  try {
    const res = await fetch(GDACS_FEED, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    const items = [];
    const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/g);
    for (const match of itemMatches) {
      const block = match[1];
      const get = (tag) => (block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`)) || [])[1]?.trim() ?? '';
      const lat = parseFloat(block.match(/gdacs:latitude[^>]*>([^<]+)/)?.[1] ?? '0');
      const lng = parseFloat(block.match(/gdacs:longitude[^>]*>([^<]+)/)?.[1] ?? '0');
      items.push({
        url: get('link') || get('guid'),
        headline: get('title'),
        source: 'GDACS',
        publishedAt: new Date(get('pubDate') || Date.now()).toISOString(),
        lat: isFinite(lat) ? lat : null,
        lng: isFinite(lng) ? lng : null,
        apiSource: 'gdacs',
      });
    }
    return items;
  } catch (err) {
    console.error('[GdacsFetcher] Failed:', err.message);
    return [];
  }
}