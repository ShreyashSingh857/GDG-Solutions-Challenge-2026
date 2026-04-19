import test from 'node:test';
import assert from 'node:assert/strict';

import { fetchLloydsListHeadlines } from '../tools/lloydsListScraper.js';
import { resetScraperState } from '../../shared/lib/scraper.js';

const FEED_RESPONSES = {
  'https://news.google.com/rss/search?q=site:lloydslist.maritimeintelligence.informa.com+shipping&hl=en-US&gl=US&ceid=US:en': `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <item>
      <title>Lloyds: shipping market reacts to Red Sea disruption</title>
      <link>https://lloydslist.maritimeintelligence.informa.com/some-story</link>
      <description>Headline only snippet</description>
      <pubDate>Sun, 20 Apr 2025 12:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`,
  'https://news.google.com/rss/search?q=site:tradewindsnews.com+shipping+disruption&hl=en-US&gl=US&ceid=US:en': `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <item>
      <title>TradeWinds tracks container diversions</title>
      <link>https://www.tradewindsnews.com/markets/diversions</link>
      <description>Headline only snippet</description>
      <pubDate>Sun, 20 Apr 2025 11:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`,
};

test('fetchLloydsListHeadlines maps source and metadata', async () => {
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
    const items = await fetchLloydsListHeadlines();

    assert.equal(items.length, 2);
    assert.equal(items[0].source, "Lloyd's List");
    assert.equal(items[1].source, 'TradeWinds');
    assert.ok(items.every((item) => item.apiSource === 'google-news-index'));
    assert.ok(items.every((item) => item.contentType === 'headline'));
  } finally {
    globalThis.fetch = originalFetch;
    resetScraperState();
  }
});
