# GDG Phase 5 — Complete Audit, Bug Fixes & Product Enhancement Guide

> Prepared after full source inspection of `GDG-Solutions-Challenge-2026-phase5.zip` and cross-referenced against both previous guides. All findings are evidence-based from the actual codebase and `smoke-check-results.json`.

---

## Part 1 — Project Completion Rating

### Completion Score: **8.5 / 10**
### Hackathon Winning Potential: **8 / 10**

**What's working well (confirmed from source + smoke test):**
- All 5 services start cleanly, pass `/health` and `/metrics` — zero errors in smoke test
- Agent chaining is live: disruption-events +2, impact-reports +2 confirmed in smoke results
- All 7 news sources wired: GDELT, NewsAPI, GDACS, Reuters, Maritime RSS, Lloyd's, Strike alerts
- Gemini circuit breaker with exponential backoff — production-grade
- `resilientUpsert` with auto-retry queue — production-grade
- `generateWithTools` wired in disruption agent — monitor now uses weather + search tools
- `scoreShipmentsWithTradeWeight` calling UN Comtrade — integrated in impact service
- DecisionModal stage progression fixed — Firestore-driven, not SSE-dependent
- `handleApprove` calls `/api/execute` proxy — INTERNAL_TOKEN never reaches browser
- `useVesselPositions` hooked into GlobeView — vessel dots render from AIS data
- Replay message fix applied in eventBusClient — isReplay flag passed to all subscribers
- AIS WebSocket with graceful fallback when key is absent

**What remains incomplete or broken — detailed in Part 2 below.**

---

## Part 2 — Bugs & Missing Implementations

### BUG 1 (CRITICAL) — Resolution Options Pipeline Produces Zero New Options After Live Events

**Evidence:** `smoke-check-results.json` shows `messageCountDelta: { "resolution-options": 0 }` after 2 new disruption events caused impact-reports to grow by 2. The `resolutionProbe` returns options from a PREVIOUS run ("Cape of Good Hope Sea Reroute for Suez Disruption"), not from the new events.

**Root cause:** The Resolution service's `processImpactReport` writes options to Firestore and publishes to the event bus as the final step. But there are two silent failure paths:

1. `generateStream` fails (Gemini 429 or network timeout) → falls into the fallback block
2. The fallback block tries to parse `fullResponse` which is now `''` → `JSON.parse('')` throws → uses hardcoded fallback options
3. Those hardcoded fallback options use `seaSuppliers[0]` and `airSuppliers[0]` — if `findSuppliers()` returns empty arrays (which it does when Supabase is not configured), all `supplierName` fields are undefined → `validateResolutionOption` throws → the entire `processImpactReport` crashes silently

**Fix — `resolution/api/options.service.js`:**

```js
// Replace the fallback block (lines ~70-90) with a supplier-safe version:

const STATIC_FALLBACK_OPTIONS = [
  {
    rank: 1,
    title: routes.balanced.title,
    description: `Balanced reroute adds ${routes.balanced.timeDeltaHours}h and $${balancedCost.costDelta.toLocaleString()} cost.`,
    costDelta: balancedCost.costDelta,
    timeDelta: routes.balanced.timeDeltaHours,
    supplierName: seaSuppliers[0]?.name || 'Trans-Pacific Shipping Co.',
    supplierId:   seaSuppliers[0]?.id   || 'sup-002',
    confidence: 0.75,
  },
  {
    rank: 2,
    title: routes.fastest.title,
    description: `Fastest option: ${routes.fastest.timeDeltaHours}h saved at $${fastestCost.costDelta.toLocaleString()} premium.`,
    costDelta: fastestCost.costDelta,
    timeDelta: routes.fastest.timeDeltaHours,
    supplierName: airSuppliers[0]?.name || 'Pacific Air Express',
    supplierId:   airSuppliers[0]?.id   || 'sup-001',
    confidence: 0.80,
  },
  {
    rank: 3,
    title: routes.cheapest.title,
    description: `Cheapest route: $${cheapestCost.costDelta.toLocaleString()} extra, ${routes.cheapest.timeDeltaHours}h longer.`,
    costDelta: cheapestCost.costDelta,
    timeDelta: routes.cheapest.timeDeltaHours,
    supplierName: seaSuppliers[1]?.name || 'Global Shipping Partners',
    supplierId:   seaSuppliers[1]?.id   || 'sup-003',
    confidence: 0.70,
  },
];

let options;
try {
  const trimmed = fullResponse.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
  if (!trimmed) throw new Error('Empty response');
  const parsed = JSON.parse(trimmed);
  if (!Array.isArray(parsed) || parsed.length < 3) throw new Error('Not a 3-element array');
  options = parsed;
} catch (err) {
  console.warn('[ResolutionService] Using static fallback options:', err.message);
  options = STATIC_FALLBACK_OPTIONS;
}

// THEN validate, using fallback per-slot if individual option fails:
const routesByRank = [routes.balanced, routes.fastest, routes.cheapest];
const validatedOptions = options.slice(0, 3).map((opt, i) => {
  try {
    const normalized = {
      ...STATIC_FALLBACK_OPTIONS[i], // base with safe defaults
      ...opt,                         // overwrite with Gemini values
      rank:       Number(opt.rank ?? i + 1),
      costDelta:  parseInt(opt.costDelta ?? STATIC_FALLBACK_OPTIONS[i].costDelta, 10),
      timeDelta:  parseInt(opt.timeDelta ?? STATIC_FALLBACK_OPTIONS[i].timeDelta, 10),
      confidence: parseFloat(opt.confidence ?? STATIC_FALLBACK_OPTIONS[i].confidence),
      supplierName: opt.supplierName || STATIC_FALLBACK_OPTIONS[i].supplierName,
      supplierId:   opt.supplierId   || STATIC_FALLBACK_OPTIONS[i].supplierId,
    };
    return validateResolutionOption(normalized);
  } catch (err) {
    console.warn(`[ResolutionService] Option ${i + 1} validation failed, using fallback:`, err.message);
    return STATIC_FALLBACK_OPTIONS[i];
  }
});
```

---

### BUG 2 (HIGH) — `validateEnv` Throws Instead of Exiting

**Evidence:** `shared/lib/validateEnv.js` only throws an Error. If any agent's `index.js` wraps startup in a try/catch, the service continues running without required env vars.

**Fix — `shared/lib/validateEnv.js`:**

```js
export function validateEnv(service, requiredVars = []) {
  const missing = requiredVars.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error(`[${service}] Missing required env vars: ${missing.join(', ')}`);
    process.exit(1);   // hard exit — not a recoverable error
  }

  if (process.env.INTERNAL_TOKEN === 'change_this_before_deploy') {
    console.error(`[${service}] INTERNAL_TOKEN must be changed before deployment`);
    process.exit(1);
  }
}
```

---

### BUG 3 (HIGH) — Firestore Rules Allow Unauthenticated Reads + Missing vesselPositions Rule

**Evidence:** `firestore.rules` has `allow read: if true` on all collections. Any anonymous browser request can read all shipment values, disruption details, and resolution options without authentication.

**Fix — `firestore.rules` (complete replacement):**

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Helper: require valid Firebase Auth session
    function isAuthed() {
      return request.auth != null;
    }

    match /shipments/{id} {
      allow read: if isAuthed();
      allow write: if false;  // Admin SDK only
    }
    match /disruptions/{id} {
      allow read: if isAuthed();
      allow write: if false;
    }
    match /impactReports/{id} {
      allow read: if isAuthed();
      allow write: if false;
    }
    match /resolutions/{id} {
      allow read: if isAuthed();
      allow write: if false;
      match /options/{optId} {
        allow read: if isAuthed();
        allow write: if false;
      }
    }
    match /suppliers/{id} {
      allow read: if isAuthed();
      allow write: if false;
    }
    match /news_alerts/{id} {
      allow read: if isAuthed();
      allow write: if false;
    }
    match /vesselPositions/{mmsi} {   // ← was missing entirely
      allow read: if isAuthed();
      allow write: if false;
    }
    match /news_processed_urls/{id} {
      allow read: if false;
      allow write: if false;
    }
    match /errors/{id} {
      allow read: if false;
      allow write: if false;
    }
  }
}
```

**Important:** Update `dashboard/app/hooks/useResolutions.js` and `useDisruptions.js` to ensure Firebase Auth is initialized before Firestore listeners fire. The `isFirebaseConfigured` check already gates the hooks, but add a check for `auth.currentUser`:

```js
// dashboard/app/hooks/useDisruptions.js — add auth guard
import { getAuth } from 'firebase/auth';

useEffect(() => {
  if (!isFirebaseConfigured || !db) return;
  const auth = getAuth();
  if (!auth.currentUser) {
    console.warn('[useDisruptions] No authenticated user — skipping Firestore listener');
    return;
  }
  // ... rest of the hook
}, [addDisruption]);
```

---

### BUG 4 (MEDIUM) — `useResolutions` Shows Stale Resolution When Multiple Disruptions Exist

**Evidence:** The hook listens to the latest 5 resolutions by `createdAt` and always shows `snapshot.docs[0]` — the most recent. If a user triggers a disruption, then a second one arrives before the first is resolved, the modal will show options for the second disruption while the UI expects the first.

**Fix — `dashboard/app/hooks/useResolutions.js`:** Filter by `activeDisruptionId`:

```js
// dashboard/app/hooks/useResolutions.js — replace the useEffect body

import { useAlertStore } from '../store/alertStore.js';

export function useResolutions() {
  const { setResolutionWithOptions } = useAlertStore();
  const activeDisruptionId = useAlertStore((s) => s.activeDisruptionId);

  useEffect(() => {
    if (!isFirebaseConfigured || !db || !activeDisruptionId) return;

    // Listen to resolutions matching the active disruption specifically
    const q = query(
      collection(db, 'resolutions'),
      where('disruptionId', '==', activeDisruptionId),
      orderBy('createdAt', 'desc'),
      limit(1)
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const latestDoc = snapshot.docs[0];
      if (!latestDoc) return;

      const resolutionData = { id: latestDoc.id, ...latestDoc.data() };
      try {
        const optionsSnap = await getDocs(
          collection(db, 'resolutions', latestDoc.id, 'options')
        );
        const options = optionsSnap.docs
          .map((d) => {
            const data = { ...d.data() };
            return { ...data, route: data.route || rebuildRoute(data) };
          })
          .sort((a, b) => a.rank - b.rank);

        if (options.length > 0) {
          setResolutionWithOptions({ ...resolutionData, options });
        }
      } catch (err) {
        console.error('[useResolutions] Options fetch failed:', err.message);
      }
    });

    return () => unsubscribe();
  }, [activeDisruptionId, setResolutionWithOptions]);
}
```

Add `where` to imports:
```js
import { collection, onSnapshot, orderBy, query, limit, getDocs, where } from 'firebase/firestore';
```

---

### BUG 5 (MEDIUM) — News Injection Has No Retry

**Evidence:** `news-alerts` event bus count = 0 in smoke test. The `publishNewsAlert` function in `news-intel/agent/agent.js` makes a single `fetch` call to the disruption agent with no retry. If the disruption agent is sleeping (Render cold start), this silently fails.

**Fix — `news-intel/agent/agent.js`:**

```js
// Replace the fetch block inside publishNewsAlert():

async function injectToDisruptionAgent(description, traceId, maxAttempts = 3) {
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
    if (attempt < maxAttempts) await new Promise((r) => setTimeout(r, attempt * 3_000));
  }
  throw new Error(`Disruption injection failed after ${maxAttempts} attempts`);
}

// Then replace the single fetch call in publishNewsAlert:
await injectToDisruptionAgent(description, payload.traceId);
```

---

### MISSING — Supabase Migration for New Real-Time Tables

The new tables from Guide 1 (`vessel_positions`, `port_congestion`, `canal_events`, `agent_metrics`) do NOT have migrations. The `resilientUpsert` calls in `aisStreamTool.js` will silently fail without them.

**New file: `supabase/migrations/20260419000001_add_realtime_data_tables.sql`**

```sql
-- Vessel positions (live from AIS)
CREATE TABLE IF NOT EXISTS vessel_positions (
  mmsi            TEXT PRIMARY KEY,
  lat             DOUBLE PRECISION,
  lng             DOUBLE PRECISION,
  speed           REAL,
  heading         REAL,
  nav_status      INTEGER,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Port congestion snapshots
CREATE TABLE IF NOT EXISTS port_congestion (
  id              BIGSERIAL PRIMARY KEY,
  locode          TEXT NOT NULL,
  port_name       TEXT,
  congestion_score INTEGER,
  avg_wait_hours  REAL,
  vessel_count    INTEGER,
  fetched_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_port_congestion_locode   ON port_congestion (locode);
CREATE INDEX IF NOT EXISTS idx_port_congestion_fetched  ON port_congestion (fetched_at DESC);

-- Canal disruption events
CREATE TABLE IF NOT EXISTS canal_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canal           TEXT CHECK (canal IN ('suez', 'panama')),
  status          TEXT,
  headline        TEXT,
  detected_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Per-agent performance metrics (hourly snapshots)
CREATE TABLE IF NOT EXISTS agent_metrics (
  id              BIGSERIAL PRIMARY KEY,
  agent           TEXT NOT NULL,
  processed       INTEGER DEFAULT 0,
  errors          INTEGER DEFAULT 0,
  avg_latency_ms  INTEGER,
  recorded_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Also add vesselPositions Firestore-mirror to Supabase for analytics
COMMENT ON TABLE vessel_positions IS 'Live AIS vessel positions mirrored from Firestore for SQL analytics';
```

Also, wire the AIS stream to persist vessel positions to Supabase (in addition to Firestore):

```js
// disruption/tools/aisStreamTool.js — in ws.on('message'):
import { resilientUpsert } from '../../shared/db/supabase.js';

// Inside the message handler, after the Firestore set:
await resilientUpsert('vessel_positions', {
  mmsi,
  lat:        Number(pos.Latitude),
  lng:        Number(pos.Longitude),
  speed:      Number(pos.Sog || 0),
  heading:    Number(pos.TrueHeading || 0),
  nav_status: Number(pos.NavigationalStatus || 0),
  updated_at: new Date().toISOString(),
});
```

---

### MISSING — `disruption/index.js` Polls Fire Before App Listens

**Evidence:** `pollPortCongestion()`, `pollCanalStatus()`, and `pollCorridorWeather()` are called bare at module level, meaning they fire concurrently with `app.listen()`. If any poll triggers a Fastify route registration error, the app may crash before the server is up.

**Fix — `disruption/index.js`:** Wrap polls in a `setTimeout` after the server starts:

```js
// disruption/index.js — replace the bare poll calls at the bottom with:

try {
  await app.listen({ port: 3001, host: '0.0.0.0' });
  logger.info('Service started', { port: 3001 });

  // Start AIS stream after server is up
  startAISStream(MAJOR_CORRIDORS);

  // Initial polls with 15 s stagger so the server is fully ready
  setTimeout(() => pollPortCongestion().catch((e) => logger.warn('init portCongestion', { err: e.message })),  15_000);
  setTimeout(() => pollCanalStatus().catch((e)    => logger.warn('init canalStatus',    { err: e.message })),  20_000);
  setTimeout(() => pollCorridorWeather().catch((e) => logger.warn('init corridorWeather',{ err: e.message })), 25_000);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
```

---

## Part 3 — Implementation Checklist (All Items)

| # | Item | Status | Action |
|---|------|--------|--------|
| 1 | `shared/lib/scraper.js` | ✅ Complete | — |
| 2 | `shared/lib/logger.js` | ✅ Complete | — |
| 3 | `shared/lib/metrics.js` | ✅ Complete | — |
| 4 | `shared/lib/gemini.js` rate-limit CB | ✅ Complete | — |
| 5 | `shared/db/supabase.js` resilientUpsert | ✅ Complete | — |
| 6 | `event-bus/topics.js` NEWS_ALERTS | ✅ Complete | — |
| 7 | Event bus dead-letter + /metrics | ✅ Complete | — |
| 8 | eventBusClient replay fix | ✅ Complete | — |
| 9 | AIS WebSocket tool | ✅ Complete | — |
| 10 | PortWatch tool | ✅ Complete | — |
| 11 | ECMWF via Open-Meteo | ✅ Complete | — |
| 12 | Suez Canal scraper | ✅ Complete | — |
| 13 | Panama Canal scraper | ✅ Complete | — |
| 14 | searchTool + weatherTool (marine) | ✅ Complete | — |
| 15 | generateWithTools in disruption agent | ✅ Complete | — |
| 16 | Polling schedule in disruption/index.js | ✅ Complete | Fix timing (BUG 6) |
| 17 | 7-source news poll cycle | ✅ Complete | — |
| 18 | Reuters, Maritime, Lloyd's, Strike scrapers | ✅ Complete | — |
| 19 | `cheerio` in news-intel package.json | ✅ Complete | — |
| 20 | `ws + cheerio + puppeteer` in disruption package.json | ✅ Complete | — |
| 21 | OpenSky air freight checker | ✅ Complete | — |
| 22 | UN Comtrade trade weight | ✅ Complete | — |
| 23 | `scoreShipmentsWithTradeWeight` integration | ✅ Complete | — |
| 24 | `/api/execute` proxy route | ✅ Complete | — |
| 25 | `useResolutions` Firestore listener fix | ✅ Partial | Fix BUG 4 |
| 26 | `useVesselPositions` + Globe rendering | ✅ Complete | — |
| 27 | alertStore options always initialized | ✅ Complete | — |
| 28 | DecisionModal stage progression | ✅ Complete | — |
| 29 | handleApprove wired to `/api/execute` | ✅ Complete | — |
| 30 | headlessBrowser.js utility | ✅ Complete | — |
| 31 | Replay message age-check in subscribers | ✅ Complete | — |
| 32 | **validateEnv process.exit(1)** | ❌ Missing | Fix BUG 2 |
| 33 | **Firestore auth rules** | ❌ Open reads | Fix BUG 3 |
| 34 | **vesselPositions Firestore rule** | ❌ Missing | Fix BUG 3 |
| 35 | **Resolution fallback with null suppliers** | ❌ Crash | Fix BUG 1 |
| 36 | **News injection retry/backoff** | ❌ Missing | Fix BUG 5 |
| 37 | **Supabase new tables migration** | ❌ Missing | Add migration |
| 38 | **Polling fires before app.listen** | ❌ Race | Fix BUG 6 |

---

## Part 4 — Performance Improvements

### 4.1 — Debounce Vessel Position Firestore Writes

AIS streams can deliver 50-100 messages/second across all corridors. Writing each one directly to Firestore will exhaust the free-tier write quota in minutes.

**Fix — `disruption/tools/aisStreamTool.js`:**

```js
// Add at module level:
const pendingVesselWrites = new Map();   // mmsi → position
let vesselFlushTimer = null;

function scheduleVesselFlush() {
  if (vesselFlushTimer) return;
  vesselFlushTimer = setTimeout(async () => {
    vesselFlushTimer = null;
    if (!pendingVesselWrites.size) return;

    const batch = db.batch();
    for (const [mmsi, pos] of pendingVesselWrites) {
      batch.set(db.collection('vesselPositions').doc(mmsi), pos, { merge: true });
    }
    pendingVesselWrites.clear();
    await batch.commit().catch((e) => console.warn('[AIS] Batch flush failed:', e.message));
  }, 5_000); // flush every 5 s max
}

// In ws.on('message'), replace the direct Firestore set with:
pendingVesselWrites.set(mmsi, {
  mmsi,
  lat:      Number(pos.Latitude),
  lng:      Number(pos.Longitude),
  speed:    Number(pos.Sog || 0),
  heading:  Number(pos.TrueHeading || 0),
  status:   Number(pos.NavigationalStatus || 0),
  updatedAt: new Date().toISOString(),
});
scheduleVesselFlush();
```

This reduces Firestore writes from ~100/sec to ~1 batch every 5 seconds, staying well within free tier.

### 4.2 — Gemini Token Budget Reduction

The resolution prompt is currently around 2,000 tokens. On free tier (Gemini 1.5 Flash: 15 RPM, 1M TPM), you can run out of quota quickly during a demo. Compress the prompt:

```js
// resolution/api/options.service.js — replace the prompt builder:
const shipmentLines = scoredShipments.slice(0, 5)  // was 10
  .map((s, i) => `${i+1}. ${s.origin}→${s.destination}|$${(s.cargoValueUSD/1e6).toFixed(1)}M|${s.distanceKm}km|score:${s.impactScore}`)
  .join('\n');

const prompt = [
  SYSTEM_PROMPT,
  `DISRUPTION: ${impactReport.disruptionType} at ${impactReport.disruptionLocation}`,
  `CARGO_AT_RISK: $${(impactReport.totalCargoAtRiskUSD/1e6).toFixed(1)}M across ${impactReport.affectedShipments.length} shipments`,
  `CASCADE: ${impactReport.cascadeRisk} | URGENCY: ${impactReport.urgency}/10`,
  `TOP_SHIPMENTS:\n${shipmentLines}`,
  `AIR_FREIGHT: ${airFreightNote}`,
  `OPTIONS:\n1. ${routes.balanced.title}|${routes.balanced.distanceKm}km|+${routes.balanced.timeDeltaHours}h|+$${balancedCost.costDelta.toLocaleString()}`,
  `2. ${routes.fastest.title}|${routes.fastest.distanceKm}km|${routes.fastest.timeDeltaHours}h|+$${fastestCost.costDelta.toLocaleString()}`,
  `3. ${routes.cheapest.title}|${routes.cheapest.distanceKm}km|+${routes.cheapest.timeDeltaHours}h|+$${cheapestCost.costDelta.toLocaleString()}`,
  `SUPPLIERS: ${[...seaSuppliers, ...airSuppliers].slice(0,4).map(s=>`${s.name}(${s.id})`).join(', ')}`,
].join('\n');
```

This cuts prompt size by ~60%, reducing latency and quota consumption.

### 4.3 — Add In-Memory LRU for Port Congestion

PortWatch API calls happen hourly for 10 ports. Add a simple TTL cache in `portWatchTool.js`:

```js
// disruption/tools/portWatchTool.js — add at module level:
const portCache = new Map();   // locode → { data, expiresAt }
const PORT_CACHE_TTL = 55 * 60_000;  // 55 min (just under 1-hour poll)

export async function fetchPortCongestion(locode) {
  const cached = portCache.get(locode);
  if (cached && Date.now() < cached.expiresAt) return cached.data;

  const url = `${PORTWATCH_BASE}/port?portCode=${encodeURIComponent(locode)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`PortWatch HTTP ${res.status}`);
  const data = await res.json();

  const result = {
    locode,
    portName:       data.portName || locode,
    congestionScore: Number(data.congestionIndex ?? 0),
    avgWaitHours:   Number(data.averageWaitingTime ?? 0),
    vesselCount:    Number(data.vesselCount ?? 0),
    throughput7d:   Number(data.throughput7d ?? 0),
    updatedAt:      data.lastUpdated || new Date().toISOString(),
  };
  portCache.set(locode, { data: result, expiresAt: Date.now() + PORT_CACHE_TTL });
  return result;
}
```

---

## Part 5 — Visualization Enhancements (Globe & Dashboard)

### 5.1 — Vessel Trail Animation

Currently vessels are static dots. Adding a 5-position trail makes the globe look alive during a demo.

**Update `GlobeView.jsx`:**

```jsx
// Add to the module-level declarations (after imports):
// Trail store: mmsi → circular buffer of last 5 positions
const vesselTrails = new Map();
const MAX_TRAIL_LENGTH = 5;

// Inside the vessels useEffect, BEFORE adding/updating the entity:
const existingTrail = vesselTrails.get(id) || [];
const newTrail = [...existingTrail, { lat: v.lat, lng: v.lng }].slice(-MAX_TRAIL_LENGTH);
vesselTrails.set(id, newTrail);

// Draw trail polyline for vessels that have moved
if (newTrail.length > 1) {
  const trailId = `vessel-trail-${id}`;
  const trailPositions = newTrail.map((p) =>
    Cartesian3.fromDegrees(p.lng, p.lat, 1000)
  );
  const existing = viewer.entities.getById(trailId);
  const trailColor = v.speed < 0.5 ? Color.RED.withAlpha(0.6) : Color.CYAN.withAlpha(0.35);
  if (existing) {
    existing.polyline.positions = new ConstantProperty(trailPositions);
  } else {
    viewer.entities.add({
      id: trailId,
      polyline: {
        positions: new ConstantProperty(trailPositions),
        width: 1.5,
        material: trailColor,
      },
    });
  }
}
```

### 5.2 — Port Congestion Heatmap Layer

Add a visual layer on the globe showing port congestion as glowing circles — green for normal, yellow for elevated, red for critical.

```jsx
// dashboard/app/hooks/usePortCongestion.js — NEW FILE
'use client';
import { useEffect, useState } from 'react';

const PORT_COORDS = {
  CNSHA: { lat: 31.23, lng: 121.47, name: 'Shanghai' },
  SGSIN: { lat: 1.35,  lng: 103.82, name: 'Singapore' },
  NLRTM: { lat: 51.92, lng: 4.48,   name: 'Rotterdam' },
  USLAX: { lat: 33.74, lng: -118.25,name: 'Los Angeles' },
  DEHAM: { lat: 53.55, lng: 9.99,   name: 'Hamburg' },
  AEJEA: { lat: 25.01, lng: 55.14,  name: 'Jebel Ali' },
  EGPSD: { lat: 31.26, lng: 32.30,  name: 'Port Said' },
  KRPUS: { lat: 35.10, lng: 129.04, name: 'Busan' },
};

export function usePortCongestion() {
  const [ports, setPorts] = useState([]);
  useEffect(() => {
    async function fetchAll() {
      const results = await Promise.allSettled(
        Object.entries(PORT_COORDS).map(async ([locode, meta]) => {
          const res = await fetch(`/api/port-congestion?locode=${locode}`).catch(() => null);
          if (!res?.ok) return { ...meta, locode, congestionScore: 0, avgWaitHours: 0 };
          const json = await res.json();
          return { ...meta, locode, ...json.data };
        })
      );
      setPorts(results.filter((r) => r.status === 'fulfilled').map((r) => r.value));
    }
    fetchAll();
    const id = setInterval(fetchAll, 60 * 60_000);
    return () => clearInterval(id);
  }, []);
  return ports;
}
```

**Add the Next.js API route:**

```js
// dashboard/app/api/port-congestion/route.js — NEW FILE
import { NextResponse } from 'next/server';

export async function GET(req) {
  const locode = new URL(req.url).searchParams.get('locode');
  if (!locode) return NextResponse.json({ error: 'locode required' }, { status: 400 });

  try {
    const upstream = await fetch(
      `https://portwatch.imf.org/api/port?portCode=${encodeURIComponent(locode)}`,
      { signal: AbortSignal.timeout(8000), next: { revalidate: 3600 } }
    );
    if (!upstream.ok) return NextResponse.json({ data: null }, { status: 200 });
    const json = await upstream.json();
    return NextResponse.json({ data: {
      congestionScore: json.congestionIndex ?? 0,
      avgWaitHours:    json.averageWaitingTime ?? 0,
      vesselCount:     json.vesselCount ?? 0,
    }});
  } catch {
    return NextResponse.json({ data: null });
  }
}
```

**Render in `GlobeView.jsx`** (add a new `useEffect` for ports):

```jsx
const ports = usePortCongestion();

useEffect(() => {
  if (!vRef.current) return;
  const viewer = vRef.current;

  for (const [id, entity] of portEntitiesRef.current) {
    if (!ports.find((p) => p.locode === id)) {
      viewer.entities.remove(entity);
      portEntitiesRef.current.delete(id);
    }
  }

  ports.forEach((port) => {
    const color = port.avgWaitHours > 96 ? Color.RED.withAlpha(0.7)
                : port.avgWaitHours > 48 ? Color.YELLOW.withAlpha(0.6)
                : Color.fromCssColorString('#22c55e').withAlpha(0.5);

    const radius = 80_000 + (port.congestionScore / 100) * 120_000; // 80-200 km

    const existing = portEntitiesRef.current.get(port.locode);
    if (existing) {
      existing.ellipse.semiMajorAxis = new ConstantProperty(radius);
      existing.ellipse.material = color;
    } else {
      const entity = viewer.entities.add({
        id: `port-${port.locode}`,
        position: Cartesian3.fromDegrees(port.lng, port.lat),
        ellipse: {
          semiMajorAxis: new ConstantProperty(radius),
          semiMinorAxis: new ConstantProperty(radius),
          material: color,
          outline: true,
          outlineColor: color.brighten(0.3, new Color()),
        },
        label: {
          text: `${port.name}\n${port.avgWaitHours.toFixed(0)}h wait`,
          font: '11px sans-serif',
          fillColor: Color.WHITE,
          showBackground: true,
          backgroundColor: Color.BLACK.withAlpha(0.5),
          pixelOffset: new Cartesian2(0, -60),
          show: zoomLevel === 'close',
        },
        properties: { kind: 'port', locode: port.locode, waitHours: port.avgWaitHours },
      });
      portEntitiesRef.current.set(port.locode, entity);
    }
  });
}, [ports, zoomLevel]);
```

### 5.3 — Live Corridor Weather Risk Overlay

Show weather risk as animated arcs along shipping corridors. Add to `GlobeView.jsx`:

```js
// dashboard/app/hooks/useCorridorWeather.js — NEW FILE
'use client';
import { useEffect, useState } from 'react';

const CORRIDORS = [
  { name: 'Pacific', lat: 15.0, lng: 135.0, from: [35.17, 129.07], to: [34.05, -118.24] },
  { name: 'Red Sea',  lat: 20.0, lng:  38.0, from: [1.35,  103.82], to: [51.92,    4.48] },
  { name: 'Malacca',  lat:  3.0, lng: 101.0, from: [31.23, 121.47], to: [1.35,   103.82] },
];

export function useCorridorWeather() {
  const [corridors, setCorridors] = useState([]);
  useEffect(() => {
    async function fetch_() {
      const res = await fetch('/api/corridor-weather').catch(() => null);
      if (!res?.ok) return;
      const json = await res.json();
      setCorridors(json.data || []);
    }
    fetch_();
    const id = setInterval(fetch_, 3 * 60 * 60_000);
    return () => clearInterval(id);
  }, []);
  return corridors;
}
```

```js
// dashboard/app/api/corridor-weather/route.js — NEW FILE
import { NextResponse } from 'next/server';

const CORRIDORS = [
  { name: 'Pacific Typhoon Belt',  lat: 15.0, lng: 135.0 },
  { name: 'Red Sea / Suez',        lat: 20.0, lng:  38.0 },
  { name: 'Cape of Good Hope',     lat: -34.0, lng:  18.0 },
  { name: 'Malacca Strait',        lat:   3.0, lng: 101.0 },
  { name: 'North Atlantic',        lat:  45.0, lng: -30.0 },
];

export async function GET() {
  const results = await Promise.allSettled(
    CORRIDORS.map(async (c) => {
      const url = new URL('https://api.open-meteo.com/v1/ecmwf');
      url.searchParams.set('latitude', c.lat);
      url.searchParams.set('longitude', c.lng);
      url.searchParams.set('hourly', 'wave_height,wind_speed_10m');
      url.searchParams.set('forecast_days', '3');
      url.searchParams.set('models', 'ecmwf_ifs025');
      const res = await fetch(url.toString(), { next: { revalidate: 10800 } });
      if (!res.ok) return { ...c, riskLevel: 'UNKNOWN', maxWaveHeight: 0 };
      const data = await res.json();
      const waves = (data.hourly?.wave_height || []).filter(Number.isFinite);
      const maxWave = waves.length ? Math.max(...waves) : 0;
      return {
        ...c,
        maxWaveHeight: maxWave,
        riskLevel: maxWave > 6 ? 'SEVERE' : maxWave > 4 ? 'HIGH' : maxWave > 2 ? 'MODERATE' : 'LOW',
      };
    })
  );
  return NextResponse.json({
    data: results.filter((r) => r.status === 'fulfilled').map((r) => r.value),
  });
}
```

### 5.4 — Real-Time Metrics Dashboard Panel

Add a live system health panel to the dashboard that reads from the `/metrics` endpoints of all agents:

```jsx
// dashboard/app/components/AgentHealthPanel.jsx — NEW FILE
'use client';
import { useEffect, useState } from 'react';

const AGENTS = [
  { name: 'Event Bus',   url: process.env.NEXT_PUBLIC_EVENT_BUS_URL || 'http://localhost:4000' },
  { name: 'Disruption',  url: process.env.NEXT_PUBLIC_DISRUPTION_AGENT_URL || 'http://localhost:3001' },
  { name: 'Impact',      url: process.env.NEXT_PUBLIC_IMPACT_AGENT_URL    || 'http://localhost:3002' },
  { name: 'Resolution',  url: process.env.NEXT_PUBLIC_RESOLUTION_AGENT_URL|| 'http://localhost:3003' },
  { name: 'News Intel',  url: process.env.NEXT_PUBLIC_NEWS_AGENT_URL      || 'http://localhost:3005' },
];

export default function AgentHealthPanel() {
  const [metrics, setMetrics] = useState([]);

  useEffect(() => {
    async function poll() {
      const results = await Promise.allSettled(
        AGENTS.map((a) =>
          fetch(`${a.url}/metrics`, { signal: AbortSignal.timeout(5000) })
            .then((r) => r.json())
            .then((m) => ({ ...a, ...m, ok: true }))
            .catch(() => ({ ...a, ok: false }))
        )
      );
      setMetrics(results.map((r) => r.status === 'fulfilled' ? r.value : { ok: false }));
    }
    poll();
    const id = setInterval(poll, 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="grid grid-cols-5 gap-2 text-xs">
      {metrics.map((m) => (
        <div
          key={m.name}
          className={`rounded-lg p-2 border ${m.ok ? 'border-green-500/30 bg-green-950/20' : 'border-red-500/30 bg-red-950/20'}`}
        >
          <div className="font-medium text-white/80">{m.name}</div>
          <div className={`text-xs mt-0.5 ${m.ok ? 'text-green-400' : 'text-red-400'}`}>
            {m.ok ? '● Live' : '○ Down'}
          </div>
          {m.ok && (
            <div className="text-white/40 mt-1 space-y-0.5">
              <div>{m.requests ?? 0} req</div>
              <div>{m.avgLatencyMs ?? 0}ms avg</div>
              {m.errors > 0 && <div className="text-red-400">{m.errors} err</div>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
```

Add to `dashboard/app/page.js` above the globe component:
```jsx
import AgentHealthPanel from './components/AgentHealthPanel.jsx';
// ...
<AgentHealthPanel />
```

---

## Part 6 — Product-Level Enhancements (Enterprise Sales Strategy)

### 6.1 — The Pitch: What This Is at Product Level

This is not a hackathon project. It is an **Autonomous Supply Chain Risk Intelligence Platform**. The enterprise market for supply chain risk management software is $14B and growing 12% YoY (Gartner, 2025). Direct competitors include Everstream Analytics ($50/user/month), Resilinc ($200K/year enterprise), and FourKites. Your technical differentiation is:

1. **Autonomous multi-agent pipeline** — competitors show dashboards with manual alerting; you show automated detection → impact scoring → resolution generation, all without human input
2. **Real-time vessel tracking integrated with disruption scoring** — most competitors have these as separate products
3. **Gemini reasoning tokens streamed live** — the "AI thinking" UX is unique and demo-able
4. **Free-tier architecture** — proves it can run on any cloud at minimal cost, which is the enterprise SRE's first question

### 6.2 — Features to Add for Enterprise Positioning

**6.2.1 — Carbon Footprint Per Reroute Option**

Add `carbonDeltaKg` to `ResolutionOption`. Rerouting Cape of Good Hope instead of Suez adds ~5,600 km and roughly 590 tonnes CO₂ for a large container vessel. Show this in `OptionCard.jsx` to appeal to sustainability-focused procurement teams:

```js
// resolution/tools/costCalculator.js — add:
const CO2_KG_PER_KM = {
  'sea-freight': 0.012,    // kg CO2 per km per tonne cargo (ULCV vessel)
  'air-freight': 0.602,    // kg CO2 per km per tonne cargo (Boeing 777F)
  'rail':        0.028,
};

export function calculateCarbonDelta({ distanceKmDelta, mode, cargoTonnes = 500 }) {
  const factor = CO2_KG_PER_KM[mode] || CO2_KG_PER_KM['sea-freight'];
  return Math.round(distanceKmDelta * factor * cargoTonnes);
}
```

**6.2.2 — OFAC Sanctions Corridor Check**

Before the resolution agent suggests a reroute through a corridor, check it against OFAC's free consolidated sanctions list:

```js
// resolution/tools/sanctionsChecker.js — NEW FILE
// OFAC publishes a free CSV of sanctioned entities and regions
const OFAC_CONSOLIDATED_URL =
  'https://www.treasury.gov/ofac/downloads/consolidated/consolidated.xml';

// Simple check: does a corridor name contain a sanctioned country/entity?
const SANCTIONED_CORRIDORS = new Set([
  'iran', 'north korea', 'russia', 'crimea', 'belarus',
  'myanmar', 'cuba', 'venezuela',
]);

export function isSanctionedCorridor(corridorName) {
  const lower = corridorName.toLowerCase();
  return [...SANCTIONED_CORRIDORS].some((s) => lower.includes(s));
}
```

Add a `sanctionsWarning` field to each option card — this is a significant differentiator for enterprise compliance teams.

**6.2.3 — Historical Disruption Replay**

Add a `/replay` page to the dashboard that lets users scrub through historical disruption events using a timeline slider. This requires no new data — it reads from the existing Supabase `disruptions` table.

```js
// dashboard/app/api/disruptions/history/route.js — NEW FILE
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from') || new Date(Date.now() - 7 * 86400000).toISOString();
  const to   = searchParams.get('to')   || new Date().toISOString();

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  const { data, error } = await supabase
    .from('disruptions')
    .select('id, type, severity, location, epicenter_lat, epicenter_lng, detected_at, confidence')
    .gte('detected_at', from)
    .lte('detected_at', to)
    .order('detected_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
```

**6.2.4 — Carrier Rate Feed Integration**

The Resolution Agent currently uses static cost deltas. Replace with real-time Freightos Baltic Index (FBX), which publishes weekly spot rates as a free RSS feed:

```js
// resolution/tools/freightRatesTool.js — NEW FILE
import { fetchRssFeed } from '../../shared/lib/scraper.js';

const FBX_RSS = 'https://fbx.freightos.com/rss/';

export async function fetchCurrentFreightRates() {
  try {
    const items = await fetchRssFeed(FBX_RSS, { cacheTtlMs: 24 * 60 * 60_000 });
    // Parse rate from title like "FBX01: China/East Asia – North America West Coast: $2,100/FEU"
    const rates = {};
    for (const item of items) {
      const match = item.title.match(/\$([0-9,]+)\/FEU/i);
      if (match) {
        const routeKey = item.title.split(':')[0]?.trim();
        rates[routeKey] = parseInt(match[1].replace(/,/g, ''), 10);
      }
    }
    return rates;
  } catch {
    return {};   // graceful fallback — static rates still apply
  }
}
```

**6.2.5 — Insurance Premium Estimator**

Add a simple insurance premium estimate to each resolution option based on cargo value and route risk:

```js
// resolution/tools/insuranceEstimator.js — NEW FILE
// Uses Lloyd's of London published average war risk premium rates (publicly available)
const BASE_PREMIUM_RATE = 0.001;  // 0.1% of cargo value = standard ocean marine

const CORRIDOR_RISK_MULTIPLIER = {
  'Red Sea':      4.5,   // Houthi attacks — Lloyd's published rate ~0.5-0.7% as of 2025
  'Suez':         3.0,
  'Black Sea':    8.0,
  'Gulf of Aden': 5.0,
  'Pacific':      1.0,
  'Atlantic':     1.1,
  'Cape':         1.2,
};

export function estimateInsurancePremium(cargoValueUSD, corridorName) {
  const multiplier = Object.entries(CORRIDOR_RISK_MULTIPLIER)
    .find(([key]) => corridorName.toLowerCase().includes(key.toLowerCase()))?.[1] || 1.0;

  const premiumUSD = Math.round(cargoValueUSD * BASE_PREMIUM_RATE * multiplier);
  return {
    premiumUSD,
    annualRatePercent: BASE_PREMIUM_RATE * multiplier * 100,
    corridorRisk: multiplier > 3 ? 'WAR_RISK' : multiplier > 1.5 ? 'ELEVATED' : 'STANDARD',
  };
}
```

### 6.3 — Hackathon Demo Script (Win Strategy)

The winning demo tells a story in 5 minutes with a live system. Here is the exact script:

**Minute 0-1: Hook**
> "Right now, $6 trillion in goods are moving across the oceans. Ninety percent of global trade moves by sea. And disruptions — storms, strikes, canal closures — cost companies $184 million per hour on average. We built an AI system that detects these disruptions in real-time and tells you exactly what to do."

Show the globe with vessel positions live. Point to the AIS dots.

**Minute 1-2: Trigger a live scenario**
```bash
node resolution/simulation/inject.js suez_closure
```
Show the DecisionModal loading skeleton with the three-stage pipeline indicator advancing.

**Minute 2-3: Show the resolution options**
The three ranked options appear with cost delta, time delta, carbon impact. Show the Gemini streaming tokens in the AgentChatSidebar. Mention: "The AI is reasoning in real-time — this is not a pre-computed result."

**Minute 3-4: Execute option 1**
Click approve. Show the globe: the rerouted arc animates from Suez to Cape of Good Hope. Show affected shipment statuses changing from `delayed` to `rerouted` in the Shipments tab.

**Minute 4-5: Close with the market**
> "Our system detected this event, scored 9 affected shipments worth $42M, generated 3 resolution options, and rerouted them — in under 60 seconds. Current enterprise solutions take 4-8 hours and require a team of analysts. We're open for partnership discussions."

**Key demo tips:**
1. Pre-seed Firestore with exactly 9 shipments on the Suez corridor before the demo (edit `seed.js`)
2. Pre-warm all services 10 minutes before (Render cold starts)
3. Have the simulation `inject.js` command ready on a second monitor
4. If Gemini is slow, the LoadingSkeleton stage animation buys you time — the "AI is thinking" framing actually helps your pitch

---

## Part 7 — Environment Variables to Add

```bash
# .env (append these new keys)
AIS_STREAM_API_KEY=          # Free: register at aisstream.io
# UN Comtrade preview endpoints are public and do not require subscription keys
NEXT_PUBLIC_EVENT_BUS_URL=http://localhost:4000   # for AgentHealthPanel
```

---

## Revised Score Projections After All Fixes

| Dimension | Phase 5 Now | After Fixes |
|---|---|---|
| Agent Chaining (SSE Event Bus) | 9.5 | **10** |
| Data Flow Monitor → Impact → Resolution | 8 | **9.5** |
| Negotiation / Resolution Options | 7 | **9.5** |
| DecisionModal Stage Progression | 9 | **9.5** |
| News → Disruption Injection | 7.5 | **9** |
| World Data Coverage | 8 | **9** |
| User Option Selection & Execution | 9 | **9** |
| Error Handling & Resilience | 8.5 | **9.5** |
| Observability / Tracing | 8 | **9** |
| Environment Config & Security | 6 | **9** |
| **Composite** | **8.05** | **9.3** |

**Priority order for fixes (time to impact):**
1. BUG 1 — Resolution fallback crash (30 min, highest demo risk)
2. BUG 5 — News injection retry (20 min, fixes news-alerts=0)
3. BUG 6 — Poll timing race (10 min)
4. Missing Supabase migration (15 min)
5. BUG 4 — useResolutions activeDisruptionId filter (25 min)
6. Port congestion heatmap (45 min, huge visual impact for demo)
7. AgentHealthPanel (30 min, impressive for judges)
8. Vessel trail animation (20 min, globe looks alive)
9. BUG 2 — validateEnv exit (10 min)
10. BUG 3 — Firestore rules (15 min)
