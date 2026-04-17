import { db } from '../../shared/db/firebase.js';
import { getRecentAlerts, triggerManualPoll } from './news.service.js';

function isFirebaseConfigError(err) {
  return String(err?.message || '').includes('Missing FIREBASE_* env vars');
}

export default async function newsRoute(app) {
  app.get('/news', async (req) => {
    const limit = Math.min(Number.parseInt(req.query.limit ?? '20', 10), 100);
    return { data: await getRecentAlerts(Number.isNaN(limit) ? 20 : limit), error: null };
  });

  app.get('/news/:id', async (req, reply) => {
    try {
      const doc = await db.collection('news_alerts').doc(req.params.id).get();
      if (!doc.exists) {
        return reply.status(404).send({ error: `Alert not found: ${req.params.id}` });
      }
      return { data: { id: doc.id, ...doc.data() }, error: null };
    } catch (err) {
      if (isFirebaseConfigError(err)) {
        return reply.status(503).send({ error: 'Firestore unavailable for news alert lookups' });
      }
      throw err;
    }
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
}