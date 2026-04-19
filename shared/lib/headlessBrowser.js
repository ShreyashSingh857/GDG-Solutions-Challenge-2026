let browser = null;

export async function getHeadlessBrowser() {
  if (browser?.isConnected?.()) {
    return browser;
  }

  try {
    const { chromium } = await import('playwright-core');
    browser = await chromium.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--single-process'],
    });
    console.log('[HeadlessBrowser] Using Playwright/Chromium');
    return browser;
  } catch {
    const puppeteer = await import('puppeteer').then((m) => m.default || m);
    browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--single-process', '--disable-gpu'],
    });
    console.log('[HeadlessBrowser] Using Puppeteer/Chromium');
    return browser;
  }
}

export async function scrapeWithJs(url, extractFn, opts = {}) {
  const { waitFor = null, timeout = 25_000 } = opts;
  const instance = await getHeadlessBrowser();
  const page = await instance.newPage();

  try {
    if (typeof page.setExtraHTTPHeaders === 'function') {
      await page.setExtraHTTPHeaders({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      });
    }

    await page.goto(url, { waitUntil: 'networkidle', timeout });

    if (waitFor && typeof page.waitForSelector === 'function') {
      await page.waitForSelector(waitFor, { timeout: 10_000 }).catch(() => null);
    }

    return await page.evaluate(extractFn);
  } finally {
    await page.close();
  }
}

export async function closeHeadlessBrowser() {
  if (!browser) return;

  await browser.close();
  browser = null;
}
