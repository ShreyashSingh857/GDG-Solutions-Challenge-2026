import { fetchRssFeed } from '../../shared/lib/scraper.js';

const REUTERS_FEEDS = [
  'https://feeds.reuters.com/reuters/businessNews',
  'https://feeds.reuters.com/reuters/technologyNews',
  'https://www.reutersagency.com/feed/?best-topics=transportation&post_type=best',
];

const SHIPPING_KEYWORDS = [
  'shipping',
  'freight',
  'cargo',
  'port',
  'vessel',
  'container',
  'suez',
  'panama',
  'canal',
  'tanker',
  'lng',
  'sanctions',
  'trade war',
  'supply chain',
  'disruption',
  'strike',
  'blockade',
  'customs',
  'maersk',
  'cosco',
  'hapag',
  'evergreen',
  'msc',
];

export async function fetchReutersShippingNews() {
  const allArticles = [];

  for (const feedUrl of REUTERS_FEEDS) {
    try {
      const items = await fetchRssFeed(feedUrl, {
        minIntervalMs: 5_000,
        cacheTtlMs: 15 * 60_000,
      });
      allArticles.push(...items);
    } catch (err) {
      console.warn(`[Reuters] Feed failed: ${feedUrl}: ${err.message}`);
    }
  }

  return allArticles
    .filter((item) => {
      const text = `${item.title} ${item.description}`.toLowerCase();
      return SHIPPING_KEYWORDS.some((keyword) => text.includes(keyword));
    })
    .map((item) => ({
      url: item.url,
      headline: item.title,
      description: item.description,
      source: 'Reuters',
      publishedAt: item.publishedAt,
      apiSource: 'reuters-rss',
    }));
}
