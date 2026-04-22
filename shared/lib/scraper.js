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
const circuitBreakers = new Map();

function getCircuitBreakerState(hostname) {
  if (!circuitBreakers.has(hostname)) {
    circuitBreakers.set(hostname, {
      failures: 0,
      pausedUntil: 0,
    });
  }

  return circuitBreakers.get(hostname);
}

function isCircuitOpen(hostname) {
  const state = getCircuitBreakerState(hostname);
  return Date.now() < state.pausedUntil;
}

function recordScraperFailure(hostname) {
  const state = getCircuitBreakerState(hostname);
  state.failures += 1;
  if (state.failures >= 5) {
    state.pausedUntil = Date.now() + 15 * 60_000;
    console.warn(`[Scraper] Circuit open for ${hostname} until ${new Date(state.pausedUntil).toISOString()}`);
  }
}

function recordScraperSuccess(hostname) {
  const state = getCircuitBreakerState(hostname);
  state.failures = 0;
  state.pausedUntil = 0;
}

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
  if (isCircuitOpen(hostname)) {
    throw new Error(`[Scraper] Circuit breaker open for ${hostname}`);
  }

  const lastReq = lastRequestTime.get(hostname) || 0;
  const wait = minIntervalMs - (Date.now() - lastReq);
  if (wait > 0) await sleep(wait);

  const { retryWithBackoff } = await import('./retryWithBackoff.js');

  try {
    const data = await retryWithBackoff(async () => {
      const res = await fetch(url, {
        headers: { ...DEFAULT_HEADERS, ...headers },
        signal: AbortSignal.timeout(20_000),
        redirect: 'follow',
      });

      lastRequestTime.set(hostname, Date.now());

      if (res.status === 429 || res.status === 503) {
        recordScraperFailure(hostname);
        throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
      }

      if (!res.ok) {
        recordScraperFailure(hostname);
        throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
      }

      recordScraperSuccess(hostname);
      return await res.text();
    }, { maxRetries: 4, baseDelayMs: 5_000 });

    responseCache.set(url, { data, expiresAt: Date.now() + cacheTtlMs });
    return data;
  } catch (err) {
    recordScraperFailure(hostname);
    throw err;
  }
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
  circuitBreakers.clear();
}