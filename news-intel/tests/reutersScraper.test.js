import test from 'node:test';
import assert from 'node:assert/strict';

import { fetchReutersShippingNews } from '../tools/reutersScraper.js';
import { resetScraperState } from '../../shared/lib/scraper.js';

const rssByUrl = {
  'https://feeds.reuters.com/reuters/businessNews': `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <item>
      <title>Container shipping rates jump in Red Sea corridor</title>
      <link>https://example.test/reuters-1</link>
      <description>Port congestion and vessel rerouting continue</description>
      <pubDate>Sun, 20 Apr 2025 12:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`,
  'https://feeds.reuters.com/reuters/technologyNews': `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <item>
      <title>Chipmaker launches new AI accelerator</title>
      <link>https://example.test/reuters-2</link>
      <description>Semiconductor launch and data center demand</description>
      <pubDate>Sun, 20 Apr 2025 10:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`,
  'https://www.reutersagency.com/feed/?best-topics=transportation&post_type=best': `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <item>
      <title>Panama canal transit delays ease after restrictions</title>
      <link>https://example.test/reuters-3</link>
      <description>Supply chain and cargo operators monitor backlog</description>
      <pubDate>Sun, 20 Apr 2025 09:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`,
};

test('fetchReutersShippingNews filters and maps Reuters RSS items', async () => {
  resetScraperState();
  const originalFetch = globalThis.fetch;

  let callCount = 0;
  globalThis.fetch = async (url) => {
    callCount++;
    const body = rssByUrl[url];
    if (!body) {
      return new Response('not found', { status: 404, statusText: 'Not Found' });
    }

    return new Response(body, {
      status: 200,
      headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
    });
  };

  try {
    const articles = await fetchReutersShippingNews();

    assert.equal(callCount, 3);
    assert.equal(articles.length, 2);
    assert.deepEqual(
      articles.map((a) => a.url).sort(),
      ['https://example.test/reuters-1', 'https://example.test/reuters-3']
    );
    assert.ok(articles.every((a) => a.source === 'Reuters'));
    assert.ok(articles.every((a) => a.apiSource === 'reuters-rss'));
  } finally {
    globalThis.fetch = originalFetch;
    resetScraperState();
  }
});
