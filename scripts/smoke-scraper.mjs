import assert from 'node:assert/strict';
import http from 'node:http';

import {
	fetchRssFeed,
	politeFetch,
	politeJsonFetch,
	resetScraperState,
} from '../shared/lib/scraper.js';

async function run() {
	resetScraperState();

	let htmlHits = 0;
	let jsonHits = 0;
	let rssHits = 0;
	let atomHits = 0;

	const server = http.createServer((req, res) => {
		if (req.url === '/html') {
			htmlHits++;
			res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
			res.end('<html><body>ok-html</body></html>');
			return;
		}

		if (req.url?.startsWith('/json')) {
			jsonHits++;
			res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
			res.end(JSON.stringify({ service: 'scraper-smoke', ok: true }));
			return;
		}

		if (req.url === '/rss') {
			rssHits++;
			res.writeHead(200, { 'Content-Type': 'application/rss+xml; charset=utf-8' });
			res.end(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
	<channel>
		<title>Smoke RSS</title>
		<item>
			<title><![CDATA[Port disruption update]]></title>
			<link>/article-1</link>
			<description><![CDATA[<p>Draft restriction</p>]]></description>
			<pubDate>Sun, 20 Apr 2025 12:00:00 GMT</pubDate>
		</item>
	</channel>
</rss>`);
			return;
		}

		if (req.url === '/atom') {
			atomHits++;
			res.writeHead(200, { 'Content-Type': 'application/atom+xml; charset=utf-8' });
			res.end(`<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
	<title>Smoke Atom</title>
	<entry>
		<title>Canal status bulletin</title>
		<link rel="alternate" href="/atom-entry" />
		<summary>Transit lane normal</summary>
		<published>2025-04-20T11:00:00Z</published>
	</entry>
</feed>`);
			return;
		}

		res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
		res.end('not found');
	});

	await new Promise((resolve, reject) => {
		server.listen(0, '127.0.0.1', (err) => {
			if (err) reject(err);
			else resolve();
		});
	});

	const { port } = server.address();
	const base = `http://127.0.0.1:${port}`;

	try {
		const first = await politeFetch(`${base}/html`, { minIntervalMs: 0, cacheTtlMs: 60_000 });
		const second = await politeFetch(`${base}/html`, { minIntervalMs: 0, cacheTtlMs: 60_000 });
		assert.match(first, /ok-html/);
		assert.equal(first, second);
		assert.equal(htmlHits, 1, 'cache should prevent duplicate upstream fetch within TTL');

		const t0 = Date.now();
		await politeFetch(`${base}/json?a=1`, { minIntervalMs: 150, cacheTtlMs: 1 });
		await politeFetch(`${base}/json?a=2`, { minIntervalMs: 150, cacheTtlMs: 1 });
		const elapsed = Date.now() - t0;
		assert.ok(elapsed >= 120, `rate limiting should apply; elapsed=${elapsed}ms`);

		const json = await politeJsonFetch(`${base}/json`, { minIntervalMs: 0, cacheTtlMs: 10_000 });
		assert.equal(json.ok, true);
		assert.equal(json.service, 'scraper-smoke');
		assert.ok(jsonHits >= 2, 'json endpoint should be called by both politeFetch and politeJsonFetch');

		const rssItems = await fetchRssFeed(`${base}/rss`, { minIntervalMs: 0, cacheTtlMs: 10_000 });
		assert.equal(rssItems.length, 1);
		assert.equal(rssItems[0].title, 'Port disruption update');
		assert.equal(rssItems[0].url, `${base}/article-1`);
		assert.match(rssItems[0].description, /Draft restriction/);

		const atomItems = await fetchRssFeed(`${base}/atom`, { minIntervalMs: 0, cacheTtlMs: 10_000 });
		assert.equal(atomItems.length, 1);
		assert.equal(atomItems[0].title, 'Canal status bulletin');
		assert.equal(atomItems[0].url, `${base}/atom-entry`);
		assert.match(atomItems[0].description, /Transit lane normal/);
		assert.equal(rssHits, 1);
		assert.equal(atomHits, 1);

		console.log('[smoke-scraper] PASS: fetch/cache/rss helpers are working');
	} finally {
		await new Promise((resolve) => server.close(resolve));
		resetScraperState();
	}
}

run().catch((err) => {
	console.error('[smoke-scraper] FAIL:', err?.message || err);
	process.exit(1);
});
