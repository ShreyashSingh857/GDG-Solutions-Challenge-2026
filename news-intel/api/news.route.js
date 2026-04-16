import { db } from '../../shared/db/firebase.js';
import { getLastCycleStats, getRecentAlerts, triggerManualPoll } from './news.service.js';

export default async function newsRoute(app) {
  app.get('/news', async (req) => {
    const limit = Math.min(Number.parseInt(req.query.limit ?? '20', 10), 100);
    return { data: await getRecentAlerts(Number.isNaN(limit) ? 20 : limit), error: null };
  });

  app.get('/news/:id', async (req, reply) => {
    const doc = await db.collection('news_alerts').doc(req.params.id).get();
    if (!doc.exists) {
      return reply.status(404).send({ error: `Alert not found: ${req.params.id}` });
    }
    return { data: { id: doc.id, ...doc.data() }, error: null };
  });

  app.post('/news/poll', async (req, reply) => {
    if (process.env.NODE_ENV !== 'development') {
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (token !== process.env.INTERNAL_TOKEN) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
    }

    const result = await triggerManualPoll();
    return reply.status(result.skipped ? 200 : 201).send({ data: result, error: null });
  });

  app.get('/health', async () => ({
    status: 'ok',
    agent: 'news-intel',
    lastCycle: getLastCycleStats(),
  }));
}