import test from 'node:test';
import assert from 'node:assert/strict';

import { fetchMaritimeNews } from '../tools/maritimeNewsScraper.js';
import { resetScraperState } from '../../shared/lib/scraper.js';

const FEED_RESPONSES = {
  'https://www.hellenicshippingnews.com/feed/': `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <item>
      <title>Canal closure forces vessel rerouting</title>
      <link>https://example.test/hellenic-1</link>
      <description>Emergency response after collision and fire</description>
      <pubDate>Sun, 20 Apr 2025 12:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`,
  'https://gcaptain.com/feed/': `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <item>
      <title>Port throughput update shows normal operations</title>
      <link>https://example.test/gcaptain-1</link>
      <description>No major disruption expected this week</description>
      <pubDate>Sun, 20 Apr 2025 11:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`,
  'https://www.seatrade-maritime.com/rss.xml': `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel></channel></rss>`,
  'https://splash247.com/feed/': `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel></channel></rss>`,
  'https://www.tradewindsnews.com/rss': `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel></channel></rss>`,
  'https://lloydslist.maritimeintelligence.informa.com/rss': `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel></channel></rss>`,
};

test('fetchMaritimeNews scores and sorts maritime RSS stories', async () => {
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
    const items = await fetchMaritimeNews();

    assert.equal(items.length, 2);
    assert.equal(items[0].url, 'https://example.test/hellenic-1');
    assert.equal(items[0].source, 'Hellenic Shipping News');
    assert.equal(items[0].apiSource, 'maritime-rss');
    assert.ok(items[0].severityScore > items[1].severityScore);
    assert.equal(items[1].url, 'https://example.test/gcaptain-1');
    assert.equal(items[1].source, 'gCaptain');
  } finally {
    globalThis.fetch = originalFetch;
    resetScraperState();
  }
});
