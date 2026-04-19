import { fetchRssFeed } from '../../shared/lib/scraper.js';

const STRIKE_FEEDS = [
  'https://www.itfglobal.org/en/news-resources/news/rss.xml',
  'https://www.ilo.org/global/industries-and-sectors/shipping-ports-fisheries/rss/lang--en/index.htm',
  'https://news.google.com/rss/search?q=port+strike+OR+dock+workers+walkout+OR+longshoremen+strike&hl=en&gl=US&ceid=US:en',
];

const STRIKE_KEYWORDS = [
  'strike',
  'walkout',
  'stoppage',
  'industrial action',
  'work to rule',
  'labor dispute',
  'labour dispute',
  'dock workers',
  'longshoremen',
  'port closure',
  'union',
  'picket',
  'picket line',
  'boycott',
];

export async function fetchStrikeAlerts() {
  const allItems = [];

  for (const feed of STRIKE_FEEDS) {
    try {
      const items = await fetchRssFeed(feed, {
        minIntervalMs: 5_000,
        cacheTtlMs: 15 * 60_000,
      });
      allItems.push(...items);
    } catch (err) {
      console.warn(`[StrikeAlert] Feed failed ${feed}: ${err.message}`);
    }
  }

  return allItems
    .filter((item) => {
      const text = `${item.title} ${item.description}`.toLowerCase();
      return STRIKE_KEYWORDS.some((keyword) => text.includes(keyword));
    })
    .map((item) => ({
      url: item.url,
      headline: item.title,
      description: item.description,
      source: item.source || 'Strike Alert Monitor',
      publishedAt: item.publishedAt,
      eventType: 'STRIKE',
      apiSource: 'strike-rss',
    }));
}
