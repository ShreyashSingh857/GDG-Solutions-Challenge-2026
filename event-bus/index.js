import Fastify from 'fastify';
import cors from '@fastify/cors';
import { broker } from './broker.js';
import { TOPICS } from './topics.js';
import { createLogger } from '../shared/lib/logger.js';
import { createMetrics } from '../shared/lib/metrics.js';
import { startTelemetry } from '../shared/lib/telemetry.js';
import { buildHealthPayload } from '../shared/lib/health.js';

const app = Fastify({ logger: true });
await app.register(cors, { origin: '*' });
const logger = createLogger('event-bus');
const metrics = createMetrics('event-bus');
startTelemetry('event-bus');

const startTime = Date.now();
const deadLetterLog = [];
let lastEventAt = null;

app.addHook('onRequest', async (req) => {
  req._startAt = Date.now();
});
app.addHook('onResponse', async (req, reply) => {
  metrics.recordRequest(Date.now() - (req._startAt || Date.now()), reply.statusCode);
});

broker.on('dead-letter', (dlq) => {
  console.error('[EventBus] DEAD-LETTER:', JSON.stringify(dlq));
  deadLetterLog.push({ ...dlq, _at: new Date().toISOString() });
  if (deadLetterLog.length > 100) deadLetterLog.shift();
});

Object.values(TOPICS).forEach((topic) => {
  broker.on(topic, () => {
    lastEventAt = new Date().toISOString();
  });
});

/**
 * Health check - used by UptimeRobot and agents to verify the bus is live.
 */
app.get('/health', async (req, reply) => {
  reply.send(
    buildHealthPayload({
      service: 'event-bus',
      startedAt: startTime,
      lastEventAt,
      pendingQueueDepth: 0,
      extra: {
        topics: Object.values(TOPICS),
        messageCounts: Object.fromEntries(
          Object.values(TOPICS).map((t) => [t, broker.getReplay(t).length])
        ),
      },
    })
  );
});

/**
 * Publish endpoint - any agent POSTs here to emit an event.
 * Body: { topic: string, payload: AgentPayload }
 */
app.post('/publish', async (req, reply) => {
  const { topic, payload } = req.body;

  if (!topic || !payload) {
    return reply.status(400).send({ error: 'topic and payload are required', traceId: payload?.traceId });
  }

  if (!Object.values(TOPICS).includes(topic)) {
    return reply.status(400).send({ error: `Unknown topic: ${topic}. Valid topics: ${Object.values(TOPICS).join(', ')}` });
  }

  broker.publish(topic, payload);
  reply.send({ ok: true, topic, traceId: payload.traceId });
});

/**
 * Subscribe endpoint - agents connect here via SSE to receive events on a topic.
 * On connect, replays the last 50 messages so reconnecting agents don't miss events.
 */
app.get('/subscribe/:topic', async (req, reply) => {
  const { topic } = req.params;

  if (!Object.values(TOPICS).includes(topic)) {
    return reply.status(400).send({ error: `Unknown topic: ${topic}` });
  }

  // Set SSE headers
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // important for Nginx/Render proxies
  });

  const send = (data) => {
    reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Replay missed messages immediately on connect
  const replayMessages = broker.getReplay(topic);
  replayMessages.forEach((msg) => send({ type: 'replay', ...msg }));

  // Subscribe to live events
  const onMessage = (message) => send({ type: 'event', ...message });
  broker.on(topic, onMessage);

  // Clean up on disconnect
  req.raw.on('close', () => {
    broker.off(topic, onMessage);
    console.log(`[EventBus] SSE client disconnected from topic: ${topic}`);
  });

  // Keep-alive ping every 30 seconds
  const keepAlive = setInterval(() => {
    reply.raw.write(': ping\n\n');
  }, 30000);

  req.raw.on('close', () => clearInterval(keepAlive));
});

app.get('/replay/:topic', async (req, reply) => {
  const { topic } = req.params;

  if (!Object.values(TOPICS).includes(topic)) {
    return reply.status(400).send({ error: `Unknown topic: ${topic}` });
  }

  const since = Number(req.query.since || 0);
  reply.send({
    topic,
    since,
    events: broker.getReplaySince(topic, since),
  });
});

app.get('/dead-letters', async (req, reply) => {
  reply.send({ count: deadLetterLog.length, items: deadLetterLog });
});

app.get('/metrics', async (req, reply) => {
  reply.send(metrics.snapshot({
    uptime: Math.floor((Date.now() - startTime) / 1000),
    replayDepthByTopic: Object.fromEntries(
      Object.values(TOPICS).map((t) => [t, broker.getReplay(t).length])
    ),
    deadLetters: deadLetterLog.length,
  }));
});

try {
  await app.listen({ port: 4000, host: '0.0.0.0' });
  logger.info('Service started', { port: 4000 });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
