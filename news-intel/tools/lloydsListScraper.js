import { fetchRssFeed } from '../../shared/lib/scraper.js';

const GOOGLE_NEWS_RSS =
  'https://news.google.com/rss/search?q=site:lloydslist.maritimeintelligence.informa.com+shipping&hl=en-US&gl=US&ceid=US:en';

const TRADEWINDS_RSS =
  'https://news.google.com/rss/search?q=site:tradewindsnews.com+shipping+disruption&hl=en-US&gl=US&ceid=US:en';

export async function fetchLloydsListHeadlines() {
  const [lloyds, tradewinds] = await Promise.allSettled([
    fetchRssFeed(GOOGLE_NEWS_RSS, { minIntervalMs: 8_000, cacheTtlMs: 15 * 60_000 }),
    fetchRssFeed(TRADEWINDS_RSS, { minIntervalMs: 8_000, cacheTtlMs: 15 * 60_000 }),
  ]);

  const articles = [
    ...(lloyds.status === 'fulfilled' ? lloyds.value : []),
    ...(tradewinds.status === 'fulfilled' ? tradewinds.value : []),
  ];

  return articles.map((item) => ({
    ...item,
    source: item.url?.includes('lloydslist') ? "Lloyd's List" : 'TradeWinds',
    apiSource: 'google-news-index',
    contentType: 'headline',
  }));
}
