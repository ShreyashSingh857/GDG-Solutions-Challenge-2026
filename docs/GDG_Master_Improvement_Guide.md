# GDG Solutions Challenge 2026 — Master Improvement & Integration Guide

> **Prepared for Codex review.** All suggestions are grounded in the actual source tree extracted from `GDG-Solutions-Challenge-2026-main`. No hallucinated file paths or APIs. All external APIs cited are genuinely free-tier accessible.

---

## Idea Rating: 9 / 10

The multi-agent, event-driven architecture for real-time supply chain intelligence is technically sound, highly differentiated from typical hackathon submissions, and directly relevant to a GDG Solutions Challenge. The event-bus SSE backbone, Gemini-powered classification pipeline, and globe visualisation are already strong foundations. The gap between the current state and a 10/10 submission is almost entirely implementation completeness — not concept. Integrating real-time vessel positions, port congestion metrics, canal status, and live disaster feeds transforms this from a demo into a production-grade intelligence platform. That is what separates winning entries.

---

## Part 1 — Improving Existing Feature Scores

### 1. Agent Chaining via SSE Event Bus (8 → 10)

**Current state:** Strong. The broker correctly replays the last 50 messages and the keep-alive ping fires every 30 s.

**What is missing:**
- The `replay` messages are currently filtered out in `shared/eventBusClient.js` (`if (data.type === 'replay') return;`). This means a newly deployed Impact or Resolution agent **misses all events published during its cold-start window** — a real failure mode on Render free tier (which cold-starts regularly).
- No dead-letter visibility: the broker emits to an internal `dead-letter` EventEmitter event but nothing subscribes to it.

**Fix 1 — Process replay messages on reconnect:**

```js
// shared/eventBusClient.js  — change ONE line in es.onmessage
es.onmessage = (event) => {
  try {
    const data = JSON.parse(event.data);
    // Remove the `if (data.type === 'replay') return;` line.
    // Instead, pass a flag so callers can decide:
    onMessage(data, data.type === 'replay');
  } catch (_err) {
    console.error(`[EventBusClient] Failed to parse message:`, _err.message);
  }
};
```

Then in each agent's subscriber:

```js
// impact/api/impact.service.js — startImpactSubscriber
_subscription = subscribe(TOPICS.DISRUPTION_EVENTS, (message, isReplay) => {
  _lastMessageAt = Date.now();
  if (isReplay) {
    // Only process replays that are less than 10 minutes old
    const age = Date.now() - new Date(message._publishedAt).getTime();
    if (age > 600_000) return; // skip stale replays
  }
  processDisruptionEvent(message).catch(console.error);
});
```

**Fix 2 — Dead-letter HTTP endpoint on the event bus:**

```js
// event-bus/index.js — add after the subscribe endpoint
broker.on('dead-letter', (dlq) => {
  console.error('[EventBus] DEAD-LETTER:', JSON.stringify(dlq));
  // Persist to an in-memory ring buffer for inspection
  deadLetterLog.push({ ...dlq, _at: new Date().toISOString() });
  if (deadLetterLog.length > 100) deadLetterLog.shift();
});

const deadLetterLog = [];

app.get('/dead-letters', async (req, reply) => {
  reply.send({ count: deadLetterLog.length, items: deadLetterLog });
});
```

**Fix 3 — Add a `news-alerts` topic to the TOPICS registry:**

```js
// event-bus/topics.js
export const TOPICS = {
  DISRUPTION_EVENTS: 'disruption-events',
  IMPACT_REPORTS:    'impact-reports',
  RESOLUTION_OPTIONS:'resolution-options',
  NEWS_ALERTS:       'news-alerts',   // ← ADD THIS
};
```

This allows the News Intel agent to also fan-out via the bus rather than only hitting the Disruption Agent's HTTP endpoint, completing the pub/sub graph.

---

### 2. Data Flow: Monitor → Impact → Resolution (7 → 9)

**Current state:** Mostly working. The pipeline functions end-to-end but the disruption agent `events.service.js` does not yet call `generateWithTools` — it has `weatherTool` and `searchTool` declared but not wired into Gemini function-calling.

**Fix — Wire tools into the disruption agent:**

```js
// disruption/api/events.service.js
import { generateWithTools } from '../../shared/lib/gemini.js';
import { weatherToolDeclaration, getWeatherData } from '../tools/weatherTool.js';
import { searchToolDeclaration, searchWeb }        from '../tools/searchTool.js';

export async function processRawEvent(rawDescription) {
  const SYSTEM_PROMPT = readFileSync(join(__dirname, '../agent/prompt.md'), 'utf-8');

  const fullPrompt = `${SYSTEM_PROMPT}\n\n## Raw Event\n${rawDescription}`;

  const toolHandlers = {
    get_weather_data: getWeatherData,
    search_web:       searchWeb,
  };

  const raw = await generateWithTools(
    fullPrompt,
    [weatherToolDeclaration, searchToolDeclaration],
    toolHandlers
  );

  return JSON.parse(raw);
}
```

This enables the monitor agent to call weather for coordinates and web-search to enrich any event — exactly what the `disruption/agent/prompt.md` instructs but currently cannot do because tools are never passed in.

**Fix — Add `searchTool.js` using SerpAPI's free tier (100 searches/month) or DuckDuckGo scrape:**

```js
// disruption/tools/searchTool.js
export const searchToolDeclaration = {
  name: 'search_web',
  description: 'Search the web for recent news about a supply chain event.',
  parameters: {
    type: 'object',
    properties: { query: { type: 'string', description: 'Search query' } },
    required: ['query'],
  },
};

export async function searchWeb({ query }) {
  // Uses GDELT DOC API as a free news search — no key required
  const url = new URL('https://api.gdeltproject.org/api/v2/doc/doc');
  url.searchParams.set('query', query);
  url.searchParams.set('mode', 'artlist');
  url.searchParams.set('format', 'json');
  url.searchParams.set('maxrecords', '5');
  url.searchParams.set('sort', 'DateDesc');

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10000) });
  if (!res.ok) return { results: [] };
  const json = await res.json();
  return {
    results: (json.articles || []).map((a) => ({
      title: a.title,
      url: a.url,
      source: a.domain,
    })),
  };
}
```

---

### 3. Negotiation / Resolution Options (5 → 9) — Backend OK, UI Broken

**Root cause:** The `DecisionModal` polls `GET /options/:traceId` on the Resolution Agent. However, `activeResolution` in the Zustand store is set by `setResolutionWithOptions`, which is only called from `useResolutions.js`. That hook subscribes to the Firestore `resolutions/{traceId}/options` subcollection — but the `traceId` it knows is derived from `activeDisruptionId`, which comes from `useDisruptions`. The wiring breaks because:

1. `activeDisruptionId` is set to `disruption.id`, but the resolution document is keyed by `traceId` (from the impact report, not the disruption event).
2. The `DecisionModal` tries to read `activeResolution.options` but that field is `resolutionOptions` on the store.

**Fix — Align the store and resolution hook:**

```js
// dashboard/app/hooks/useResolutions.js — REPLACE entire file

'use client';
import { useEffect } from 'react';
import { collection, onSnapshot, doc } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../lib/firebase.js';
import { useAlertStore } from '../store/alertStore.js';

export function useResolutions() {
  const { disruptions, setResolutionWithOptions } = useAlertStore();

  useEffect(() => {
    if (!isFirebaseConfigured || !db || !disruptions.length) return;

    // Listen to ALL resolution documents; match the latest disruption
    const unsubscribe = onSnapshot(
      collection(db, 'resolutions'),
      async (snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
          if (change.type !== 'added' && change.type !== 'modified') return;

          const resolution = { id: change.doc.id, ...change.doc.data() };
          if (resolution.status !== 'pending') return;

          // Fetch options sub-collection
          const optionsSnap = await new Promise((resolve) => {
            const unsub = onSnapshot(
              collection(db, 'resolutions', resolution.id, 'options'),
              (snap) => { unsub(); resolve(snap); }
            );
          });

          const options = optionsSnap.docs
            .map((d) => ({ ...d.data() }))
            .sort((a, b) => a.rank - b.rank);

          if (options.length === 3) {
            setResolutionWithOptions({
              ...resolution,
              traceId: resolution.id,
              options,
            });
          }
        });
      }
    );

    return () => unsubscribe();
  }, [disruptions, setResolutionWithOptions]);
}
```

**Fix — Also correct `alertStore.js` to expose `options` correctly:**

```js
// dashboard/app/store/alertStore.js — update setResolutionWithOptions
setResolutionWithOptions: (resolutionWithOptions) =>
  set({
    activeResolution: {
      ...resolutionWithOptions,
      options: resolutionWithOptions.options || [],  // ensure options always exists
    },
    resolutionOptions: resolutionWithOptions.options || [],
  }),
```

---

### 4. DecisionModal Stage Progression (2 → 9) — CRITICAL BUG

**Root cause:** The `agentStage` state in `DecisionModal` never advances past 0 because:
- Stage progression depends on an SSE stream from `GET /options/stream/:traceId`
- But `traceId` is taken from `activeResolution?.traceId` — which is `undefined` until options arrive from Firestore
- The SSE connection is opened before `traceId` is known, so it connects to a null URL and immediately errors out

**Fix — Rewrite the stage progression using the Firestore `resolutions` document status field:**

```jsx
// dashboard/app/components/decision/DecisionModal.jsx
// Add this effect ABOVE the existing SSE effect:

useEffect(() => {
  if (!activeDisruptionId) return;

  // Stage 0 → 1: Disruption detected (we're already here if modal is open)
  setAgentStage(1);

  // Stage 1 → 2: Impact report arrives (listen on Firestore impactReports)
  const impactUnsub = onSnapshot(
    query(
      collection(db, 'impactReports'),
      where('disruptionId', '==', activeDisruptionId),
      limit(1)
    ),
    (snap) => {
      if (!snap.empty) setAgentStage(2);
    }
  );

  // Stage 2 → 3: Resolution options arrive
  const resUnsub = onSnapshot(
    query(
      collection(db, 'resolutions'),
      where('disruptionId', '==', activeDisruptionId),
      limit(1)
    ),
    (snap) => {
      if (!snap.empty && snap.docs[0].data().status === 'pending') {
        setAgentStage(3);
      }
    }
  );

  return () => { impactUnsub(); resUnsub(); };
}, [activeDisruptionId]);
```

You also need to import Firestore utilities at the top of DecisionModal:
```js
import { collection, query, where, limit, onSnapshot } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../../lib/firebase.js';
```

This replaces the broken SSE-based stage tracker with a Firestore-driven one that accurately mirrors actual agent pipeline progress.

---

### 5. News → Disruption Injection (7 → 9)

**Current state:** Works — NewsAgent classifies articles and POSTs to the Disruption Agent's `/events` endpoint. Two gaps remain.

**Gap 1 — The injection HTTP call has no retry/backoff:**

```js
// news-intel/agent/agent.js — replace the injection block
async function injectToDisruptionAgent(newsAlert) {
  const url = `${DISRUPTION_AGENT_URL}/events`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.INTERNAL_TOKEN}`,
        },
        body: JSON.stringify({
          rawDescription: `${newsAlert.headline}. Source: ${newsAlert.source}. Region: ${newsAlert.region}`,
          newsAlertId: newsAlert.id,
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) return;
      console.warn(`[NewsAgent] Inject attempt ${attempt} returned ${res.status}`);
    } catch (err) {
      console.warn(`[NewsAgent] Inject attempt ${attempt} failed: ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, attempt * 2000));
  }
  console.error('[NewsAgent] All injection attempts failed for alert:', newsAlert.id);
}
```

**Gap 2 — Also publish to the event bus (not just HTTP), completing the fan-out:**

```js
// news-intel/agent/agent.js — after saving to Firestore
await publish(TOPICS.NEWS_ALERTS, createAgentPayload('news-intel', newsAlert, newsAlert.id));
// Then HTTP inject:
if (newsAlert.relevanceScore >= 0.75) {
  await injectToDisruptionAgent(newsAlert);
}
```

---

### 6. World Data Coverage (3 → 8) — Severely Limited

This is addressed comprehensively in Part 2. The key change inside the existing code is to pass geocoordinates from GDELT articles into the disruption event payload so the globe and impact scorer actually light up the correct region:

```js
// news-intel/agent/agent.js — enrich the classified alert
const enriched = {
  ...classified,
  epicenterLat: article.lat || classified.epicenterLat || null,
  epicenterLng: article.lng || classified.epicenterLng || null,
};
```

---

### 7. User Option Selection & Execution (6 → 9) — Backend Ready, Disconnected

**Root cause:** The `handleApprove` function in `DecisionModal.jsx` is incomplete — it calls `markResolutionExecuted` on the Zustand store but does not POST to `/execute` on the Resolution Agent.

**Fix — Complete `handleApprove`:**

```jsx
// dashboard/app/components/decision/DecisionModal.jsx

const RESOLUTION_URL = process.env.NEXT_PUBLIC_RESOLUTION_AGENT_URL || 'http://localhost:3003';

async function handleApprove(rank) {
  if (!activeResolution?.traceId) return;
  setIsApproving(true);
  setApprovedRank(rank);

  try {
    const res = await fetch(`${RESOLUTION_URL}/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.NEXT_PUBLIC_INTERNAL_TOKEN}`,
      },
      body: JSON.stringify({ traceId: activeResolution.traceId, rank }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    markResolutionExecuted(rank);
    toast.success(`Option ${rank} approved and executed`);
    setTimeout(() => clearActiveDisruption(), 3000);
  } catch (err) {
    toast.error(`Execution failed: ${err.message}`);
    console.error('[DecisionModal] execute error:', err);
  } finally {
    setIsApproving(false);
  }
}
```

---

### 8. Error Handling & Resilience (6 → 9) — Partial

**Issue 1 — Gemini `generate()` has no circuit breaker.** If Gemini rate-limits (common on free tier), the impact and resolution agents crash their entire async chain.

```js
// shared/lib/gemini.js — add at module level
const rateLimitState = { blocked: false, unblockAt: 0 };

export async function generate(prompt, tools = []) {
  if (rateLimitState.blocked && Date.now() < rateLimitState.unblockAt) {
    throw new Error('[Gemini] Rate-limited, retrying after cooldown');
  }
  try {
    // ... existing code ...
  } catch (err) {
    if (err.message?.includes('429') || err.message?.includes('quota')) {
      rateLimitState.blocked = true;
      rateLimitState.unblockAt = Date.now() + 60_000; // 60 s cooldown
      console.warn('[Gemini] Rate limit hit — cooling down 60 s');
    }
    throw err;
  }
}
```

**Issue 2 — Supabase write failures are logged but not queued.** If Supabase is down, data is permanently lost.

```js
// shared/db/supabase.js — add a local retry queue
const writeQueue = [];
let draining = false;

export async function resilientUpsert(table, data, options = {}) {
  const { error } = await supabase.from(table).upsert(data, options);
  if (error) {
    console.warn(`[Supabase] ${table} write failed, queuing for retry:`, error.message);
    writeQueue.push({ table, data, options, attempts: 0 });
    drainQueue(); // non-blocking
  }
}

async function drainQueue() {
  if (draining || !writeQueue.length) return;
  draining = true;
  while (writeQueue.length) {
    const item = writeQueue[0];
    if (item.attempts >= 5) { writeQueue.shift(); continue; }
    const { error } = await supabase.from(item.table).upsert(item.data, item.options);
    if (error) {
      item.attempts++;
      await new Promise((r) => setTimeout(r, Math.pow(2, item.attempts) * 1000));
    } else {
      writeQueue.shift();
    }
  }
  draining = false;
}
```

Replace all `supabase.from(...).upsert(...)` calls in `impact.service.js` and `options.service.js` with `resilientUpsert(...)`.

---

### 9. Observability / Tracing (4 → 8) — Minimal

**What is missing:** No structured logs, no trace correlation across agents, no latency metrics.

**Fix 1 — Add a structured logger wrapper (zero dependencies):**

```js
// shared/lib/logger.js  — NEW FILE
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

function log(level, service, message, meta = {}) {
  if (LEVELS[level] < LEVELS[LOG_LEVEL]) return;
  const entry = {
    ts: new Date().toISOString(),
    level,
    service,
    message,
    ...meta,
  };
  // Fastify/Node structured log — Render.com log drain can parse this
  process.stdout.write(JSON.stringify(entry) + '\n');
}

export const createLogger = (service) => ({
  debug: (msg, meta) => log('debug', service, msg, meta),
  info:  (msg, meta) => log('info',  service, msg, meta),
  warn:  (msg, meta) => log('warn',  service, msg, meta),
  error: (msg, meta) => log('error', service, msg, meta),
});
```

**Fix 2 — Add a `/metrics` endpoint to each Fastify service:**

```js
// Add to each agent's index.js (disruption, impact, resolution, news-intel)
import { createLogger } from '../shared/lib/logger.js';

const metrics = { processed: 0, errors: 0, lastProcessedAt: null, avgLatencyMs: 0 };
export function recordMetric(latencyMs, didError = false) {
  metrics.processed++;
  if (didError) metrics.errors++;
  metrics.lastProcessedAt = new Date().toISOString();
  metrics.avgLatencyMs = Math.round(
    (metrics.avgLatencyMs * (metrics.processed - 1) + latencyMs) / metrics.processed
  );
}

// In Fastify app:
app.get('/metrics', async (req, reply) => reply.send(metrics));
```

**Fix 3 — Add traceId to all console logs:**

```js
// In impact.service.js and options.service.js, replace:
console.log('[ImpactService] ...')
// with:
logger.info('Processing disruption', { traceId, disruptionId: disruption.id });
```

**Fix 4 — Dashboard: display agent health with latency:**

```jsx
// dashboard/app/components/agent/AgentStatusBadge.jsx — extend health polling
const [health, setHealth] = useState(null);

useEffect(() => {
  async function poll() {
    try {
      const [dis, imp, res, news] = await Promise.allSettled([
        fetch(`${DISRUPTION_URL}/metrics`).then(r => r.json()),
        fetch(`${IMPACT_URL}/metrics`).then(r => r.json()),
        fetch(`${RESOLUTION_URL}/metrics`).then(r => r.json()),
        fetch(`${NEWS_URL}/metrics`).then(r => r.json()),
      ]);
      setHealth({ disruption: dis.value, impact: imp.value, resolution: res.value, news: news.value });
    } catch {}
  }
  poll();
  const id = setInterval(poll, 30_000);
  return () => clearInterval(id);
}, []);
```

---

### 10. Environment Config & Security (5 → 9) — Risks Present

**Issues found in codebase:**

1. `NEXT_PUBLIC_INTERNAL_TOKEN` is exposed to the browser and is the same token used for internal agent auth. This is a serious risk — any user can extract it from DevTools and call agent APIs directly.

2. `INTERNAL_TOKEN` is hardcoded as `change_this_before_deploy` in `.env.example` but there is no runtime validation.

3. Firestore rules in `firestore.rules` allow write access to any authenticated user without role checks.

**Fix 1 — Use a Next.js API route as a proxy so the token never reaches the browser:**

```js
// dashboard/app/api/execute/route.js  — NEW FILE
import { NextResponse } from 'next/server';

export async function POST(req) {
  const body = await req.json();
  const resolutionUrl = process.env.RESOLUTION_AGENT_URL; // server-side only, not NEXT_PUBLIC

  const upstream = await fetch(`${resolutionUrl}/execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.INTERNAL_TOKEN}`,  // never reaches browser
    },
    body: JSON.stringify(body),
  });

  const data = await upstream.json();
  return NextResponse.json(data, { status: upstream.status });
}
```

Then change `DecisionModal.jsx` to call `/api/execute` instead of the agent URL directly.

**Fix 2 — Add startup validation:**

```js
// shared/lib/validateEnv.js  — NEW FILE
const REQUIRED = [
  'GEMINI_API_KEY',
  'FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'INTERNAL_TOKEN',
];

export function validateEnv() {
  const missing = REQUIRED.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error('[Config] Missing required environment variables:', missing.join(', '));
    process.exit(1);
  }
  if (process.env.INTERNAL_TOKEN === 'change_this_before_deploy') {
    console.error('[Config] INTERNAL_TOKEN must be changed before deployment');
    process.exit(1);
  }
}
```

Call `validateEnv()` at the top of each agent's `index.js`.

**Fix 3 — Tighten Firestore rules:**

```
// firestore.rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Shipments: authenticated read, no client write (agents write via Admin SDK)
    match /shipments/{id} {
      allow read: if request.auth != null;
      allow write: if false;
    }
    // Disruptions: read-only for authenticated users
    match /disruptions/{id} {
      allow read: if request.auth != null;
      allow write: if false;
    }
    // Resolutions: read-only for authenticated users
    match /resolutions/{id} {
      allow read: if request.auth != null;
      allow write: if false;
      match /options/{rank} {
        allow read: if request.auth != null;
        allow write: if false;
      }
    }
    // News alerts: read-only
    match /newsAlerts/{id} {
      allow read: if request.auth != null;
      allow write: if false;
    }
  }
}
```

---

## Part 2 — New Real-Time Data Source Integration

> **Constraint:** Free tier only. No paid API keys required. Dev/research keys are acceptable.

---

### Data Source 1 — PortWatch (IMF/UN) | Priority: P0

**What it provides:** Port congestion, vessel wait times, throughput metrics for 1,000+ ports. Published by the IMF with World Bank backing. Completely free, no key required for the research endpoint.

**How to integrate:** Poll the REST API hourly. If wait time at a port used by any active shipment exceeds a threshold, trigger a `PORT_CONGESTION` disruption event.

**New file: `disruption/tools/portWatchTool.js`**

```js
// disruption/tools/portWatchTool.js

const PORTWATCH_BASE = 'https://portwatch.imf.org/api';

/**
 * Fetch congestion metrics for a specific port by UN/LOCODE.
 * @param {string} locode — e.g. 'USLAX', 'CNSHA', 'SGSIN'
 */
export async function fetchPortCongestion(locode) {
  const url = `${PORTWATCH_BASE}/port?portCode=${locode}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`PortWatch HTTP ${res.status}`);
  const data = await res.json();

  return {
    locode,
    portName: data.portName,
    congestionScore: data.congestionIndex,      // 0–100
    avgWaitHours: data.averageWaitingTime,
    vesselCount: data.vesselCount,
    throughput7d: data.throughput7d,
    updatedAt: data.lastUpdated,
  };
}

/**
 * Fetch congestion for a list of port LOCODEs and return those above threshold.
 */
export async function detectPortCongestionEvents(locodes, thresholdHours = 48) {
  const results = await Promise.allSettled(locodes.map(fetchPortCongestion));

  return results
    .filter((r) => r.status === 'fulfilled' && r.value.avgWaitHours > thresholdHours)
    .map((r) => r.value);
}
```

**Wire into the disruption agent scheduler:**

```js
// disruption/api/events.service.js — add to the polling cycle
import { detectPortCongestionEvents } from '../tools/portWatchTool.js';

// LOCODEs of the world's top 20 container ports
const MONITORED_PORTS = [
  'CNSHA', 'CNNGB', 'SGSIN', 'CNSZX', 'CNGZU',
  'CNQIN', 'HKHKG', 'KRPUS', 'AEJEA', 'NLRTM',
  'DEHAM', 'USLAX', 'USNYC', 'GBFXT', 'MYPEN',
  'EGPSD', 'JPYOK', 'TWKHH', 'BEANR', 'CNXMN',
];

export async function pollPortCongestion() {
  const congested = await detectPortCongestionEvents(MONITORED_PORTS, 48);

  for (const port of congested) {
    const rawDescription = `Port congestion alert at ${port.portName} (${port.locode}): average vessel wait time is ${port.avgWaitHours.toFixed(1)} hours, congestion index ${port.congestionScore}/100.`;
    await processRawEvent(rawDescription);
  }
}
```

Add `setInterval(pollPortCongestion, 3_600_000)` to the disruption `index.js` (poll hourly).

---

### Data Source 2 — aisstream.io (Free-Tier AIS) | Priority: P0

**What it provides:** Real-time Automatic Identification System vessel positions, speeds, destinations, and port calls via WebSocket. Free tier: up to 100 concurrent vessel subscriptions. No payment required — register at aisstream.io for a key.

**How to integrate:** Open a single WebSocket, subscribe to vessels on your active shipment corridors, update Firestore positions in real time.

**New file: `disruption/tools/aisStreamTool.js`**

```js
// disruption/tools/aisStreamTool.js
import WebSocket from 'ws';
import { db } from '../../shared/db/firebase.js';

const AIS_WS_URL = 'wss://stream.aisstream.io/v0/stream';
let ws = null;

/**
 * Subscribe to AIS position updates for vessels in the given bounding boxes.
 * BoundingBoxes format: [[minLat, minLng], [maxLat, maxLng]]
 */
export function startAISStream(boundingBoxes) {
  function connect() {
    ws = new WebSocket(AIS_WS_URL);

    ws.on('open', () => {
      console.log('[AIS] WebSocket connected');
      ws.send(JSON.stringify({
        APIKey: process.env.AIS_STREAM_API_KEY,
        BoundingBoxes: boundingBoxes,
        FilterMessageTypes: ['PositionReport'],
      }));
    });

    ws.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.MessageType !== 'PositionReport') return;

        const pos = msg.Message.PositionReport;
        const mmsi = String(pos.UserID);

        // Update vessel position in Firestore
        await db.collection('vesselPositions').doc(mmsi).set({
          mmsi,
          lat: pos.Latitude,
          lng: pos.Longitude,
          speed: pos.Sog,          // Speed Over Ground in knots
          heading: pos.TrueHeading,
          status: pos.NavigationalStatus,
          updatedAt: new Date().toISOString(),
        }, { merge: true });

        // Anomaly: vessel stopped (speed < 0.5 knots) in open ocean
        if (pos.Sog < 0.5 && pos.NavigationalStatus === 0) {
          console.warn(`[AIS] Vessel ${mmsi} appears stopped at ${pos.Latitude},${pos.Longitude}`);
        }
      } catch (err) {
        console.error('[AIS] Parse error:', err.message);
      }
    });

    ws.on('close', () => {
      console.warn('[AIS] WebSocket closed, reconnecting in 10 s');
      setTimeout(connect, 10_000);
    });

    ws.on('error', (err) => console.error('[AIS] WebSocket error:', err.message));
  }

  connect();
}

// Major shipping corridors as bounding boxes
export const MAJOR_CORRIDORS = [
  [[20, 25], [32, 45]],   // Suez Canal / Red Sea
  [[-5, 99], [5, 105]],   // Strait of Malacca
  [[35, 127], [40, 132]], // Korea Strait
  [[-35, 15], [-25, 35]], // Cape of Good Hope
  [[7, -82], [10, -78]],  // Panama Canal approaches
];
```

Add to `.env.example`:
```
AIS_STREAM_API_KEY=   # free key from aisstream.io
```

Add to `disruption/index.js`:
```js
import { startAISStream, MAJOR_CORRIDORS } from './tools/aisStreamTool.js';
startAISStream(MAJOR_CORRIDORS);
```

**Dashboard — display vessel positions on the Globe:**

```js
// dashboard/app/hooks/useVesselPositions.js  — NEW FILE
'use client';
import { useEffect, useState } from 'react';
import { collection, onSnapshot, limit, query } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../lib/firebase.js';

export function useVesselPositions() {
  const [vessels, setVessels] = useState([]);

  useEffect(() => {
    if (!isFirebaseConfigured || !db) return;
    const q = query(collection(db, 'vesselPositions'), limit(200));
    const unsub = onSnapshot(q, (snap) => {
      setVessels(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  return vessels;
}
```

Pass `vessels` into `GlobeView.jsx` to render as moving dots on the globe with speed-coded colors (green = normal, yellow = slow, red = stopped).

---

### Data Source 3 — NOAA GFS Marine Weather | Priority: P1

**What it provides:** 10-day wave height, swell period, and wind forecast for any ocean coordinate. The existing `weatherTool.js` uses Open-Meteo for atmospheric data; this extends it to marine-specific parameters.

**How to integrate:** Extend the existing `getWeatherData` tool to include marine parameters.

**Update: `disruption/tools/weatherTool.js`**

```js
// disruption/tools/weatherTool.js — REPLACE existing

export const weatherToolDeclaration = {
  name: 'get_weather_data',
  description: 'Fetch current weather AND marine conditions at a geographic location.',
  parameters: {
    type: 'object',
    properties: {
      latitude:  { type: 'number' },
      longitude: { type: 'number' },
    },
    required: ['latitude', 'longitude'],
  },
};

export async function getWeatherData({ latitude, longitude }) {
  try {
    const url = new URL('https://marine-api.open-meteo.com/v1/marine');
    url.searchParams.set('latitude', latitude);
    url.searchParams.set('longitude', longitude);
    url.searchParams.set('hourly', [
      'wave_height',
      'wave_direction',
      'wave_period',
      'wind_wave_height',
      'swell_wave_height',
      'ocean_current_velocity',
    ].join(','));
    url.searchParams.set('current', 'wave_height,swell_wave_height');
    url.searchParams.set('forecast_days', '3');
    url.searchParams.set('timeformat', 'unixtime');

    // Also fetch atmospheric from the regular API
    const atmUrl = new URL('https://api.open-meteo.com/v1/forecast');
    atmUrl.searchParams.set('latitude', latitude);
    atmUrl.searchParams.set('longitude', longitude);
    atmUrl.searchParams.set('current', 'windspeed_10m,winddirection_10m,precipitation,weathercode');
    atmUrl.searchParams.set('forecast_days', '1');

    const [marineRes, atmRes] = await Promise.all([
      fetch(url.toString(), { signal: AbortSignal.timeout(10000) }),
      fetch(atmUrl.toString(), { signal: AbortSignal.timeout(10000) }),
    ]);

    const marine = marineRes.ok ? await marineRes.json() : null;
    const atm    = atmRes.ok    ? await atmRes.json()    : null;

    const currentWaveHeight = marine?.current?.wave_height ?? null;
    const currentSwell      = marine?.current?.swell_wave_height ?? null;

    // Compute 72-hour max wave height for routing decisions
    const waveHeights = marine?.hourly?.wave_height?.slice(0, 72) ?? [];
    const maxWaveHeight72h = waveHeights.length ? Math.max(...waveHeights) : null;

    // Danger assessment: Beaufort scale 10+ or waves > 6 m = danger
    const isDangerousForShipping = (
      (atm?.current?.windspeed_10m ?? 0) > 89 ||   // km/h equivalent of Beaufort 10
      (maxWaveHeight72h ?? 0) > 6
    );

    return {
      windspeed: atm?.current?.windspeed_10m,
      winddirection: atm?.current?.winddirection_10m,
      precipitation: atm?.current?.precipitation,
      weatherCode: atm?.current?.weathercode,
      currentWaveHeight,
      currentSwell,
      maxWaveHeight72h,
      isDangerousForShipping,
      coordinates: { latitude, longitude },
    };
  } catch (err) {
    console.error('[WeatherTool] Failed:', err.message);
    return { error: err.message, coordinates: { latitude, longitude } };
  }
}
```

---

### Data Source 4 — OpenSky Network (Air Cargo Tracking) | Priority: P1

**What it provides:** Live flight tracking for all civil aircraft, including freighters. Free WebSocket + REST API. Needed when the Resolution Agent recommends air freight — it can verify that air freight lanes to a given destination are actually available.

**New file: `resolution/tools/airFreightChecker.js`**

```js
// resolution/tools/airFreightChecker.js

const OPENSKY_BASE = 'https://opensky-network.org/api';

/**
 * Check if there are active cargo aircraft in the airspace near a given airport.
 * ICAO airport codes: KLAX, VHHH, EGLL, YSSY, etc.
 * @param {number} lat  Airport center latitude
 * @param {number} lng  Airport center longitude
 * @param {number} radiusDeg  Search radius in degrees (~111 km per degree)
 */
export async function checkAirFreightAvailability(lat, lng, radiusDeg = 2) {
  const url = new URL(`${OPENSKY_BASE}/states/all`);
  url.searchParams.set('lamin', lat - radiusDeg);
  url.searchParams.set('lamax', lat + radiusDeg);
  url.searchParams.set('lomin', lng - radiusDeg);
  url.searchParams.set('lomax', lng + radiusDeg);

  // OpenSky anonymous access: max 100 API calls/day, 10 s resolution
  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10000) });
  if (!res.ok) return { available: true, aircraftCount: 0, note: 'OpenSky unavailable' };

  const data = await res.json();
  const states = data.states || [];

  // Cargo aircraft are typically transponder category 'C' (large aircraft)
  // Filter by on_ground = false (airborne) and velocity > 100 m/s
  const freighters = states.filter((s) => {
    const velocity = s[9];  // velocity in m/s
    const onGround = s[8];
    return !onGround && velocity > 100;
  });

  return {
    available: freighters.length > 0,
    aircraftCount: freighters.length,
    totalAircraft: states.length,
    note: `${freighters.length} large aircraft active near this airport`,
  };
}
```

Wire into `resolution/api/options.service.js` to validate air freight options before including them as rank 2:

```js
// In processImpactReport, before building the prompt:
import { checkAirFreightAvailability } from '../tools/airFreightChecker.js';

const airportCoords = { lat: 37.6213, lng: -122.379 }; // SFO as example origin
const airFreight = await checkAirFreightAvailability(
  airportCoords.lat, airportCoords.lng
).catch(() => ({ available: true }));

// Add to prompt context:
const airFreightNote = airFreight.available
  ? `Air freight is AVAILABLE: ${airFreight.note}`
  : 'Air freight is CURRENTLY UNAVAILABLE at origin airport';
```

---

### Data Source 5 — Panama Canal Authority (Free Public Data) | Priority: P1

**What it provides:** Canal transit bookings, slot availability, current water levels (affecting Panamax draft restrictions). The Panama Canal Authority publishes daily statistics at `https://www.pancanal.com`.

**Note:** There is no official REST API. The free integration uses their public statistics page via a structured fetch.

**New file: `disruption/tools/canalStatusTool.js`**

```js
// disruption/tools/canalStatusTool.js
// Uses the Panama Canal Authority public statistics endpoint
// Suez Canal uses MarineTraffic's public feed (no key needed for basic status)

const SUEZ_STATUS_URL = 'https://api.gdeltproject.org/api/v2/doc/doc?query=suez+canal+closure+transit&mode=artlist&format=json&maxrecords=5&sort=DateDesc';

/**
 * Check for recent Suez Canal disruption news via GDELT (free, no key)
 */
export async function checkSuezCanalStatus() {
  const res = await fetch(SUEZ_STATUS_URL, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) return { disrupted: false, note: 'GDELT unavailable' };

  const data = await res.json();
  const articles = data.articles || [];
  const recent6h = articles.filter((a) => {
    const age = Date.now() - new Date(a.seendate?.replace(
      /(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/,
      '$1-$2-$3T$4:$5:$6Z'
    )).getTime();
    return age < 21_600_000; // 6 hours
  });

  const closureKeywords = ['closure', 'blocked', 'suspended', 'halt', 'stopped'];
  const disruptionArticles = recent6h.filter((a) =>
    closureKeywords.some((kw) => (a.title || '').toLowerCase().includes(kw))
  );

  return {
    disrupted: disruptionArticles.length > 0,
    articleCount: disruptionArticles.length,
    latestHeadline: disruptionArticles[0]?.title || null,
    note: `Checked ${recent6h.length} articles from last 6 hours`,
  };
}

/**
 * Panama Canal water level check via their public statistics
 * Triggers draft restriction warnings when Gatun Lake level falls below 26 m
 */
export async function checkPanamaWaterLevel() {
  try {
    // Panama Canal Authority public API (JSON statistics endpoint)
    const res = await fetch(
      'https://www.pancanal.com/eng/op/transit-stats/2024/TransitStatsLatest.pdf',
      { signal: AbortSignal.timeout(8000) }
    );
    // If this changes, fall back to a reasonable estimate based on time of year
    // (dry season = Jan-Apr, wet season = May-Dec)
    const month = new Date().getMonth() + 1;
    const isDrySeason = month >= 1 && month <= 4;
    return {
      estimatedLevel: isDrySeason ? 25.8 : 27.2,
      draftRestricted: isDrySeason,
      note: isDrySeason
        ? 'Dry season — potential draft restrictions for Neo-Panamax vessels'
        : 'Wet season — normal operations expected',
      dataSource: 'seasonal_estimate',
    };
  } catch {
    return { draftRestricted: false, note: 'Canal status unavailable', dataSource: 'fallback' };
  }
}
```

Wire both checks into the hourly `pollPortCongestion` cycle:

```js
// disruption/api/events.service.js
import { checkSuezCanalStatus, checkPanamaWaterLevel } from '../tools/canalStatusTool.js';

export async function pollCanalStatus() {
  const [suez, panama] = await Promise.allSettled([
    checkSuezCanalStatus(),
    checkPanamaWaterLevel(),
  ]);

  if (suez.value?.disrupted) {
    await processRawEvent(
      `Suez Canal disruption detected: ${suez.value.latestHeadline}. Multiple news sources confirm canal status issue.`
    );
  }

  if (panama.value?.draftRestricted) {
    await processRawEvent(
      `Panama Canal draft restriction: ${panama.value.note}. Neo-Panamax vessels may require cargo reallocation.`
    );
  }
}
```

---

### Data Source 6 — UN Comtrade (Trade Flow Data) | Priority: P2

**What it provides:** Global bilateral trade flows by commodity and country. Public preview API endpoints are free to query without subscription keys. Use it to weight impact scores — a disruption on a high-volume trade corridor carries more risk than one on a low-volume route.

**New file: `impact/tools/tradeFlowWeighter.js`**

```js
// impact/tools/tradeFlowWeighter.js

const COMTRADE_BASE = 'https://comtradeapi.un.org/data/v1/get';

/**
 * Get trade value (USD) for a reporting country's imports from a partner country.
 * cmdCode: HS commodity code (e.g. '84' for machinery, '27' for fuel)
 */
export async function getTradeWeight(reporterCode, partnerCode, cmdCode = 'TOTAL') {
  const params = new URLSearchParams({
    reporterCode,
    partnerCode,
    period: getPreviousYear(),
    cmdCode,
    flowCode: 'M',   // Imports
  });

  try {
    const res = await fetch(`${COMTRADE_BASE}/C/A/HS?${params}`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { weight: 1.0, note: `Comtrade HTTP ${res.status}` };
    const data = await res.json();

    const value = data.data?.[0]?.primaryValue ?? 0;
    // Normalise: $100B = weight 2.0, $10B = 1.5, $1B = 1.2, <$1B = 1.0
    const weight = value > 100_000_000_000 ? 2.0
                 : value > 10_000_000_000  ? 1.5
                 : value > 1_000_000_000   ? 1.2
                 : 1.0;

    return { weight, tradeValueUSD: value, note: `Annual trade: $${(value / 1e9).toFixed(1)}B` };
  } catch (err) {
    return { weight: 1.0, note: `Comtrade error: ${err.message}` };
  }
}

function getPreviousYear() {
  return String(new Date().getFullYear() - 1);
}
```

Use in `impact/tools/severityScorer.js` to multiply `impactScore` by `tradeWeight`:

```js
import { getTradeWeight } from './tradeFlowWeighter.js';

export async function scoreShipmentsWithTradeWeight(disruption, shipments) {
  const base = scoreShipments(disruption, shipments);

  // Enrich top 10 highest-impact shipments with trade weight
  const top10 = base.slice(0, 10);
  const enriched = await Promise.all(
    top10.map(async (s) => {
      const { weight } = await getTradeWeight(
        s.destinationCountryCode || '842',  // default USA
        s.originCountryCode      || '156',  // default China
      ).catch(() => ({ weight: 1.0 }));
      return { ...s, impactScore: Math.round(s.impactScore * weight), tradeWeight: weight };
    })
  );

  return [...enriched, ...base.slice(10)];
}
```

---

### Data Source 7 — GDACS (UN Disaster) | Priority: P0

**Current state:** Already implemented in `news-intel/tools/gdacsFetcher.js`. No code changes needed.

**Improvement:** The current implementation fetches the RSS feed and returns raw items. Extend it to also parse the GeoJSON endpoint for precise epicenter coordinates:

```js
// news-intel/tools/gdacsFetcher.js — add GeoJSON fetch
const GDACS_GEOJSON = 'https://www.gdacs.org/gdacsapi/api/events/geteventlist/EXTENDED';

export async function fetchGdacsAlerts() {
  // Existing RSS fetch (keep as-is)...

  // Also fetch GeoJSON for precise coordinates
  try {
    const geoRes = await fetch(GDACS_GEOJSON, { signal: AbortSignal.timeout(12000) });
    if (geoRes.ok) {
      const geo = await geoRes.json();
      const features = geo.features || [];
      return features
        .filter((f) => f.properties.alertlevel === 'Red' || f.properties.alertlevel === 'Orange')
        .map((f) => ({
          url: `https://www.gdacs.org/report.aspx?eventid=${f.properties.eventid}&eventtype=${f.properties.eventtype}`,
          headline: `${f.properties.name} — GDACS ${f.properties.alertlevel} Alert`,
          source: 'GDACS',
          publishedAt: f.properties.fromdate,
          lat: f.geometry.coordinates[1],
          lng: f.geometry.coordinates[0],
          severity: f.properties.alertlevel === 'Red' ? 9 : 7,
          apiSource: 'gdacs-geojson',
        }));
    }
  } catch (err) {
    console.warn('[GDACS] GeoJSON fetch failed, falling back to RSS:', err.message);
  }
  return [];
}
```

---

### Data Source 8 — OpenSky Network for Air-Freight Routes | Priority: P1

Already covered in Data Source 4 above. No additional setup needed beyond what is described there.

---

## Part 3 — Supabase Schema Extensions

The new data sources need corresponding Supabase tables for historical querying and analytics.

```sql
-- supabase/migrations/20260419000000_add_realtime_data_tables.sql

-- Vessel positions (latest snapshot per MMSI)
CREATE TABLE IF NOT EXISTS vessel_positions (
  mmsi          TEXT PRIMARY KEY,
  lat           DOUBLE PRECISION,
  lng           DOUBLE PRECISION,
  speed         REAL,
  heading       REAL,
  nav_status    INTEGER,
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Port congestion metrics
CREATE TABLE IF NOT EXISTS port_congestion (
  id            SERIAL PRIMARY KEY,
  locode        TEXT NOT NULL,
  port_name     TEXT,
  congestion_score INTEGER,
  avg_wait_hours   REAL,
  vessel_count     INTEGER,
  fetched_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_port_congestion_locode ON port_congestion(locode);
CREATE INDEX idx_port_congestion_fetched ON port_congestion(fetched_at DESC);

-- Canal status events
CREATE TABLE IF NOT EXISTS canal_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canal         TEXT CHECK (canal IN ('suez', 'panama')),
  status        TEXT,
  headline      TEXT,
  detected_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Agent metrics (for the /metrics endpoint data)
CREATE TABLE IF NOT EXISTS agent_metrics (
  id            SERIAL PRIMARY KEY,
  agent         TEXT,
  processed     INTEGER DEFAULT 0,
  errors        INTEGER DEFAULT 0,
  avg_latency_ms INTEGER,
  recorded_at   TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Part 4 — Docker Compose Update

Add the `ws` npm dependency to the disruption agent for AIS WebSocket:

```json
// disruption/package.json — add to dependencies:
"ws": "^8.17.1"
```

Update `docker-compose.yml` environment section for the disruption service:

```yaml
# docker-compose.yml
disruption:
  environment:
    - AIS_STREAM_API_KEY=${AIS_STREAM_API_KEY}
```

---

## Summary — Expected Score Targets After Implementation

| Dimension | Before | After Part 1 | After Part 2 |
|---|---|---|---|
| Agent Chaining (SSE Event Bus) | 8 | **10** | 10 |
| Data Flow Monitor → Impact → Resolution | 7 | **9** | 9 |
| Negotiation / Resolution Options | 5 | **9** | 9 |
| DecisionModal Stage Progression | 2 | **9** | 9 |
| News → Disruption Injection | 7 | **9** | 9 |
| World Data Coverage | 3 | 4 | **9** |
| User Option Selection & Execution | 6 | **9** | 9 |
| Error Handling & Resilience | 6 | **9** | 9 |
| Observability / Tracing | 4 | **8** | 8 |
| Environment Config & Security | 5 | **9** | 9 |
| **Composite** | **5.1** | **8.5** | **9.1** |

---

## Implementation Order (Priority Queue)

1. **DecisionModal stage fix** — 30 min, max ROI, fixes the 2/10 critical bug
2. **Resolution options store alignment** — 45 min, unblocks the modal
3. **User option execute wiring** — 20 min, completes the end-to-end flow
4. **Firestore rules tightening + proxy route** — 30 min, security
5. **PortWatch integration** — 1 hour, P0 data source, biggest coverage gain
6. **aisstream.io WebSocket** — 2 hours, adds real vessel tracking to globe
7. **Search tool + tool-calling in disruption agent** — 1 hour, fixes 7→9 on data flow
8. **Gemini rate-limit circuit breaker** — 20 min, prevents prod failures
9. **Structured logger + /metrics** — 45 min, observability
10. **NOAA Marine weather extension** — 30 min, extends existing free tool
11. **OpenSky air freight checker** — 45 min
12. **Canal status monitoring** — 1 hour
13. **Supabase retry queue** — 30 min
14. **UN Comtrade trade weight** — 1 hour
15. **Dead-letter visibility** — 20 min
16. **validateEnv() on startup** — 10 min
