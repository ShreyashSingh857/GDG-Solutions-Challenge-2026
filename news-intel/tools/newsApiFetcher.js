import 'dotenv/config';

const BASE = 'https://newsapi.org/v2/everything';
const QUERY = '(shipping OR port OR canal OR freight) AND (disruption OR strike OR closure OR storm OR blockade)';

export async function fetchNewsApiArticles() {
  const key = process.env.NEWSAPI_KEY;
  if (!key) {
    console.warn('[NewsApiFetcher] NEWSAPI_KEY not set - secondary source disabled');
    return [];
  }

  const from = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const params = new URLSearchParams({
    q: QUERY,
    language: 'en',
    sortBy: 'publishedAt',
    from,
    pageSize: '20',
    apiKey: key,
  });

  const res = await fetch(`${BASE}?${params}`, {
    signal: AbortSignal.timeout(10000),
  });

  if (res.status === 429) {
    console.warn('[NewsApiFetcher] Rate limit hit - skipping this cycle');
    return [];
  }

  if (!res.ok) {
    throw new Error(`[NewsApiFetcher] HTTP ${res.status}: ${res.statusText}`);
  }

  const json = await res.json();
  const articles = Array.isArray(json?.articles) ? json.articles : [];

  return articles.map((article) => ({
    url: article.url,
    headline: article.title ?? 'Untitled',
    source: article.source?.name ?? 'Unknown',
    publishedAt: article.publishedAt ?? new Date().toISOString(),
    lat: null,
    lng: null,
    apiSource: 'newsapi',
  }));
}