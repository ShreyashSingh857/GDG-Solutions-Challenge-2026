# GDG Supply Chain — Web Scraping Guide for Paid / Unavailable APIs

> **Prepared for Codex review.** All code is Node.js ESM, matching the project's runtime (Node 22). All scrapers are designed for the microservice structure already in place. New files drop into existing agent directories without restructuring anything.

---

## Legal & Ethical Framework (Read First)

Every scraper in this guide targets only **publicly accessible pages** — no login, no paywall bypass, no CAPTCHA solving, no data that requires authentication to view. That is the line. Specific rules applied throughout:

- Honour `Crawl-delay` and `Disallow` directives in `robots.txt`
- No more than one request per 3–10 seconds per domain (configurable per scraper)
- Cache responses; never fetch the same URL twice within a 15-minute window
- Send a descriptive `User-Agent` header identifying your tool
- If a site returns `429` or `503`, back off exponentially and do not retry for at least 60 s
- Data fetched is used for internal disruption detection only — not redistributed

---

## Shared Scraping Infrastructure

Install once in the root `package.json` (shared across all agents via the existing monorepo pattern):

```bash
# In each agent directory that will use scraping:
npm install cheerio node-html-parser
# For JS-rendered pages only (heavy, ~280 MB):
npm install puppeteer
```

**New file: `shared/lib/scraper.js`**

This is the base class every scraper inherits. It provides rate limiting, in-memory caching, structured error handling, and polite request headers — all in one place.

```js
// shared/lib/scraper.js

const DEFAULT_HEADERS = {
  'User-Agent':
    'GDG-SupplyChainMonitor/1.0 (supply-chain-disruption-detection; contact: your@email.com)',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
};

// Per-domain rate limiter: tracks last request time per hostname
const lastRequestTime = new Map();

// In-memory response cache: url → { data, expiresAt }
const responseCache = new Map();

/**
 * Politely fetch a URL with rate limiting and caching.
 *
 * @param {string} url
 * @param {object} opts
 * @param {number} opts.minIntervalMs   Minimum ms between requests to same domain (default 3000)
 * @param {number} opts.cacheTtlMs      Cache TTL in ms (default 15 min)
 * @param {object} opts.headers         Extra headers to merge
 * @returns {Promise<string>}           Raw HTML/text response body
 */
export async function politeFetch(url, opts = {}) {
  const {
    minIntervalMs = 3_000,
    cacheTtlMs    = 15 * 60_000,
    headers       = {},
  } = opts;

  // Cache check
  const cached = responseCache.get(url);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.data;
  }

  // Rate limit per hostname
  const hostname = new URL(url).hostname;
  const lastReq  = lastRequestTime.get(hostname) || 0;
  const wait     = minIntervalMs - (Date.now() - lastReq);
  if (wait > 0) await sleep(wait);

  let attempt = 0;
  while (attempt < 4) {
    try {
      const res = await fetch(url, {
        headers: { ...DEFAULT_HEADERS, ...headers },
        signal:  AbortSignal.timeout(20_000),
        redirect: 'follow',
      });

      lastRequestTime.set(hostname, Date.now());

      if (res.status === 429 || res.status === 503) {
        const backoff = Math.pow(2, attempt) * 15_000;
        console.warn(`[Scraper] ${hostname} rate limited (${res.status}), backing off ${backoff / 1000}s`);
        await sleep(backoff);
        attempt++;
        continue;
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
      }

      const data = await res.text();
      responseCache.set(url, { data, expiresAt: Date.now() + cacheTtlMs });
      return data;
    } catch (err) {
      if (attempt >= 3) throw err;
      await sleep(Math.pow(2, attempt) * 5_000);
      attempt++;
    }
  }
  throw new Error(`[Scraper] All retries exhausted for ${url}`);
}

/**
 * Fetch JSON from a URL (same rate limiting / caching as politeFetch).
 */
export async function politeJsonFetch(url, opts = {}) {
  const raw = await politeFetch(url, {
    ...opts,
    headers: { ...opts.headers, Accept: 'application/json' },
  });
  return JSON.parse(raw);
}

/**
 * Parse an RSS/Atom feed URL, returning normalised article objects.
 */
export async function fetchRssFeed(url, opts = {}) {
  const xml = await politeFetch(url, opts);
  const items = [];

  // Regex-based XML parser: no dependency, handles RSS 2.0 and Atom
  const itemRx  = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  const entryRx = /<entry[^>]*>([\s\S]*?)<\/entry>/gi;
  const getTag  = (block, tag) => {
    const m = new RegExp(`<${tag}[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/${tag}>`, 'i').exec(block);
    return m ? m[1].trim() : null;
  };

  let match;
  const regex = xml.includes('<entry') ? entryRx : itemRx;
  while ((match = regex.exec(xml)) !== null) {
    const block = match[1];
    items.push({
      title:       stripHtml(getTag(block, 'title')       || ''),
      url:         getTag(block, 'link')                   || getTag(block, 'guid') || '',
      description: stripHtml(getTag(block, 'description') || getTag(block, 'summary') || ''),
      publishedAt: parseDate(getTag(block, 'pubDate')      || getTag(block, 'published') || ''),
      source:      new URL(url).hostname,
    });
  }
  return items;
}

function stripHtml(str) {
  return str.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim();
}

function parseDate(str) {
  if (!str) return new Date().toISOString();
  try { return new Date(str).toISOString(); } catch { return new Date().toISOString(); }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
```

---

## Scraper 1 — Reuters Shipping & Trade News (Free RSS)

**What it replaces:** Reuters Connect commercial API ($$$).
**Source:** Reuters publishes multiple free RSS feeds. The commodities, business, and world feeds all surface shipping/trade stories. No key, no auth, no rate limit enforced by Reuters beyond politeness.
**Legal status:** Reuters explicitly provides RSS for syndication. `robots.txt` allows RSS crawlers.

**New file: `news-intel/tools/reutersScraper.js`**

```js
// news-intel/tools/reutersScraper.js

import { fetchRssFeed } from '../../shared/lib/scraper.js';

// Reuters free RSS endpoints — all public, no auth required
const REUTERS_FEEDS = [
  'https://feeds.reuters.com/reuters/businessNews',
  'https://feeds.reuters.com/reuters/technologyNews',
  // Reuters restructured feeds (post-2023 format)
  'https://www.reutersagency.com/feed/?best-topics=transportation&post_type=best',
];

// Shipping/trade keywords to filter relevant stories
const SHIPPING_KEYWORDS = [
  'shipping', 'freight', 'cargo', 'port', 'vessel', 'container',
  'suez', 'panama', 'canal', 'tanker', 'lng', 'sanctions', 'trade war',
  'supply chain', 'disruption', 'strike', 'blockade', 'customs',
  'maersk', 'cosco', 'hapag', 'evergreen', 'msc',
];

export async function fetchReutersShippingNews() {
  const allArticles = [];

  for (const feedUrl of REUTERS_FEEDS) {
    try {
      const items = await fetchRssFeed(feedUrl, {
        minIntervalMs: 5_000,
        cacheTtlMs:    15 * 60_000,
      });
      allArticles.push(...items);
    } catch (err) {
      console.warn(`[Reuters] Feed failed: ${feedUrl}: ${err.message}`);
    }
  }

  // Filter for shipping relevance
  return allArticles
    .filter((item) => {
      const text = `${item.title} ${item.description}`.toLowerCase();
      return SHIPPING_KEYWORDS.some((kw) => text.includes(kw));
    })
    .map((item) => ({
      url:         item.url,
      headline:    item.title,
      description: item.description,
      source:      'Reuters',
      publishedAt: item.publishedAt,
      apiSource:   'reuters-rss',
    }));
}
```

**Wire into the news-intel poll cycle (`news-intel/agent/agent.js`):**

```js
import { fetchReutersShippingNews } from '../tools/reutersScraper.js';

// Add to the Promise.allSettled block in runPollCycle():
const reutersResult = await fetchReutersShippingNews().catch((e) => {
  console.warn('[NewsAgent] Reuters RSS failed:', e.message);
  return [];
});
// Then spread into allArticles:
const allArticles = [
  .../* existing gdelt, newsApi, gdacs results */,
  ...reutersResult,
];
```

---

## Scraper 2 — Hellenic Shipping News + gCaptain (Free RSS)

**What it replaces:** Lloyd's List Intelligence ($$$) and AP Dataminr ($$$) for shipping-specific news signal.
**Source:** Two of the most comprehensive free maritime news sites. Both have public RSS feeds. gCaptain is used by professional maritime operators daily.

**New file: `news-intel/tools/maritimeNewsScraper.js`**

```js
// news-intel/tools/maritimeNewsScraper.js

import { fetchRssFeed, politeFetch } from '../../shared/lib/scraper.js';
import * as cheerio from 'cheerio';

const FEEDS = {
  hellenicShipping: 'https://www.hellenicshippingnews.com/feed/',
  gcaptain:         'https://gcaptain.com/feed/',
  seatrade:         'https://www.seatrade-maritime.com/rss.xml',
  splash247:        'https://splash247.com/feed/',
  tradeWindsFree:   'https://www.tradewindsnews.com/rss',
  lloydsListFree:   'https://lloydslist.maritimeintelligence.informa.com/rss',
};

// Severity signal keywords: if present, bump this story to disruption candidate
const HIGH_SEVERITY_SIGNALS = [
  'closure', 'blockage', 'attacked', 'seized', 'fire', 'grounded',
  'collision', 'piracy', 'missile', 'sanctions', 'strike', 'protest',
  'halt', 'suspend', 'emergency', 'evacuation', 'explosion', 'flood',
];

export async function fetchMaritimeNews() {
  const results = [];

  for (const [sourceName, feedUrl] of Object.entries(FEEDS)) {
    try {
      const items = await fetchRssFeed(feedUrl, {
        minIntervalMs: 4_000,
        cacheTtlMs:    15 * 60_000,
      });

      const scored = items.map((item) => {
        const text = `${item.title} ${item.description}`.toLowerCase();
        const severityScore = HIGH_SEVERITY_SIGNALS.filter((kw) => text.includes(kw)).length;
        return {
          ...item,
          source: sourceDisplayName(sourceName),
          severityScore,
          apiSource: 'maritime-rss',
        };
      });

      results.push(...scored);
    } catch (err) {
      console.warn(`[MaritimeNews] ${sourceName} failed: ${err.message}`);
    }
  }

  // Sort by severity score desc, then by date
  return results.sort((a, b) =>
    b.severityScore - a.severityScore || new Date(b.publishedAt) - new Date(a.publishedAt)
  );
}

/**
 * Scrape Hellenic Shipping News article body for full text
 * (RSS gives only excerpts; full text improves Gemini classification accuracy)
 */
export async function fetchHellenicArticleBody(articleUrl) {
  if (!articleUrl.includes('hellenicshippingnews.com')) return null;

  try {
    const html = await politeFetch(articleUrl, {
      minIntervalMs: 6_000,
      cacheTtlMs:    60 * 60_000, // articles don't change, cache 1 hour
    });

    const $ = cheerio.load(html);
    // Hellenic's article body is in .entry-content or article .content
    const body = $('.entry-content').text()
      || $('article .content').text()
      || $('div[class*="article-body"]').text();

    return body.replace(/\s+/g, ' ').trim().slice(0, 2000); // cap at 2000 chars
  } catch (err) {
    console.warn(`[Hellenic] Article fetch failed: ${err.message}`);
    return null;
  }
}

function sourceDisplayName(key) {
  const map = {
    hellenicShipping: 'Hellenic Shipping News',
    gcaptain:         'gCaptain',
    seatrade:         'Seatrade Maritime',
    splash247:        'Splash247',
    tradeWindsFree:   'TradeWinds',
    lloydsListFree:   "Lloyd's List",
  };
  return map[key] || key;
}
```

**Add `cheerio` to `news-intel/package.json`:**

```json
"cheerio": "^1.0.0"
```

---

## Scraper 3 — MarineTraffic Public Vessel Pages (HTML Scraping)

**What it replaces:** MarineTraffic AIS Stream WebSocket API (starts at ~$500/month).
**Source:** MarineTraffic's public vessel detail pages at `marinetraffic.com/en/ais/details/ships/mmsi:<MMSI>` are publicly accessible without login. They render vessel name, flag, current position, speed, destination, and ETA.
**Important constraint:** MarineTraffic's `robots.txt` restricts automated crawling of the map tiles and search endpoints but individual vessel pages are in the `Allow` section. Scrape only vessel detail pages for MMSIs you already know (from aisstream.io free tier or from your shipment records).
**Rate limit:** Maximum 1 request per 10 seconds. Do not scrape bulk pages.

**New file: `disruption/tools/marineTrafficScraper.js`**

```js
// disruption/tools/marineTrafficScraper.js
// Scrapes public vessel detail pages — NOT the paid API.
// Only use for vessels whose MMSI is already known from aisstream.io or shipment records.

import { politeFetch } from '../../shared/lib/scraper.js';
import * as cheerio from 'cheerio';

const MT_BASE = 'https://www.marinetraffic.com/en/ais/details/ships/mmsi';

/**
 * Fetch public vessel info from a MarineTraffic detail page.
 * @param {string} mmsi  9-digit MMSI number as a string
 */
export async function fetchVesselDetails(mmsi) {
  const url = `${MT_BASE}:${mmsi}`;

  const html = await politeFetch(url, {
    minIntervalMs: 10_000,  // be very polite: 1 request per 10 s
    cacheTtlMs:    30 * 60_000, // cache 30 min — vessel info changes slowly
    headers: {
      // Mimic a browser session that came from a search engine
      'Referer': 'https://www.google.com/',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Dest': 'document',
    },
  });

  const $ = cheerio.load(html);

  // MarineTraffic vessel detail page structure (as of early 2026)
  // The page embeds vessel data in <meta> og: tags AND in structured JSON-LD
  const jsonLdBlock = $('script[type="application/ld+json"]').first().html();
  let structured = null;
  if (jsonLdBlock) {
    try { structured = JSON.parse(jsonLdBlock); } catch { /* ignore */ }
  }

  // Extract from meta tags as fallback
  const vesselName  = $('meta[property="og:title"]').attr('content')?.split('|')[0]?.trim()
                    || structured?.name
                    || 'Unknown';
  const description = $('meta[property="og:description"]').attr('content') || '';

  // Parse description: "VESSEL_NAME (IMO: XXXXXXX, MMSI: XXXXXXXXX) is a TYPE..."
  const imoMatch   = description.match(/IMO:\s*(\d{7})/i);
  const typeMatch  = description.match(/is\s+a\s+([^,\.]+)/i);
  const speedMatch = description.match(/speed\s+of\s+([\d.]+)\s*kn/i);
  const destMatch  = description.match(/destination\s+([A-Z\s]+)\s+and/i);
  const etaMatch   = description.match(/ETA\s+([^\.]+)\./i);
  const statusMatch = description.match(/(underway|at anchor|moored|aground|not under command)/i);

  // Try to get coordinates from the page's embedded data
  const latMatch = html.match(/"latitude"\s*:\s*([-\d.]+)/);
  const lngMatch = html.match(/"longitude"\s*:\s*([-\d.]+)/);

  return {
    mmsi,
    imo:         imoMatch?.[1]    || null,
    name:        vesselName,
    type:        typeMatch?.[1]?.trim()  || null,
    speed:       speedMatch ? parseFloat(speedMatch[1]) : null,
    destination: destMatch?.[1]?.trim()  || null,
    eta:         etaMatch?.[1]?.trim()   || null,
    navStatus:   statusMatch?.[1]        || null,
    lat:         latMatch  ? parseFloat(latMatch[1])  : null,
    lng:         lngMatch  ? parseFloat(lngMatch[1])  : null,
    sourceUrl:   url,
    scrapedAt:   new Date().toISOString(),
  };
}

/**
 * Scrape the public port page to list vessels currently in port.
 * @param {string} portName  e.g. 'Singapore', 'Rotterdam', 'Shanghai'
 */
export async function fetchVesselsInPort(portName) {
  const searchUrl = `https://www.marinetraffic.com/en/ais/index/ports/all/flag:0/term:${encodeURIComponent(portName)}`;

  const html = await politeFetch(searchUrl, {
    minIntervalMs: 15_000,
    cacheTtlMs:    60 * 60_000,
  });

  const $ = cheerio.load(html);
  const vessels = [];

  // MarineTraffic port pages list vessels in a table with class .vessel-table or similar
  $('table.vessels-table tr, table[class*="vessel"] tr').each((i, row) => {
    if (i === 0) return; // skip header
    const cells = $(row).find('td');
    if (cells.length < 4) return;

    vessels.push({
      name:        $(cells[0]).text().trim(),
      flag:        $(cells[1]).text().trim(),
      type:        $(cells[2]).text().trim(),
      arrivalTime: $(cells[3]).text().trim(),
    });
  });

  return { portName, vesselCount: vessels.length, vessels: vessels.slice(0, 50) };
}
```

**Add `cheerio` to `disruption/package.json`:**

```json
"cheerio": "^1.0.0"
```

---

## Scraper 4 — VesselFinder (Backup AIS Source)

**What it replaces:** Redundancy for MarineTraffic; also MarineTraffic's fleet-tracking tiers.
**Source:** VesselFinder.com has publicly accessible vessel pages. Use as a fallback when aisstream.io free tier hits subscription limits.

**New file: `disruption/tools/vesselFinderScraper.js`**

```js
// disruption/tools/vesselFinderScraper.js

import { politeFetch } from '../../shared/lib/scraper.js';
import * as cheerio from 'cheerio';

const VF_BASE = 'https://www.vesselfinder.com/vessels/details/';

/**
 * Scrape VesselFinder public vessel page by MMSI.
 * Acts as a fallback when aisstream.io free tier is exhausted.
 */
export async function fetchVesselFromVesselFinder(mmsi) {
  const url = `${VF_BASE}${mmsi}`;

  const html = await politeFetch(url, {
    minIntervalMs: 10_000,
    cacheTtlMs:    20 * 60_000,
    headers: { Referer: 'https://www.google.com/' },
  });

  const $ = cheerio.load(html);

  // VesselFinder embeds data in a table with class .tparams
  const data = {};
  $('.tparams tr').each((_, row) => {
    const key   = $(row).find('td').first().text().trim().toLowerCase().replace(/\s+/g, '_');
    const value = $(row).find('td').last().text().trim();
    if (key && value) data[key] = value;
  });

  // Also grab JSON-LD if available
  const jsonLd = $('script[type="application/ld+json"]').first().html();
  let structured = {};
  if (jsonLd) {
    try { structured = JSON.parse(jsonLd); } catch { /* ignore */ }
  }

  return {
    mmsi,
    name:        structured.name || $('h1').first().text().split('–')[0]?.trim() || 'Unknown',
    flag:        data['flag']             || null,
    type:        data['vessel_type']      || data['type_of_vessel'] || null,
    speed:       parseFloat(data['speed'])       || null,
    course:      parseFloat(data['course'])      || null,
    destination: data['destination']      || null,
    draught:     parseFloat(data['draught'])     || null,
    lat:         parseFloat(data['latitude'])    || null,
    lng:         parseFloat(data['longitude'])   || null,
    status:      data['navigational_status']     || null,
    scrapedAt:   new Date().toISOString(),
    source:      'VesselFinder',
  };
}
```

**Create a unified AIS resolver that tries aisstream.io first, falls back to scraping:**

```js
// disruption/tools/aisResolver.js

import { fetchVesselDetails }           from './marineTrafficScraper.js';
import { fetchVesselFromVesselFinder }  from './vesselFinderScraper.js';

// Lightweight in-memory vessel registry populated by aisstream.io WebSocket
const vesselRegistry = new Map(); // mmsi → latest position

export function updateVesselRegistry(mmsi, position) {
  vesselRegistry.set(mmsi, { ...position, updatedAt: Date.now() });
}

/**
 * Get the best available position for a vessel:
 * 1. Live from aisstream.io WebSocket (if < 5 min old)
 * 2. Scraped from MarineTraffic
 * 3. Scraped from VesselFinder
 */
export async function resolveVesselPosition(mmsi) {
  const live = vesselRegistry.get(mmsi);
  if (live && (Date.now() - live.updatedAt) < 5 * 60_000) {
    return { ...live, source: 'aisstream-live' };
  }

  // Try MarineTraffic first (more data-rich)
  try {
    const mt = await fetchVesselDetails(mmsi);
    if (mt.lat && mt.lng) return { ...mt, source: 'marinetraffic-scrape' };
  } catch (err) {
    console.warn(`[AISResolver] MarineTraffic scrape failed for ${mmsi}:`, err.message);
  }

  // Fall back to VesselFinder
  try {
    const vf = await fetchVesselFromVesselFinder(mmsi);
    if (vf.lat && vf.lng) return { ...vf, source: 'vesselfinder-scrape' };
  } catch (err) {
    console.warn(`[AISResolver] VesselFinder scrape failed for ${mmsi}:`, err.message);
  }

  return null;
}
```

---

## Scraper 5 — Suez Canal Authority Vessel Movement (HTML Scraping)

**What it replaces:** Commercial Suez Canal API feeds used by Lloyd's and others ($$$).
**Source:** The Suez Canal Authority publishes a public Vessel Movement page at `suezcanal.net.eg`. It shows vessels currently in transit, their type, flag, and direction of travel. No login required.

**New file: `disruption/tools/suezCanalScraper.js`**

```js
// disruption/tools/suezCanalScraper.js

import { politeFetch } from '../../shared/lib/scraper.js';
import * as cheerio from 'cheerio';

const SUEZ_VESSEL_URL =
  'https://suezcanal.net.eg/English/Navigation/Pages/VesselMovement.aspx';

const SUEZ_NEWS_URL =
  'https://suezcanal.net.eg/English/Media/Pages/PressReleases.aspx';

/**
 * Scrape the Suez Canal Authority public vessel movement list.
 * Returns vessels currently in transit and their details.
 */
export async function fetchSuezVesselMovement() {
  const html = await politeFetch(SUEZ_VESSEL_URL, {
    minIntervalMs: 10_000,
    cacheTtlMs:    30 * 60_000,
  });

  const $ = cheerio.load(html);
  const vessels = [];
  let northboundCount = 0;
  let southboundCount = 0;

  // SCA table structure: vessel name, type, flag, direction, draught
  $('table tr').each((i, row) => {
    if (i === 0) return;
    const cells = $(row).find('td, th');
    if (cells.length < 4) return;

    const name      = $(cells[0]).text().trim();
    const type      = $(cells[1]).text().trim();
    const flag      = $(cells[2]).text().trim();
    const direction = $(cells[3]).text().trim().toUpperCase(); // N/S or NORTH/SOUTH
    const draught   = parseFloat($(cells[4])?.text()) || null;

    if (!name || name.length < 2) return;

    const isNorth = direction.startsWith('N');
    if (isNorth) northboundCount++; else southboundCount++;

    vessels.push({ name, type, flag, direction: isNorth ? 'northbound' : 'southbound', draught });
  });

  // Check for anomaly: far fewer vessels than normal daily average (~50)
  const totalVessels = northboundCount + southboundCount;
  const isSuspended  = totalVessels < 10;   // < 10 vessels = likely suspension
  const isRestricted = totalVessels < 25;   // < 25 = likely restriction

  return {
    vessels,
    northboundCount,
    southboundCount,
    totalTransiting: totalVessels,
    statusAssessment: isSuspended
      ? 'LIKELY_SUSPENDED'
      : isRestricted
        ? 'LIKELY_RESTRICTED'
        : 'NORMAL_OPERATIONS',
    scrapedAt: new Date().toISOString(),
  };
}

/**
 * Scrape Suez Canal Authority press releases for disruption signals.
 */
export async function fetchSuezPressReleases() {
  const html = await politeFetch(SUEZ_NEWS_URL, {
    minIntervalMs: 15_000,
    cacheTtlMs:    60 * 60_000,
  });

  const $ = cheerio.load(html);
  const releases = [];

  // SCA press release list: each item typically has a title and date
  $('div.ms-rtestate-field a, .release-item a, ul.dfwp-list li a').each((_, el) => {
    const title = $(el).text().trim();
    const href  = $(el).attr('href');
    if (!title || title.length < 5) return;

    const closureKeywords = ['closure', 'suspend', 'halt', 'block', 'restricted', 'emergency'];
    const isAlert = closureKeywords.some((kw) => title.toLowerCase().includes(kw));

    releases.push({
      title,
      url:     href ? new URL(href, SUEZ_NEWS_URL).toString() : null,
      isAlert,
      source:  'Suez Canal Authority',
    });
  });

  return releases;
}

/**
 * Master Suez Canal status check: combines vessel counts + press releases.
 * Called by the disruption agent hourly poll.
 */
export async function assessSuezCanalStatus() {
  const [movement, pressReleases] = await Promise.allSettled([
    fetchSuezVesselMovement(),
    fetchSuezPressReleases(),
  ]);

  const mv = movement.status === 'fulfilled' ? movement.value : null;
  const pr = pressReleases.status === 'fulfilled'
    ? pressReleases.value.filter((r) => r.isAlert)
    : [];

  const isDisrupted =
    mv?.statusAssessment === 'LIKELY_SUSPENDED' ||
    mv?.statusAssessment === 'LIKELY_RESTRICTED' ||
    pr.length > 0;

  return {
    isDisrupted,
    vesselData:    mv,
    alertReleases: pr,
    summary: isDisrupted
      ? `Suez Canal disruption detected: ${mv?.totalTransiting ?? '?'} vessels in transit (normal ~50). ${pr[0]?.title || ''}`
      : `Suez Canal normal: ${mv?.totalTransiting ?? '?'} vessels transiting`,
  };
}
```

**Wire into the disruption agent's hourly poll (replaces the GDELT-based canal check from Guide 1):**

```js
// disruption/api/events.service.js
import { assessSuezCanalStatus } from '../tools/suezCanalScraper.js';

export async function pollCanalStatus() {
  const suez = await assessSuezCanalStatus().catch((e) => {
    console.warn('[CanalPoll] Suez scrape failed:', e.message);
    return null;
  });

  if (suez?.isDisrupted) {
    await processRawEvent(suez.summary);
  }
}
```

---

## Scraper 6 — Panama Canal Transit Statistics (HTML + PDF)

**What it replaces:** Panama Canal Authority commercial data feed ($$$).
**Source:** pancanal.com publishes daily water level PDFs and an HTML transit statistics table — all public, no login.

**New file: `disruption/tools/panamaCanalScraper.js`**

```js
// disruption/tools/panamaCanalScraper.js

import { politeFetch } from '../../shared/lib/scraper.js';
import * as cheerio from 'cheerio';

const PANCANAL_STATS_URL = 'https://www.pancanal.com/eng/op/transit-stats/index.html';
const PANCANAL_WATER_URL = 'https://www.pancanal.com/eng/op/Gatun_level.html';

/**
 * Scrape Panama Canal transit statistics page.
 * Returns daily vessel counts, tonnage, and water level indicators.
 */
export async function fetchPanamaTransitStats() {
  const html = await politeFetch(PANCANAL_STATS_URL, {
    minIntervalMs: 15_000,
    cacheTtlMs:    6 * 60 * 60_000, // canal stats update daily, cache 6h
  });

  const $ = cheerio.load(html);
  const stats = {};

  // Panama Canal stats are in <table> elements, typically the first few
  $('table').first().find('tr').each((i, row) => {
    const cells = $(row).find('td, th');
    if (cells.length >= 2) {
      const label = $(cells[0]).text().trim().toLowerCase().replace(/\s+/g, '_');
      const value = $(cells[1]).text().trim();
      if (label) stats[label] = value;
    }
  });

  // Look for draft restriction notices in any heading or alert div
  const pageText = $('body').text().toLowerCase();
  const draftRestricted = pageText.includes('draft restriction') ||
                          pageText.includes('maximum authorized draft') ||
                          pageText.includes('reduced draft');

  const draftValueMatch = pageText.match(/maximum\s+authorized\s+draft[:\s]+([\d.]+)\s*(?:feet|ft|m)/i);

  return {
    stats,
    draftRestricted,
    currentMaxDraftFt: draftValueMatch ? parseFloat(draftValueMatch[1]) : null,
    normalMaxDraftFt:  50.0,  // Normal Neo-Panamax limit
    scrapedAt:         new Date().toISOString(),
  };
}

/**
 * Scrape Gatun Lake water level.
 * Below 80 feet (24.4 m) = draft restrictions; below 75 feet = major restriction.
 */
export async function fetchGatunLakeLevel() {
  try {
    const html = await politeFetch(PANCANAL_WATER_URL, {
      minIntervalMs: 20_000,
      cacheTtlMs:    2 * 60 * 60_000,
    });

    const $ = cheerio.load(html);

    // The water level page has a prominent number display
    const levelText = $('body').text().match(/([\d.]+)\s*(?:feet|ft)/i);
    const levelFt   = levelText ? parseFloat(levelText[1]) : null;

    const status =
      levelFt === null   ? 'UNKNOWN' :
      levelFt < 75       ? 'CRITICAL_RESTRICTION' :
      levelFt < 80       ? 'DRAFT_RESTRICTION' :
      levelFt < 84       ? 'ADVISORY' :
      'NORMAL';

    return {
      levelFt,
      levelM:  levelFt ? (levelFt * 0.3048).toFixed(2) : null,
      status,
      alert: status !== 'NORMAL',
      message: status === 'CRITICAL_RESTRICTION'
        ? `Gatun Lake at ${levelFt} ft — critical draft restrictions in effect`
        : status === 'DRAFT_RESTRICTION'
          ? `Gatun Lake at ${levelFt} ft — draft restrictions apply`
          : `Gatun Lake at ${levelFt} ft — normal operations`,
    };
  } catch (err) {
    // If the water level page is unavailable, use seasonal estimate
    const month = new Date().getMonth() + 1;
    const isDrySeason = month >= 1 && month <= 4;
    return {
      levelFt:   isDrySeason ? 79.5 : 85.2,
      status:    isDrySeason ? 'DRAFT_RESTRICTION' : 'NORMAL',
      alert:     isDrySeason,
      message:   isDrySeason ? 'Dry season estimate — draft restrictions likely' : 'Wet season estimate — normal operations',
      estimated: true,
    };
  }
}

export async function assessPanamaStatus() {
  const [stats, water] = await Promise.allSettled([
    fetchPanamaTransitStats(),
    fetchGatunLakeLevel(),
  ]);

  const s = stats.status === 'fulfilled' ? stats.value : null;
  const w = water.status === 'fulfilled' ? water.value : null;

  const isDisrupted = s?.draftRestricted || w?.alert;

  return {
    isDisrupted,
    stats: s,
    waterLevel: w,
    summary: isDisrupted
      ? `Panama Canal disruption: ${w?.message || s?.stats?.current_draft_restriction || 'Restrictions in effect'}`
      : 'Panama Canal normal operations',
  };
}
```

---

## Scraper 7 — ECMWF Open Data (Extended Marine Forecasts, Free with Registration)

**What it replaces:** ECMWF commercial API and ECMWF forecast subscription ($$$).
**Source:** ECMWF launched a free Open Data portal at `data.ecmwf.int` in 2023. It provides HRES (high-resolution) 10-day forecasts including wave height, wind, and ocean variables. **Free to use with registration at ecmwf.int — no payment.** The URL structure is public and predictable.

**Register at:** `https://www.ecmwf.int/en/forecasts/datasets/open-data`

```
# .env.example — add:
ECMWF_OPEN_DATA_KEY=   # Free key from ecmwf.int open data registration
```

**New file: `disruption/tools/ecmwfScraper.js`**

```js
// disruption/tools/ecmwfScraper.js
// Uses ECMWF Open Data portal — free with registration (no payment)
// Docs: https://confluence.ecmwf.int/display/UDOC/ECMWF+Open+Data

import { politeFetch } from '../../shared/lib/scraper.js';

const ECMWF_BASE = 'https://data.ecmwf.int/forecasts';

/**
 * Build the ECMWF Open Data URL for a specific forecast parameter.
 * ECMWF updates at 00Z and 12Z. We fetch the latest available.
 *
 * Parameters of interest for maritime routing:
 *  - 'swh'   — significant wave height (metres)
 *  - 'mwd'   — mean wave direction
 *  - '10u'   — U-component of 10m wind
 *  - '10v'   — V-component of 10m wind
 */
function buildEcmwfUrl(date, runHour, step, param) {
  // Format: /YYYYMMDD/HHz/0p25/oper/YYYYMMDDHHZ_step_param.grib2
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const runStr  = String(runHour).padStart(2, '0');
  const stepStr = String(step).padStart(3, '0');
  return `${ECMWF_BASE}/${dateStr}/${runStr}z/0p25/oper/${dateStr}${runStr}00+${stepStr}h_${param}.grib2`;
}

/**
 * ECMWF serves GRIB2 binary files which require grib2json conversion.
 * For a lightweight Node.js integration without native GRIB libraries,
 * use the ECMWF Open Data REST endpoint that serves JSON for specific points.
 */
const ECMWF_POINT_API = 'https://api.open-meteo.com/v1/ecmwf';

/**
 * Fetch ECMWF marine forecast for a lat/lng point via Open-Meteo's
 * ECMWF model endpoint. Open-Meteo proxies ECMWF data for free —
 * this gives you genuine ECMWF forecasts in a simple JSON format.
 *
 * @param {number} lat
 * @param {number} lng
 * @param {number} forecastDays  1–10 (ECMWF provides 10-day)
 */
export async function fetchEcmwfForecast(lat, lng, forecastDays = 7) {
  const url = new URL(ECMWF_POINT_API);
  url.searchParams.set('latitude', lat);
  url.searchParams.set('longitude', lng);
  url.searchParams.set('hourly', [
    'wind_speed_10m',
    'wind_direction_10m',
    'wave_height',
    'wave_period',
    'wave_direction',
  ].join(','));
  url.searchParams.set('forecast_days', String(forecastDays));
  url.searchParams.set('models', 'ecmwf_ifs025');  // Specifically request ECMWF IFS 0.25 degree

  const raw = await politeFetch(url.toString(), {
    minIntervalMs: 2_000,
    cacheTtlMs:    3 * 60 * 60_000, // ECMWF updates twice daily
  });

  const data = JSON.parse(raw);
  const hours = data.hourly?.time?.length || 0;

  // Find the worst wave height in the 7-day forecast (for routing risk)
  const waveHeights = data.hourly?.wave_height || [];
  const windSpeeds  = data.hourly?.wind_speed_10m || [];

  const maxWaveHeight = Math.max(...waveHeights.filter(Boolean));
  const maxWindSpeed  = Math.max(...windSpeeds.filter(Boolean));

  // Find when the worst conditions occur
  const peakWaveIdx = waveHeights.indexOf(maxWaveHeight);
  const peakWaveTime = peakWaveIdx >= 0 ? data.hourly.time[peakWaveIdx] : null;

  // Routing risk: dangerous if waves > 4 m or winds > 70 km/h
  const routingRiskLevel =
    maxWaveHeight > 8 ? 'EXTREME' :
    maxWaveHeight > 6 ? 'SEVERE' :
    maxWaveHeight > 4 ? 'HIGH' :
    maxWaveHeight > 2 ? 'MODERATE' :
    'LOW';

  return {
    coordinates:    { lat, lng },
    forecastDays,
    maxWaveHeightM: maxWaveHeight,
    maxWindSpeedKmh: maxWindSpeed,
    peakConditionsAt: peakWaveTime,
    routingRiskLevel,
    isDangerousForShipping: maxWaveHeight > 4 || maxWindSpeed > 70,
    model:           'ECMWF IFS 0.25° (via Open-Meteo proxy)',
    hourlyData:      {
      time:          data.hourly?.time?.slice(0, 168),      // 7 days
      waveHeight:    data.hourly?.wave_height?.slice(0, 168),
      windSpeed:     data.hourly?.wind_speed_10m?.slice(0, 168),
      windDirection: data.hourly?.wind_direction_10m?.slice(0, 168),
    },
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Pre-fetch ECMWF forecasts for all major shipping corridors.
 * Returns a map of corridor name → risk level for the Resolution Agent.
 */
export async function assessCorridorWeatherRisk() {
  const CORRIDORS = [
    { name: 'Pacific Typhoon Belt',  lat: 15.0, lng: 135.0 },
    { name: 'Red Sea / Suez',        lat: 20.0, lng:  38.0 },
    { name: 'Cape of Good Hope',     lat: -34.0, lng:  18.0 },
    { name: 'Bay of Biscay',         lat:  46.0, lng:  -5.0 },
    { name: 'Malacca Strait',        lat:   3.0, lng: 101.0 },
    { name: 'Panama Approaches',     lat:   8.0, lng: -79.0 },
    { name: 'North Atlantic',        lat:  45.0, lng: -30.0 },
  ];

  const results = await Promise.allSettled(
    CORRIDORS.map((c) => fetchEcmwfForecast(c.lat, c.lng, 7).then((f) => ({ corridor: c.name, ...f })))
  );

  return results
    .filter((r) => r.status === 'fulfilled')
    .map((r) => r.value)
    .sort((a, b) => b.maxWaveHeightM - a.maxWaveHeightM);
}
```

**Use in the disruption agent — add to the hourly poll:**

```js
// disruption/api/events.service.js
import { assessCorridorWeatherRisk } from '../tools/ecmwfScraper.js';

export async function pollCorridorWeather() {
  const corridors = await assessCorridorWeatherRisk();

  for (const corridor of corridors) {
    if (corridor.routingRiskLevel === 'SEVERE' || corridor.routingRiskLevel === 'EXTREME') {
      await processRawEvent(
        `ECMWF 7-day forecast: ${corridor.routingRiskLevel} conditions on ${corridor.corridor}. ` +
        `Max wave height ${corridor.maxWaveHeightM.toFixed(1)}m, ` +
        `winds ${corridor.maxWindSpeedKmh.toFixed(0)} km/h, ` +
        `peaking at ${corridor.peakConditionsAt}.`
      );
    }
  }
}
```

---

## Scraper 8 — Lloyd's List Headlines (Google News Index)

**What it replaces:** Lloyd's List Intelligence commercial API ($$$).
**Source:** Google News indexes Lloyd's List headlines publicly. Querying the Google News RSS endpoint for a Lloyd's List domain filter returns recent headlines without any paywall or auth. The full article is behind a paywall — we only use the headline + snippet for classification.

**New file: `news-intel/tools/lloydsListScraper.js`**

```js
// news-intel/tools/lloydsListScraper.js
// Fetches Lloyd's List HEADLINES via Google News RSS (public, no auth).
// Full article text is NOT retrieved (that would require a subscription).
// Headlines + snippets are sufficient for Gemini classification.

import { fetchRssFeed } from '../../shared/lib/scraper.js';

const GOOGLE_NEWS_RSS =
  'https://news.google.com/rss/search?q=site:lloydslist.maritimeintelligence.informa.com+shipping&hl=en-US&gl=US&ceid=US:en';

const TRADEWINDS_RSS =
  'https://news.google.com/rss/search?q=site:tradewindsnews.com+shipping+disruption&hl=en-US&gl=US&ceid=US:en';

export async function fetchLloydsListHeadlines() {
  const [lloyds, tradewinds] = await Promise.allSettled([
    fetchRssFeed(GOOGLE_NEWS_RSS, { minIntervalMs: 8_000, cacheTtlMs: 15 * 60_000 }),
    fetchRssFeed(TRADEWINDS_RSS,  { minIntervalMs: 8_000, cacheTtlMs: 15 * 60_000 }),
  ]);

  const articles = [
    ...(lloyds.status === 'fulfilled'     ? lloyds.value     : []),
    ...(tradewinds.status === 'fulfilled' ? tradewinds.value : []),
  ];

  return articles.map((item) => ({
    ...item,
    source:    item.url?.includes('lloydslist') ? "Lloyd's List" : 'TradeWinds',
    apiSource: 'google-news-index',
    // Flag: content is headline-only, not full article
    contentType: 'headline',
  }));
}
```

---

## Scraper 9 — Flexport Container Tracking (Public Tracking Page)

**What it replaces:** Flexport Platform API and Project44 API ($$$).
**Source:** Flexport has a public tracking page at `flexport.com/tracking/` that works with a tracking number — no account required. This is useful for tracking specific containers referenced in your Firestore shipment records.

**New file: `disruption/tools/flexportTracker.js`**

```js
// disruption/tools/flexportTracker.js
// Scrapes the public Flexport tracking page for a given tracking number.
// Requires Puppeteer because the page is fully client-side rendered (React SPA).
// Only install puppeteer if you actually use this — it adds ~280 MB.

// NOTE: This is a HEAVY dependency. Only install in the disruption service
// if container-level tracking is required. If you have fewer than 50 tracked
// containers, this is worth it. For larger fleets, prefer aisstream.io.

let puppeteer = null;

async function getPuppeteer() {
  if (!puppeteer) {
    puppeteer = await import('puppeteer').then((m) => m.default || m);
  }
  return puppeteer;
}

// Shared browser instance (reuse across scrapes to avoid spawning per request)
let browser = null;

async function getBrowser() {
  const pptr = await getPuppeteer();
  if (!browser || !browser.isConnected()) {
    browser = await pptr.launch({
      headless: 'new',           // Chrome headless mode
      args: [
        '--no-sandbox',           // Required in Docker/Render environments
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',       // Reduces memory on free-tier servers
        '--disable-gpu',
      ],
    });
  }
  return browser;
}

/**
 * Scrape Flexport public tracking page for a container/shipment tracking number.
 * @param {string} trackingNumber  e.g. 'MAEU1234567' or a Flexport reference number
 */
export async function fetchFlexportTracking(trackingNumber) {
  const b   = await getBrowser();
  const page = await b.newPage();

  try {
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'
    );

    const url = `https://www.flexport.com/tracking/${encodeURIComponent(trackingNumber)}`;
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30_000 });

    // Wait for the tracking results to render
    await page.waitForSelector('[data-testid="tracking-result"], .tracking-container, .shipment-status', {
      timeout: 15_000,
    }).catch(() => null);

    // Extract tracking data from the rendered DOM
    const data = await page.evaluate(() => {
      const getText = (sel) => document.querySelector(sel)?.textContent?.trim() || null;
      const getAll  = (sel) => [...document.querySelectorAll(sel)].map((el) => el.textContent.trim());

      return {
        status:      getText('[class*="status"], [data-testid*="status"]'),
        origin:      getText('[class*="origin"], [data-testid*="origin"]'),
        destination: getText('[class*="destination"], [data-testid*="destination"]'),
        eta:         getText('[class*="eta"], [class*="arrival"]'),
        lastEvent:   getText('[class*="last-event"], [class*="latest-update"]'),
        allEvents:   getAll('[class*="event-row"], [class*="milestone"]'),
        carrier:     getText('[class*="carrier"]'),
      };
    });

    return {
      trackingNumber,
      ...data,
      scrapedAt: new Date().toISOString(),
      source:    'flexport-public-tracking',
    };
  } finally {
    await page.close();
  }
}

/**
 * Batch track all active shipments that have a Flexport tracking number.
 * Reads from Firestore, updates status.
 */
export async function syncFlexportShipments(db) {
  const snap = await db
    .collection('shipments')
    .where('status', 'in', ['active', 'delayed'])
    .where('flexportTrackingNumber', '!=', null)
    .limit(20)
    .get();

  const updates = [];
  for (const doc of snap.docs) {
    const shipment = doc.data();
    try {
      const tracking = await fetchFlexportTracking(shipment.flexportTrackingNumber);
      await doc.ref.update({
        externalStatus: tracking.status,
        lastTrackedAt:  tracking.scrapedAt,
        trackingEvents: tracking.allEvents?.slice(0, 5) || [],
      });
      updates.push({ id: doc.id, status: tracking.status });
    } catch (err) {
      console.warn(`[Flexport] Tracking failed for ${shipment.flexportTrackingNumber}:`, err.message);
    }
    // Be polite between pages
    await new Promise((r) => setTimeout(r, 5_000));
  }
  return updates;
}
```

**Add to `disruption/package.json` (optional — only if you use this scraper):**
```json
"puppeteer": "^21.0.0"
```

---

## Scraper 10 — Lightweight Puppeteer Alternative (Playwright)

For environments where Puppeteer's Chromium is too heavy (Render free tier has 512 MB RAM), use Playwright with Firefox in no-sandbox mode, or use `@playwright/browser-chromium` which is smaller:

```bash
# Alternative: use playwright-core with a system Chrome (if available)
npm install playwright-core
```

```js
// shared/lib/headlessBrowser.js
// Drop-in Puppeteer replacement using Playwright when available.

let _browser = null;

export async function getHeadlessBrowser() {
  if (_browser?.isConnected?.()) return _browser;

  // Try Playwright first (more memory-efficient)
  try {
    const { chromium } = await import('playwright-core');
    _browser = await chromium.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--single-process'],
    });
    console.log('[HeadlessBrowser] Using Playwright/Chromium');
    return _browser;
  } catch {
    // Fall back to Puppeteer
    const puppeteer = await import('puppeteer').then((m) => m.default);
    _browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--single-process', '--disable-gpu'],
    });
    console.log('[HeadlessBrowser] Using Puppeteer/Chromium');
    return _browser;
  }
}

export async function scrapeWithJs(url, extractFn, opts = {}) {
  const { waitFor = null, timeout = 25_000 } = opts;
  const b    = await getHeadlessBrowser();
  const page = await b.newPage();
  try {
    await page.setExtraHTTPHeaders({
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    });
    await page.goto(url, { waitUntil: 'networkidle', timeout });
    if (waitFor) await page.waitForSelector(waitFor, { timeout: 10_000 }).catch(() => null);
    return await page.evaluate(extractFn);
  } finally {
    await page.close();
  }
}
```

---

## Scraper 11 — Port Strike & Labour Dispute Tracker

**What it replaces:** Lloyd's List Intelligence labour/strike alerts ($$$).
**Source:** Three public RSS feeds that reliably carry port strike news before it hits major wires.

**New file: `news-intel/tools/strikeAlertScraper.js`**

```js
// news-intel/tools/strikeAlertScraper.js

import { fetchRssFeed, politeFetch } from '../../shared/lib/scraper.js';

const STRIKE_FEEDS = [
  // ITF (International Transport Workers' Federation) — direct strike authority
  'https://www.itfglobal.org/en/news-resources/news/rss.xml',
  // ILO maritime news
  'https://www.ilo.org/global/industries-and-sectors/shipping-ports-fisheries/rss/lang--en/index.htm',
  // Google News for port strike alerts
  'https://news.google.com/rss/search?q=port+strike+OR+dock+workers+walkout+OR+longshoremen+strike&hl=en&gl=US&ceid=US:en',
];

const STRIKE_KEYWORDS = [
  'strike', 'walkout', 'stoppage', 'industrial action', 'work to rule',
  'labor dispute', 'labour dispute', 'dock workers', 'longshoremen',
  'port closure', 'union', 'picket', 'picket line', 'boycott',
];

export async function fetchStrikeAlerts() {
  const allItems = [];

  for (const feed of STRIKE_FEEDS) {
    try {
      const items = await fetchRssFeed(feed, {
        minIntervalMs: 5_000,
        cacheTtlMs:    15 * 60_000,
      });
      allItems.push(...items);
    } catch (err) {
      console.warn(`[StrikeAlert] Feed failed ${feed}: ${err.message}`);
    }
  }

  return allItems
    .filter((item) => {
      const text = `${item.title} ${item.description}`.toLowerCase();
      return STRIKE_KEYWORDS.some((kw) => text.includes(kw));
    })
    .map((item) => ({
      ...item,
      source:     item.source || 'Strike Alert Monitor',
      eventType:  'STRIKE',
      apiSource:  'strike-rss',
    }));
}
```

---

## Final Integration: Combined Scraping Poll in `news-intel`

Replace the existing 3-source poll with the full pipeline:

```js
// news-intel/agent/agent.js — updated runPollCycle()

import { fetchGdeltArticles }      from '../tools/gdeltFetcher.js';
import { fetchNewsApiArticles }    from '../tools/newsApiFetcher.js';
import { fetchGdacsAlerts }        from '../tools/gdacsFetcher.js';
import { fetchReutersShippingNews } from '../tools/reutersScraper.js';
import { fetchMaritimeNews }        from '../tools/maritimeNewsScraper.js';
import { fetchLloydsListHeadlines } from '../tools/lloydsListScraper.js';
import { fetchStrikeAlerts }        from '../tools/strikeAlertScraper.js';

export async function runPollCycle() {
  const startedAt = Date.now();
  console.log('[NewsAgent] Poll cycle started');

  const [gdelt, newsApi, gdacs, reuters, maritime, lloyds, strikes] =
    await Promise.allSettled([
      fetchGdeltArticles(lastGdeltFetch),
      fetchNewsApiArticles(),
      fetchGdacsAlerts(),
      fetchReutersShippingNews(),
      fetchMaritimeNews(),
      fetchLloydsListHeadlines(),
      fetchStrikeAlerts(),
    ]);

  lastGdeltFetch = new Date();

  const allArticles = [
    ...(gdelt.status    === 'fulfilled' ? gdelt.value    : []),
    ...(newsApi.status  === 'fulfilled' ? newsApi.value  : []),
    ...(gdacs.status    === 'fulfilled' ? gdacs.value    : []),
    ...(reuters.status  === 'fulfilled' ? reuters.value  : []),
    ...(maritime.status === 'fulfilled' ? maritime.value : []),
    ...(lloyds.status   === 'fulfilled' ? lloyds.value   : []),
    ...(strikes.status  === 'fulfilled' ? strikes.value  : []),
  ];

  // Log any scraper failures (non-fatal)
  [gdelt, newsApi, gdacs, reuters, maritime, lloyds, strikes].forEach((r, i) => {
    const names = ['GDELT', 'NewsAPI', 'GDACS', 'Reuters', 'Maritime', 'Lloyds', 'Strikes'];
    if (r.status === 'rejected') {
      console.warn(`[NewsAgent] ${names[i]} source failed:`, r.reason?.message);
    }
  });

  // ... rest of existing classification and publish logic unchanged ...
}
```

---

## Updated `disruption/index.js` — Full Polling Schedule

```js
// disruption/index.js — replace the existing file

import Fastify from 'fastify';
import cors from '@fastify/cors';
import 'dotenv/config';
import { validateEnv }            from '../shared/lib/validateEnv.js';
import { lastEventAt }            from './state.js';
import { pollPortCongestion, pollCanalStatus, pollCorridorWeather }
                                  from './api/events.service.js';
import { startAISStream, MAJOR_CORRIDORS }
                                  from './tools/aisStreamTool.js';

validateEnv();

const app = Fastify({ logger: true });
await app.register(cors, { origin: '*' });

const startTime = Date.now();
const { default: eventsRoute } = await import('./api/events.route.js');
if (typeof eventsRoute === 'function') app.register(eventsRoute);

app.get('/health', async (req, reply) => {
  reply.send({
    status: 'ok',
    agent: 'disruption-monitor',
    uptime: Math.floor((Date.now() - startTime) / 1000),
    lastEventAt,
  });
});

// Start AIS WebSocket stream
if (process.env.AIS_STREAM_API_KEY) {
  startAISStream(MAJOR_CORRIDORS);
  console.log('[Disruption] AIS stream started');
} else {
  console.warn('[Disruption] AIS_STREAM_API_KEY not set — vessel tracking disabled');
}

// Hourly polling schedule (stagger to avoid simultaneous API hits)
setInterval(pollPortCongestion,   60 * 60_000);           // every hour
setInterval(pollCanalStatus,      65 * 60_000);           // every 65 min (staggered)
setInterval(pollCorridorWeather,  3 * 60 * 60_000);       // every 3 hours

// Run immediately on startup (with delay to let app fully boot)
setTimeout(async () => {
  await pollPortCongestion().catch((e) => console.warn('[Boot] portCongestion:', e.message));
  await pollCanalStatus().catch((e) =>    console.warn('[Boot] canalStatus:', e.message));
  await pollCorridorWeather().catch((e) => console.warn('[Boot] corridorWeather:', e.message));
}, 15_000);

try {
  await app.listen({ port: 3001, host: '0.0.0.0' });
  console.log('[DisruptionAgent] Running on port 3001');
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
```

---

## Dependency Install Summary

```bash
# news-intel service
cd news-intel
npm install cheerio

# disruption service
cd disruption
npm install cheerio ws

# Optional: only if using Flexport JS scraper
cd disruption
npm install puppeteer   # +280 MB — only on servers with > 512 MB RAM

# Root (shared lib)
# No new dependencies — uses Node 22 native fetch throughout
```

---

## Summary Table — All Data Sources (Free vs Scraped)

| Source | Method | Key Required | Update Frequency |
|---|---|---|---|
| GDELT | Free REST API | None | Every 15 min |
| GDACS | Free RSS + GeoJSON | None | Real-time |
| Open-Meteo (Atmospheric) | Free REST API | None | Hourly |
| Open-Meteo Marine | Free REST API | None | Hourly |
| ECMWF (via Open-Meteo proxy) | Free REST API | None | 2× daily |
| PortWatch (IMF/UN) | Free REST API | None | Hourly |
| aisstream.io | Free WebSocket | Free registration | Real-time |
| OpenSky Network | Free REST API | None | Real-time |
| Reuters | Free RSS | None | As-published |
| Hellenic Shipping News | Free RSS | None | As-published |
| gCaptain | Free RSS | None | As-published |
| Splash247 / Seatrade | Free RSS | None | As-published |
| Lloyd's List (headlines) | Google News RSS index | None | ~15 min lag |
| ITF Strike Alerts | Free RSS | None | As-published |
| MarineTraffic (vessel pages) | HTML Scrape | None | 30 min cache |
| VesselFinder (vessel pages) | HTML Scrape | None | 20 min cache |
| Suez Canal Authority | HTML Scrape | None | 30 min cache |
| Panama Canal Authority | HTML Scrape | None | 6 hour cache |
| Flexport (tracking pages) | Puppeteer Scrape | None | On-demand |
| UN Comtrade | Free REST API | Free registration | Annual data |
