import Fastify from 'fastify';
import cors from '@fastify/cors';
import cron from 'node-cron';
import 'dotenv/config';
import { initDedupStore } from './tools/dedupStore.js';
import { runPollCycle } from './agent/agent.js';
import { getLastCycleStats } from './api/news.service.js';

const app = Fastify({ logger: true });
await app.register(cors, { origin: '*' });

const { default: newsRoute } = await import('./api/news.route.js');
await app.register(newsRoute);

const startTime = Date.now();

app.get('/health', async () => ({
  status: 'ok',
  agent: 'news-intel',
  uptime: Math.floor((Date.now() - startTime) / 1000),
  lastCycle: getLastCycleStats(),
}));

try {
  await app.listen({ port: 3005, host: '0.0.0.0' });
  console.log('[NewsIntel] Listening on :3005');

  await initDedupStore();

  const jitterMs = Math.floor(Math.random() * 30000);
  const schedule = process.env.NEWS_CRON_SCHEDULE ?? '*/15 * * * *';
  const pollIntervalMs = Number.parseInt(process.env.NEWS_POLL_INTERVAL_MS ?? '', 10);

  setTimeout(() => {
    runPollCycle().catch((err) => {
      console.error('[NewsIntel] Initial poll failed:', err.message);
    });

    if (Number.isFinite(pollIntervalMs) && pollIntervalMs > 0) {
      setInterval(() => {
        runPollCycle().catch((err) => {
          console.error('[NewsIntel] Scheduled poll failed:', err.message);
        });
      }, pollIntervalMs);
      console.log(`[NewsIntel] Scheduler active - interval: ${pollIntervalMs}ms`);
      return;
    }

    cron.schedule(schedule, () => {
      runPollCycle().catch((err) => {
        console.error('[NewsIntel] Scheduled poll failed:', err.message);
      });
    });

    console.log(`[NewsIntel] Scheduler active - cron: ${schedule}`);
  }, jitterMs);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}