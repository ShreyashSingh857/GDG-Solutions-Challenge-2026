import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../../shared/db/firebase.js';
import { createAgentPayload } from '../../shared/types/AgentPayload.js';
import { publish } from '../../shared/eventBusClient.js';
import { TOPICS } from '../../event-bus/topics.js';
import { generate, getRateLimitCooldownMs, isRateLimited } from '../../shared/lib/gemini.js';
import { generateWithRetry } from '../../shared/lib/llmJson.js';
import { NEWS_ALERT_RESULT_SCHEMA, validateAndRepair } from '../../shared/lib/validateSchema.js';
import { fetchGdeltArticles } from '../tools/gdeltFetcher.js';
import { fetchNewsApiArticles } from '../tools/newsApiFetcher.js';
import { fetchGdacsAlerts } from '../tools/gdacsFetcher.js';
import { fetchReutersShippingNews } from '../tools/reutersScraper.js';
import { fetchMaritimeNews } from '../tools/maritimeNewsScraper.js';
import { fetchLloydsListHeadlines } from '../tools/lloydsListScraper.js';
import { fetchStrikeAlerts } from '../tools/strikeAlertScraper.js';
import { isDuplicate, markProcessed } from '../tools/dedupStore.js';
import { createNewsAlert, validateNewsAlert } from '../types/NewsAlert.js';
import { setLastCycleStats } from '../api/news.service.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPT = readFileSync(join(__dirname, 'prompt.md'), 'utf-8');
const parsedRelevanceThreshold = Number.parseFloat(process.env.NEWS_RELEVANCE_THRESHOLD ?? '');
const RELEVANCE_THRESHOLD = Number.isFinite(parsedRelevanceThreshold) ? parsedRelevanceThreshold : 0.65;
const MAX_ARTICLES_PER_CALL = 20;
const MAX_ARTICLES_PER_CYCLE = 100; // cap total in-memory article array per poll cycle
const DISRUPTION_AGENT_URL = process.env.DISRUPTION_AGENT_URL ?? 'http://localhost:3001';
const SUPPLY_CHAIN_KEYWORDS = [
  'port', 'vessel', 'shipping', 'cargo', 'container', 'tanker', 'freight',
  'canal', 'suez', 'panama', 'malacca', 'strait', 'congestion', 'strike',
  'typhoon', 'hurricane', 'storm', 'closure', 'disruption', 'delay',
  'sanctions', 'blockade', 'piracy', 'houthi', 'red sea',
];

let lastGdeltFetch = new Date(Date.now() - 30 * 60 * 1000);
let _cycleRunning = false; // prevent overlapping cycles from doubling RAM usage

function isFirebaseConfigError(err) {
  return String(err?.message || '').includes('Missing FIREBASE_* env vars');
}

function buildNewsFallback(article) {
  return {
    sourceUrl: article?.url || '',
    headline: article?.headline || '',
    summary: article?.headline || '',
    relevanceScore: 0,
    disruptionType: 'OTHER',
    severity: 5,
    location: 'Unknown',
    epicenterLat: 0,
    epicenterLng: 0,
    affectedCorridors: [],
  };
}

function hasSupplyChainKeyword(article) {
  const text = `${article?.headline ?? ''} ${article?.summary ?? ''}`.toLowerCase();
  return SUPPLY_CHAIN_KEYWORDS.some((keyword) => text.includes(keyword));
}

export async function injectToDisruptionAgent(description, traceId, maxAttempts = 3, retryDelayMs = 3000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(`${DISRUPTION_AGENT_URL}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description, traceId }),
        signal: AbortSignal.timeout(12_000),
      });
      if (response.ok) return response;
      const body = await response.json().catch(() => ({}));
      console.warn(`[NewsAgent] Inject attempt ${attempt} returned ${response.status}: ${body.error || ''}`);
    } catch (err) {
      console.warn(`[NewsAgent] Inject attempt ${attempt} failed: ${err.message}`);
    }
    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, attempt * retryDelayMs));
    }
  }

  throw new Error(`Disruption injection failed after ${maxAttempts} attempts`);
}

export async function runPollCycle() {
  // Prevent overlapping cycles — two concurrent cycles would double RAM usage
  if (_cycleRunning) {
    console.warn('[NewsAgent] Poll cycle already running, skipping this trigger');
    return { skipped: true };
  }
  _cycleRunning = true;
  const startedAt = Date.now();
  console.log('[NewsAgent] Poll cycle started');

  setLastCycleStats({ isRunning: true });
  try {
    const [gdeltResult, newsApiResult, gdacsResult, reutersResult, maritimeResult, lloydsResult, strikeResult] = await Promise.allSettled([
      fetchGdeltArticles(lastGdeltFetch),
      fetchNewsApiArticles(),
      fetchGdacsAlerts(),
      fetchReutersShippingNews(),
      fetchMaritimeNews(),
      fetchLloydsListHeadlines(),
      fetchStrikeAlerts(),
    ]);

    lastGdeltFetch = new Date();

    const sourceResults = [gdeltResult, newsApiResult, gdacsResult, reutersResult, maritimeResult, lloydsResult, strikeResult];
    const failureCount = sourceResults.filter((result) => result.status === 'rejected').length;

  // Cap total articles per cycle to bound peak RAM usage
    const allArticles = [
      ...(gdeltResult.status === 'fulfilled' ? gdeltResult.value : []),
      ...(newsApiResult.status === 'fulfilled' ? newsApiResult.value : []),
      ...(gdacsResult.status === 'fulfilled' ? gdacsResult.value : []),
      ...(reutersResult.status === 'fulfilled' ? reutersResult.value : []),
      ...(maritimeResult.status === 'fulfilled' ? maritimeResult.value : []),
      ...(lloydsResult.status === 'fulfilled' ? lloydsResult.value : []),
      ...(strikeResult.status === 'fulfilled' ? strikeResult.value : []),
    ].slice(0, MAX_ARTICLES_PER_CYCLE);

    if (gdeltResult.status === 'rejected') {
      console.warn('[NewsAgent] GDELT fetch failed:', gdeltResult.reason?.message);
    }
    if (newsApiResult.status === 'rejected') {
      console.warn('[NewsAgent] NewsAPI fetch failed:', newsApiResult.reason?.message);
    }
    if (gdacsResult.status === 'rejected') {
      console.warn('[NewsAgent] GDACS fetch failed:', gdacsResult.reason?.message);
    }
    if (reutersResult.status === 'rejected') {
      console.warn('[NewsAgent] Reuters RSS fetch failed:', reutersResult.reason?.message);
    }
    if (maritimeResult.status === 'rejected') {
      console.warn('[NewsAgent] Maritime RSS fetch failed:', maritimeResult.reason?.message);
    }
    if (lloydsResult.status === 'rejected') {
      console.warn('[NewsAgent] Lloyds headline fetch failed:', lloydsResult.reason?.message);
    }
    if (strikeResult.status === 'rejected') {
      console.warn('[NewsAgent] Strike alert fetch failed:', strikeResult.reason?.message);
    }

  // Serial dedup check instead of Promise.all to avoid hundreds of
  // simultaneous Supabase connections exhausting the DB connection pool
    const novel = [];
    for (const article of allArticles) {
      const duplicate = await isDuplicate(article.url);
      if (!duplicate) novel.push(article);
    }
    console.log(`[NewsAgent] ${allArticles.length} fetched, ${novel.length} novel`);

    if (!novel.length) {
      const stats = {
        fetched: allArticles.length,
        classified: 0,
        published: 0,
        runAt: new Date().toISOString(),
        isRunning: false,
        sourcesPolled: sourceResults.length,
        sourceFailures: failureCount,
      };
      setLastCycleStats(stats);
      return stats;
    }

    const relevant = novel.filter(hasSupplyChainKeyword);
    const irrelevant = novel.filter((article) => !hasSupplyChainKeyword(article));

    if (irrelevant.length) {
      await Promise.all(irrelevant.map((article) => markProcessed(article.url)));
      console.log(`[NewsAgent] ${irrelevant.length} articles pre-filtered (no supply chain keywords), ${relevant.length} sent to Gemini`);
    }

    const batches = chunk(relevant, MAX_ARTICLES_PER_CALL);
    const classified = [];

    for (const batch of batches) {
      if (isRateLimited()) {
        const cooldownSec = Math.ceil(getRateLimitCooldownMs() / 1000);
        console.warn(`[NewsAgent] Gemini rate-limited (${cooldownSec}s remaining). Marking ${batch.length} articles as processed and deferring classification.`);
        await Promise.all(batch.map((article) => markProcessed(article.url)));
        continue;
      }

      const input = batch.map(({ url, headline, source, publishedAt }) => ({ url, headline, source, publishedAt }));

      let results = [];
      try {
        const modelResult = await generateWithRetry(`${PROMPT}

## Articles to Classify

${JSON.stringify(input, null, 2)}`, PROMPT, {
        maxRetries: 2,
        invokeModel: (retryPrompt) => generate(retryPrompt),
      });

        const parsed = Array.isArray(modelResult.parsed) ? modelResult.parsed : [];
        results = parsed.map((item, index) => {
          const sourceArticle =
            batch.find((article) => article.url === item?.sourceUrl)
            || batch[index]
            || batch[0]
            || {};
          const fallback = buildNewsFallback(sourceArticle);
          const repaired = validateAndRepair(item, NEWS_ALERT_RESULT_SCHEMA, fallback);
          if (repaired.errors.length) {
            console.warn(`[NewsAgent] Repaired ${repaired.errors.length} fields for ${fallback.sourceUrl || 'unknown article'}`);
          }
          return repaired.data;
        });
      } catch (err) {
        console.error('[NewsAgent] Gemini classify failed for batch:', err.message);
      }

      await Promise.all(batch.map((article) => markProcessed(article.url)));

      for (const result of results) {
        const original = batch.find((article) => article.url === result.sourceUrl);
        if (original) {
          classified.push({ ...original, ...result });
        }
      }
    }

    const actionable = classified.filter((item) => Number(item.relevanceScore) >= RELEVANCE_THRESHOLD);
    console.log(`[NewsAgent] ${classified.length} classified, ${actionable.length} actionable`);

    let published = 0;
    for (const item of actionable) {
      try {
        await publishNewsAlert(item);
        published += 1;
      } catch (err) {
        console.error(`[NewsAgent] Alert publish failed for ${item.sourceUrl}:`, err.message);
      }
    }

    console.log(`[NewsAgent] Cycle complete in ${Date.now() - startedAt}ms | published: ${published}`);
    const stats = {
      fetched: allArticles.length,
      classified: classified.length,
      published,
      runAt: new Date().toISOString(),
      isRunning: false,
      sourcesPolled: sourceResults.length,
      sourceFailures: failureCount,
    };
    setLastCycleStats(stats);
    return stats;
  } finally {
    _cycleRunning = false;
    setLastCycleStats({ isRunning: false });
  }
}

async function publishNewsAlert(item) {
  const alert = createNewsAlert({
    sourceUrl: item.url,
    headline: item.headline,
    summary: item.summary ?? item.headline,
    source: item.source,
    publishedAt: item.publishedAt,
    relevanceScore: item.relevanceScore,
    disruptionType: item.disruptionType ?? 'OTHER',
    severity: item.severity ?? 5,
    location: item.location ?? 'Unknown',
    epicenterLat: item.epicenterLat ?? item.lat ?? 0,
    epicenterLng: item.epicenterLng ?? item.lng ?? 0,
    affectedCorridors: item.affectedCorridors ?? [],
    apiSource: item.apiSource ?? 'gdelt',
  });

  validateNewsAlert(alert);

  try {
    await db.collection('news_alerts').doc(alert.id).set(alert);
  } catch (err) {
    if (isFirebaseConfigError(err)) {
      console.warn('[NewsAgent] Firestore unavailable. Skipping news_alerts persistence for this cycle.');
    } else {
      throw err;
    }
  }

  const payload = createAgentPayload('news-intel', alert);
  await publish(TOPICS.NEWS_ALERTS, payload);

  const description = [
    `[NEWS ALERT] ${alert.headline}`,
    `Source: ${alert.source} | Published: ${alert.publishedAt}`,
    `Location: ${alert.location}`,
    `Affected corridors: ${alert.affectedCorridors.join(', ')}`,
    `Summary: ${alert.summary}`,
  ].join('\n');

  await injectToDisruptionAgent(description, payload.traceId);

  try {
    await db.collection('news_alerts').doc(alert.id).update({ injected: true });
  } catch (err) {
    if (!isFirebaseConfigError(err)) {
      throw err;
    }
  }
  console.log(`[NewsAgent] Alert published + injected | traceId: ${payload.traceId}`);
  return alert;
}

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}
