const DEFAULT_HEADERS = {
  'User-Agent':
    'GDG-SupplyChainMonitor/1.0 (supply-chain-disruption-detection; contact: dev@gdg.local)',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'Accept-Encoding': 'gzip, deflate, br',
  Connection: 'keep-alive',
};

const lastRequestTime = new Map();
const responseCache = new Map();

export async function politeFetch(url, opts = {}) {
  const {
    minIntervalMs = 3_000,
    cacheTtlMs = 15 * 60_000,
    headers = {},
  } = opts;

  const cached = responseCache.get(url);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.data;
  }

  const hostname = new URL(url).hostname;
  const lastReq = lastRequestTime.get(hostname) || 0;
  const wait = minIntervalMs - (Date.now() - lastReq);
  if (wait > 0) await sleep(wait);

  let attempt = 0;
  while (attempt < 4) {
    try {
      const res = await fetch(url, {
        headers: { ...DEFAULT_HEADERS, ...headers },
        signal: AbortSignal.timeout(20_000),
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

export async function politeJsonFetch(url, opts = {}) {
  const raw = await politeFetch(url, {
    ...opts,
    headers: { ...opts.headers, Accept: 'application/json' },
  });
  return JSON.parse(raw);
}

export async function fetchRssFeed(url, opts = {}) {
  const xml = await politeFetch(url, opts);
  const items = [];

  const itemRx = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  const entryRx = /<entry[^>]*>([\s\S]*?)<\/entry>/gi;
  const getTag = (block, tag) => {
    const m = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i').exec(block);
    return m ? m[1].trim() : null;
  };

  let match;
  const regex = xml.includes('<entry') ? entryRx : itemRx;
  while ((match = regex.exec(xml)) !== null) {
    const block = match[1];
    const rawLink = extractLink(block) || getTag(block, 'guid') || '';
    items.push({
      title: stripHtml(getTag(block, 'title') || ''),
      url: normalizeUrl(rawLink, url),
      description: stripHtml(getTag(block, 'description') || getTag(block, 'summary') || ''),
      publishedAt: parseDate(getTag(block, 'pubDate') || getTag(block, 'published') || ''),
      source: new URL(url).hostname,
    });
  }

  return items;
}

function stripHtml(str) {
  return str
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
}

function extractLink(block) {
  const atomLinkMatches = [...block.matchAll(/<link\b([^>]*)\/?>(?:[\s\S]*?<\/link>)?/gi)];
  if (atomLinkMatches.length > 0) {
    for (const match of atomLinkMatches) {
      const attrs = match[1] || '';
      const rel = /\brel=["']([^"']+)["']/i.exec(attrs)?.[1]?.toLowerCase();
      const href = /\bhref=["']([^"']+)["']/i.exec(attrs)?.[1]?.trim();
      if (!href) continue;
      if (!rel || rel === 'alternate') return href;
    }
    const firstHref = /\bhref=["']([^"']+)["']/i.exec(atomLinkMatches[0][1] || '')?.[1]?.trim();
    if (firstHref) return firstHref;
  }

  return getTextLink(block);
}

function getTextLink(block) {
  const m = /<link[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i.exec(block);
  return m ? m[1].trim() : null;
}

function normalizeUrl(maybeUrl, baseUrl) {
  if (!maybeUrl) return '';
  try {
    return new URL(maybeUrl, baseUrl).toString();
  } catch {
    return maybeUrl;
  }
}

function parseDate(str) {
  if (!str) return new Date().toISOString();
  try {
    return new Date(str).toISOString();
  } catch {
    return new Date().toISOString();
  }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function resetScraperState() {
  lastRequestTime.clear();
  responseCache.clear();
}