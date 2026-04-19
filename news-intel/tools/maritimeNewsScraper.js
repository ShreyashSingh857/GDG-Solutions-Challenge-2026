import { fetchRssFeed } from '../../shared/lib/scraper.js';

const FEEDS = {
  hellenicShipping: 'https://www.hellenicshippingnews.com/feed/',
  gcaptain: 'https://gcaptain.com/feed/',
  seatrade: 'https://www.seatrade-maritime.com/rss.xml',
  splash247: 'https://splash247.com/feed/',
  tradeWindsFree: 'https://www.tradewindsnews.com/rss',
  lloydsListFree: 'https://lloydslist.maritimeintelligence.informa.com/rss',
};

const HIGH_SEVERITY_SIGNALS = [
  'closure',
  'blockage',
  'attacked',
  'seized',
  'fire',
  'grounded',
  'collision',
  'piracy',
  'missile',
  'sanctions',
  'strike',
  'protest',
  'halt',
  'suspend',
  'emergency',
  'evacuation',
  'explosion',
  'flood',
];

export async function fetchMaritimeNews() {
  const results = [];

  for (const [sourceName, feedUrl] of Object.entries(FEEDS)) {
    try {
      const items = await fetchRssFeed(feedUrl, {
        minIntervalMs: 4_000,
        cacheTtlMs: 15 * 60_000,
      });

      const scored = items.map((item) => {
        const text = `${item.title} ${item.description}`.toLowerCase();
        const severityScore = HIGH_SEVERITY_SIGNALS.filter((keyword) => text.includes(keyword)).length;

        return {
          url: item.url,
          headline: item.title,
          description: item.description,
          source: sourceDisplayName(sourceName),
          publishedAt: item.publishedAt,
          severityScore,
          apiSource: 'maritime-rss',
        };
      });

      results.push(...scored);
    } catch (err) {
      console.warn(`[MaritimeNews] ${sourceName} failed: ${err.message}`);
    }
  }

  return results.sort((a, b) =>
    b.severityScore - a.severityScore || new Date(b.publishedAt) - new Date(a.publishedAt)
  );
}

function sourceDisplayName(key) {
  const map = {
    hellenicShipping: 'Hellenic Shipping News',
    gcaptain: 'gCaptain',
    seatrade: 'Seatrade Maritime',
    splash247: 'Splash247',
    tradeWindsFree: 'TradeWinds',
    lloydsListFree: "Lloyd's List",
  };

  return map[key] || key;
}
