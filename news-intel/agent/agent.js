import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../../shared/db/firebase.js';
import { createAgentPayload } from '../../shared/types/AgentPayload.js';
import { publish } from '../../shared/eventBusClient.js';
import { TOPICS } from '../../event-bus/topics.js';
import { generate } from '../../shared/lib/gemini.js';
import { fetchGdeltArticles } from '../tools/gdeltFetcher.js';
import { fetchNewsApiArticles } from '../tools/newsApiFetcher.js';
import { fetchGdacsAlerts } from '../tools/gdacsFetcher.js';
import { fetchReutersShippingNews } from '../tools/reutersScraper.js';
import { fetchMaritimeNews } from '../tools/maritimeNewsScraper.js';
import { isDuplicate, markProcessed } from '../tools/dedupStore.js';
import { createNewsAlert, validateNewsAlert } from '../types/NewsAlert.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPT = readFileSync(join(__dirname, 'prompt.md'), 'utf-8');
const RELEVANCE_THRESHOLD = 0.65;
const MAX_ARTICLES_PER_CALL = 20;
const DISRUPTION_AGENT_URL = process.env.DISRUPTION_AGENT_URL ?? 'http://localhost:3001';

let lastGdeltFetch = new Date(Date.now() - 30 * 60 * 1000);

function isFirebaseConfigError(err) {
  return String(err?.message || '').includes('Missing FIREBASE_* env vars');
}

export async function runPollCycle() {
  const startedAt = Date.now();
  console.log('[NewsAgent] Poll cycle started');

  const [gdeltResult, newsApiResult, gdacsResult, reutersResult, maritimeResult] = await Promise.allSettled([
    fetchGdeltArticles(lastGdeltFetch),
    fetchNewsApiArticles(),
    fetchGdacsAlerts(),
    fetchReutersShippingNews(),
    fetchMaritimeNews(),
  ]);

  lastGdeltFetch = new Date();

  const allArticles = [
    ...(gdeltResult.status === 'fulfilled' ? gdeltResult.value : []),
    ...(newsApiResult.status === 'fulfilled' ? newsApiResult.value : []),
    ...(gdacsResult.status === 'fulfilled' ? gdacsResult.value : []),
    ...(reutersResult.status === 'fulfilled' ? reutersResult.value : []),
    ...(maritimeResult.status === 'fulfilled' ? maritimeResult.value : []),
  ];

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

  const novel = allArticles.filter((article) => !isDuplicate(article.url));
  console.log(`[NewsAgent] ${allArticles.length} fetched, ${novel.length} novel`);

  if (!novel.length) {
    return { fetched: allArticles.length, classified: 0, published: 0 };
  }

  const batches = chunk(novel, MAX_ARTICLES_PER_CALL);
  const classified = [];

  for (const batch of batches) {
    const input = batch.map(({ url, headline, source, publishedAt }) => ({ url, headline, source, publishedAt }));

    let results = [];
    try {
      const raw = await generate(`${PROMPT}

## Articles to Classify

${JSON.stringify(input, null, 2)}`);
      const parsed = JSON.parse(raw);
      results = Array.isArray(parsed) ? parsed : [];
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
  return { fetched: allArticles.length, classified: classified.length, published };
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

  const response = await fetch(`${DISRUPTION_AGENT_URL}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description, traceId: payload.traceId }),
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(`Disruption injection failed: ${errorBody.error ?? response.statusText}`);
  }

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