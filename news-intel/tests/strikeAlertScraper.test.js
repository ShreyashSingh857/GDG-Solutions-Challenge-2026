import test from 'node:test';
import assert from 'node:assert/strict';

import { fetchStrikeAlerts } from '../tools/strikeAlertScraper.js';
import { resetScraperState } from '../../shared/lib/scraper.js';

const FEED_RESPONSES = {
  'https://www.itfglobal.org/en/news-resources/news/rss.xml': `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <item>
      <title>Dock workers union announces strike vote</title>
      <link>https://example.test/itf-1</link>
      <description>Industrial action may affect container terminals</description>
      <pubDate>Sun, 20 Apr 2025 12:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`,
  'https://www.ilo.org/global/industries-and-sectors/shipping-ports-fisheries/rss/lang--en/index.htm': `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <item>
      <title>Port labor framework update</title>
      <link>https://example.test/ilo-1</link>
      <description>Routine policy update with no disruptions expected</description>
      <pubDate>Sun, 20 Apr 2025 11:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`,
  'https://news.google.com/rss/search?q=port+strike+OR+dock+workers+walkout+OR+longshoremen+strike&hl=en&gl=US&ceid=US:en': `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <item>
      <title>Longshoremen walkout slows Atlantic cargo flow</title>
      <link>https://example.test/google-1</link>
      <description>Major backlog expected this week</description>
      <pubDate>Sun, 20 Apr 2025 10:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`,
};

test('fetchStrikeAlerts filters strike-related items and maps metadata', async () => {
  resetScraperState();
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (url) => {
    const body = FEED_RESPONSES[url];
    if (!body) {
      return new Response('not found', { status: 404, statusText: 'Not Found' });
    }

    return new Response(body, {
      status: 200,
      headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
    });
  };

  try {
    const items = await fetchStrikeAlerts();

    assert.equal(items.length, 2);
    assert.deepEqual(
      items.map((item) => item.url).sort(),
      ['https://example.test/google-1', 'https://example.test/itf-1']
    );
    assert.ok(items.every((item) => item.apiSource === 'strike-rss'));
    assert.ok(items.every((item) => item.eventType === 'STRIKE'));
  } finally {
    globalThis.fetch = originalFetch;
    resetScraperState();
  }
});
