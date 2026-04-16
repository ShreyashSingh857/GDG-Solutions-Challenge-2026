import 'dotenv/config';

const GDELT_BASE = 'https://api.gdeltproject.org/api/v2/doc/doc';

const QUERY = [
  '(shipping OR port OR canal OR freight OR cargo OR trade)',
  'AND',
  '(disruption OR closure OR strike OR storm OR typhoon OR conflict OR blockade OR sanctions)',
].join(' ');

export async function fetchGdeltArticles(since) {
  const params = new URLSearchParams({
    query: QUERY,
    mode: 'artlist',
    format: 'json',
    maxrecords: '50',
    startdatetime: formatGdeltDate(since),
    sort: 'DateDesc',
  });

  const res = await fetch(`${GDELT_BASE}?${params}`, {
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    throw new Error(`[GdeltFetcher] HTTP ${res.status}: ${res.statusText}`);
  }

  const json = await res.json();
  const articles = Array.isArray(json?.articles) ? json.articles : [];

  return articles.map((article) => ({
    url: article.url,
    headline: article.title ?? article.seendate ?? 'Untitled',
    source: article.domain ?? 'Unknown',
    publishedAt: gdeltDateToISO(article.seendate),
    lat: article.latitude ? Number.parseFloat(article.latitude) : null,
    lng: article.longitude ? Number.parseFloat(article.longitude) : null,
    apiSource: 'gdelt',
  }));
}

function formatGdeltDate(date) {
  const pad = (value, length = 2) => String(value).padStart(length, '0');
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
  ].join('');
}

function gdeltDateToISO(seendate) {
  if (!seendate || seendate.length < 14) {
    return new Date().toISOString();
  }

  const year = seendate.slice(0, 4);
  const month = seendate.slice(4, 6);
  const day = seendate.slice(6, 8);
  const hour = seendate.slice(8, 10);
  const minute = seendate.slice(10, 12);
  const second = seendate.slice(12, 14);

  return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`).toISOString();
}