# GDG Anti-Fragile Supply Chain — Professional Upgrade Guide

> **Phase 7 Complete Audit** · All issues, wiring defects, improvements, and UI/UX upgrades in one canonical document.

---

## Table of Contents

1. [Application Overview](#1-application-overview)
2. [Critical Bugs & Broken Wirings](#2-critical-bugs--broken-wirings)
3. [Missing Features (Stubs with No Implementation)](#3-missing-features-stubs-with-no-implementation)
4. [Architecture Improvements](#4-architecture-improvements)
5. [Backend Microservice Improvements](#5-backend-microservice-improvements)
6. [Dashboard (Next.js) Improvements](#6-dashboard-nextjs-improvements)
7. [Light Mode Implementation Guide](#7-light-mode-implementation-guide)
8. [Professional UI Upgrade Guide](#8-professional-ui-upgrade-guide)
9. [Performance & Reliability Improvements](#9-performance--reliability-improvements)
10. [Security Hardening](#10-security-hardening)
11. [Testing & Observability](#11-testing--observability)

---

## 1. Application Overview

This is a real-time, AI-driven supply-chain disruption system comprised of the following services:

| Service | Port | Role |
|---|---|---|
| `event-bus` | 4000 | Custom Node.js EventEmitter broker — distributes events between agents |
| `disruption` | 3001 | Monitor agent — detects disruptions via scrapers and Gemini AI |
| `impact` | 3002 | Impact agent — scores severity against live shipments |
| `resolution` | 3003 | Negotiator agent — generates resolution options, serves SSE stream |
| `news-intel` | 3005 | News agent — GDELT/NewsAPI feed classification |
| `dashboard` | 3000 | Next.js 15 frontend — Globe, Shipments, Replay, Analytics |

**Databases:** Firebase Firestore (primary real-time) + Supabase PostgreSQL (analytics/reporting fallback).

**AI Layer:** Gemini 2.5 Flash via Google AI Studio.

**Infrastructure:** Render.com (free tier) for all backend services, Vercel for the dashboard, Firebase Auth for Google OAuth.

---

## 2. Critical Bugs & Broken Wirings

These are defects that are either silently broken or will cause incorrect behaviour in production. Fix these before anything else.

---

### 2.1 `zoomLevel` Enum Mismatch — Port Labels Never Show

**File:** `dashboard/app/components/globe/GlobeView.jsx`

**Problem:** The camera altitude callback produces zoom levels `'state' | 'city' | 'far'`. However the port heatmap label visibility check uses `zoomLevel === 'close'`, which is a value that is never produced. Port congestion labels are therefore permanently invisible.

```js
// ❌ CURRENT — 'close' is never produced by the camera callback
existing.label.show = new ConstantProperty(zoomLevel === 'close');

// The camera callback only produces these three values:
const next = altM < 500000 ? 'state' : altM < 2000000 ? 'city' : 'far';
```

**Fix:** Change the label show condition to match the actual values produced:

```js
// ✅ FIXED
existing.label.show = new ConstantProperty(zoomLevel === 'state' || zoomLevel === 'city');
```

Apply the same fix to the `else` branch where the entity is first created:

```js
show: new ConstantProperty(zoomLevel === 'state' || zoomLevel === 'city'),
```

---

### 2.2 `AgentHealthPanel` Is Built But Never Rendered

**File:** `dashboard/app/components/AgentHealthPanel.jsx`

**Problem:** `AgentHealthPanel` is a fully implemented, high-quality "Mission Control" telemetry panel that polls all five agent `/metrics` endpoints and renders live health bars. It is never imported or mounted on any page. This means the entire telemetry view is dead code.

**Fix:** Add a dedicated `/health` or `/status` route in the dashboard, or add it as a collapsible tab inside the `AgentPanel` overlay. The recommended approach is a new route so it does not compete with the Globe.

Create `dashboard/app/health/page.js`:

```js
'use client';

import NavBar from '../components/NavBar.jsx';
import AgentHealthPanel from '../components/AgentHealthPanel.jsx';

export default function HealthPage() {
  return (
    <div className="flex flex-col min-h-screen bg-[#020617] text-white">
      <NavBar />
      <main className="flex-1 p-6">
        <AgentHealthPanel />
      </main>
    </div>
  );
}
```

Then add it to `NavBar.jsx`:

```jsx
<Link href="/health" className={navLinkClass('/health', pathname)}>
  System Health
</Link>
```

---

### 2.3 `URL` Global Shadowing in `AgentChatSidebar`

**File:** `dashboard/app/components/agent/AgentChatSidebar.jsx`

**Problem:** The constant `const URL = process.env...` shadows the browser's global `URL` constructor. If any code inside this module (or a dependency) calls `new URL(...)`, it will throw `TypeError: URL is not a constructor`.

```js
// ❌ CURRENT — shadows global URL
const URL = process.env.NEXT_PUBLIC_RESOLUTION_AGENT_URL || 'http://localhost:3003';
```

**Fix:**

```js
// ✅ FIXED
const RESOLUTION_AGENT_URL = process.env.NEXT_PUBLIC_RESOLUTION_AGENT_URL || 'http://localhost:3003';
```

Then update the EventSource construction: `` `${RESOLUTION_AGENT_URL}/options/stream/${traceId}` ``

---

### 2.4 Duplicate Firestore Subscriptions on `/shipments`

**File:** `dashboard/app/shipments/page.js` and `dashboard/app/page.js`

**Problem:** Both pages independently call `useShipments()`. Each call creates its own `onSnapshot` Firestore listener. When a user navigates between Globe and Shipments, the hook lifecycle means the listeners can stack if the previous component unmounts late. This causes duplicate `addShipment` calls and can result in doubled shipment counts.

**Fix:** The shipment subscription belongs at the global store level or in a single provider component. Move the Firestore listener to a top-level `DataProvider` component mounted once in `layout.js`:

**`dashboard/app/providers/DataProvider.jsx`**:
```jsx
'use client';

import { useShipments } from '../hooks/useShipments.js';
import { useDisruptions } from '../hooks/useDisruptions.js';
import { useResolutions } from '../hooks/useResolutions.js';
import { useNewsAlerts } from '../hooks/useNewsAlerts.js';

export default function DataProvider({ children }) {
  useShipments();
  useDisruptions();
  useResolutions();
  useNewsAlerts();
  return children;
}
```

**`dashboard/app/layout.js`** (add around `{children}`):
```jsx
import DataProvider from './providers/DataProvider.jsx';

// ...
<body>
  <DataProvider>
    {children}
  </DataProvider>
</body>
```

Then remove `useShipments()` and `useDisruptions()` etc. from individual pages.

---

### 2.5 `useNewsAlerts` Called Twice Inside `NewsFeed`

**File:** `dashboard/app/components/news/NewsFeed.jsx`

**Problem:** `NewsFeed` calls `useNewsAlerts()` at the top of its render. This hook is already called on the parent `page.js`. While the store prevents duplicates via the dedup filter, the hook creates a second Firestore `onSnapshot` listener unnecessarily.

**Fix:** Remove `useNewsAlerts()` from `NewsFeed.jsx` since with the `DataProvider` pattern above, the subscription is already active. `NewsFeed` should only read from the store:

```js
// Remove this line from NewsFeed.jsx:
// useNewsAlerts();

// The store selector is sufficient:
const newsAlerts = useAlertStore((state) => state.newsAlerts);
```

---

### 2.6 Analytics: `mttrMinutes` Hardcoded, `totalCO2t` Always Zero

**File:** `dashboard/app/api/analytics/route.js`

**Problem:** Two KPI cards are permanently fake:
- `mttrMinutes` is hardcoded to `47` regardless of actual resolution data.
- `totalCO2t` is always `0`.

This means the "30-Day Analytics" page shows misleading data.

**Fix for `mttrMinutes`** — Calculate from resolution timestamps:

```js
function calculateMttr(resolutions) {
  const resolved = resolutions.filter(
    (r) => r.status === 'resolved' && r.createdAt && r.updatedAt
  );
  if (!resolved.length) return 0;
  const totalMs = resolved.reduce((sum, r) => {
    return sum + (new Date(r.updatedAt) - new Date(r.createdAt));
  }, 0);
  return Math.round(totalMs / resolved.length / 60000); // ms → minutes
}
```

**Fix for `totalCO2t`** — Estimate from rerouted shipments. When a shipment is rerouted, the distance delta versus the original route produces a CO₂ delta. Use a simplified marine fuel model:

```js
// Approx: container ship emits ~0.020 kg CO₂ per tonne-km
// Average cargo per TEU ~12 tonnes
// Implement based on rerouted distances stored in resolution options
const totalCO2t = resolutions
  .filter(r => r.rerouteDistanceDeltaKm)
  .reduce((sum, r) => sum + (r.rerouteDistanceDeltaKm * 0.020 * 12) / 1000, 0);
```

Add `rerouteDistanceDeltaKm` to the resolution agent output and store it in Firestore/Supabase.

---

### 2.7 No Authentication Guard on Any Page

**File:** All pages under `dashboard/app/`

**Problem:** `login/page.js` exists and shows a Google sign-in button. However there is no middleware and no per-page guard that checks authentication. Every route is publicly accessible without being signed in. The `AgentTrigger`, `DecisionModal`, and scenario injection endpoints are completely unprotected from the browser.

**Fix:** Add a Next.js middleware file at `dashboard/middleware.js`:

```js
import { NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/login', '/api/', '/_next/', '/favicon.ico'];

export function middleware(request) {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  if (isPublic) return NextResponse.next();

  const sessionCookie =
    request.cookies.get('__session')?.value ||
    request.cookies.get('gdg_session')?.value;

  if (!sessionCookie) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

Also add Firebase ID token verification to the session cookie flow using `firebase-admin` in the login API route.

---

### 2.8 `websocket.js` Is Not a WebSocket

**File:** `dashboard/app/lib/websocket.js`

**Problem:** This file is named `websocket.js` but contains only the `connectAgentStatusPolling` function, which uses `setInterval` over HTTP `fetch`. There is no WebSocket connection anywhere. The `README.md` advertises `WebSocket ← Event Bus (agent heartbeats)` as part of the architecture, but this is never implemented.

**Fix:** Either:
1. Rename the file to `agentPolling.js` and update all imports, making the name honest.
2. Or implement a proper WebSocket connection to the event bus (see Section 4.3).

Update the import in `AgentStatusBadge.jsx`:
```js
import { connectAgentStatusPolling } from '../../lib/agentPolling.js';
```

---

### 2.9 `mock_shipments.json` Is Empty

**File:** `shared/db/mock_shipments.json`

**Problem:** The file contains only `[]`. Any code that depends on mock data for local development, testing, or fallback mode will silently get an empty dataset with no error.

**Fix:** Populate it with at least 5–10 representative shipment objects matching the `Shipment` schema defined in `shared/types/Shipment.js`. Use valid lat/lng coordinates on real trade lanes (Shanghai→LA, Rotterdam→NY, etc.) so the Globe view renders something meaningful on first boot.

---

### 2.10 `disrupted` Status Not Filterable on Globe

**File:** `dashboard/app/components/globe/GlobeControls.jsx` and `GlobeView.jsx`

**Problem:** `GlobeView.jsx` defines a `C` color constant with a `disrupted` key (`'#ef4444'`), but `GlobeControls.jsx` only provides filter buttons for `all`, `active`, `delayed`, `rerouted`. Shipments with status `disrupted` are rendered but cannot be isolated. Also the `STATUS_FILTERS` array does not include `'disrupted'`.

**Fix:** Add `disrupted` to `GlobeControls`:

```js
const STATUS_FILTERS = ['all', 'active', 'delayed', 'rerouted', 'disrupted'];

const filterColors = {
  // ...existing
  disrupted: 'border-rose-600/50 text-rose-400 hover:border-rose-400',
};

const activeColors = {
  // ...existing
  disrupted: 'bg-rose-600/20 border-rose-400 text-rose-300',
};
```

Update the key label: `disrupted → 'Disrupted [X] (${counts.disrupted})'`

Add to the `counts` object: `disrupted: shipments.filter((s) => s.status === 'disrupted').length`

---

### 2.11 `set-org` Route Has No UI Entry Point

**File:** `dashboard/app/api/auth/set-org/route.js`

**Problem:** An API route exists to assign an organisation ID to a session cookie, but there is no settings page, modal, or post-login flow that calls it. Users therefore always belong to a blank org context, and Firestore RLS rules that enforce `org_id` isolation silently pass or fail.

**Fix:** After Google sign-in completes in `LoginPage`, redirect the user through an org-selection flow:

1. Create `dashboard/app/onboarding/page.js` — a simple one-step form that accepts an org slug.
2. On submit, call `POST /api/auth/set-org` with the chosen or auto-derived org ID.
3. Only then redirect to `/`.

Alternatively, auto-assign org ID from the Firebase UID on first login by creating a Firestore `orgs/{uid}` document.

---

### 2.12 RLS Inconsistency: Supabase vs Firestore Field Naming

**File:** `dashboard/app/api/analytics/route.js` and Supabase migration files

**Problem:** Firestore documents use camelCase fields (`detectedAt`, `cascadeRisk`, `totalCargoAtRiskUSD`) while Supabase columns use snake_case (`detected_at`, `cascade_risk`, `total_cargo_at_risk_usd`). The analytics route handles this with ad-hoc field coalescing like `d.detected_at || d.detectedAt`. This pattern is brittle and produces silent mismatches.

**Fix:** Create a normalisation helper used by all API routes:

```js
// shared/lib/normalizeDisruption.js
export function normalizeDisruption(raw) {
  return {
    id: raw.id,
    type: raw.type || raw.disruptionType,
    severity: Number(raw.severity || 0),
    detectedAt: raw.detected_at || raw.detectedAt || raw.receivedAt,
    cascadeRisk: raw.cascade_risk || raw.cascadeRisk,
    totalCargoAtRiskUSD: raw.total_cargo_at_risk_usd ?? raw.totalCargoAtRiskUSD ?? 0,
  };
}
```

Apply this to all routes that touch both data sources.

---

## 3. Missing Features (Stubs with No Implementation)

---

### 3.1 Real-Time Replay Has No Playback

**File:** `dashboard/app/replay/page.js`

**Problem:** The Replay page is a static list viewer with a time-range slider. There is no actual playback. The "Replay Studio" branding implies step-through animation, but clicking the slider only updates which event card is highlighted. No map or globe visualises the event at that point in time.

**Implementation Plan:**

1. Add an auto-advance `Play` button with configurable speed (1×, 2×, 4×).
2. Integrate a lightweight Leaflet.js map (not the full Cesium viewer) that shows the disruption epicenter as an animated pulse at `selected.epicenterLat, selected.epicenterLng`.
3. Add a timeline bar at the bottom showing event severity as a sparkline, with the scrub position tracking the selected index.
4. Store the replay speed preference in `localStorage`.

---

### 3.2 Decision Feedback Is Stored Nowhere

**File:** `dashboard/app/components/decision/FeedbackThumb.jsx`

**Problem:** `FeedbackThumb` renders thumbs-up/down buttons with local UI state, but it never sends feedback to any API. The approval of resolution options (`handleApprove`) writes to Firestore via `/api/execute`, but the thumbs feedback is completely disconnected.

**Fix:** Add a `POST /api/feedback` route that writes a `feedback` collection in Firestore:

```js
// dashboard/app/api/feedback/route.js
export async function POST(req) {
  const { traceId, rank, thumbs } = await req.json(); // thumbs: 'up' | 'down'
  await adminDb.collection('feedback').add({
    traceId, rank, thumbs,
    createdAt: new Date().toISOString(),
  });
  return NextResponse.json({ ok: true });
}
```

Then wire `FeedbackThumb` to call it on click.

---

### 3.3 Push Notifications Are Only Partially Wired

**File:** `dashboard/app/lib/pushNotifications.js` and `dashboard/public/sw.js`

**Problem:** The push subscription is registered on page load. The `/api/push/subscribe` route saves the subscription. But the backend agents never actually send a Web Push notification. There is no server-side code that calls the Web Push protocol when a disruption is detected.

**Fix:** In the disruption agent or impact agent, after writing a disruption to Firestore, call a new internal endpoint in the dashboard that fans out push notifications:

```js
// In disruption agent — after writing disruption to Firestore:
await fetch(`${DASHBOARD_URL}/api/push/notify`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${process.env.INTERNAL_TOKEN}`,
  },
  body: JSON.stringify({
    title: `⚠️ Disruption Detected`,
    body: `${disruption.type} at ${disruption.location} — Severity ${disruption.severity}/10`,
    url: '/',
  }),
});
```

Create `dashboard/app/api/push/notify/route.js` that reads all push subscriptions from Supabase and fans them out using the `web-push` npm package.

---

### 3.4 Email Digest Is Defined But Never Triggered

**File:** `shared/lib/emailDigest.js`

**Problem:** An email digest utility exists (using Nodemailer or similar) but there is no cron job, scheduled function, or event listener that actually calls it. The utility is dead.

**Fix:** Add a `POST /api/email-digest` route callable by a cron service (Vercel Cron or a Render cron job), triggered daily at 08:00 UTC:

```js
// In vercel.json:
{
  "crons": [
    { "path": "/api/email-digest", "schedule": "0 8 * * *" }
  ]
}
```

The route should query the last 24h of disruptions and resolutions and send a digest to all active org members.

---

## 4. Architecture Improvements

---

### 4.1 Replace Polling-Based Agent Status With True WebSocket

**Current:** `connectAgentStatusPolling` polls 3 `/health` endpoints every 3 seconds from the browser. Every user session creates 3 HTTP requests per second system-wide.

**Recommended:** The event bus already has persistent connections. Add a WebSocket server to `event-bus/index.js` and broadcast a lightweight `agent:status` event whenever an agent calls its own `/health`:

```js
// event-bus/index.js — add alongside existing Fastify routes
import { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ server: fastifyServer.server });

// agents POST /heartbeat to the event bus
fastify.post('/heartbeat', (req) => {
  const { agent, status } = req.body;
  broadcast({ type: 'agent:status', agent, status });
  return { ok: true };
});

function broadcast(payload) {
  const msg = JSON.stringify(payload);
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(msg);
  }
}
```

Then update `websocket.js` (now `agentPolling.js`) to use the WebSocket:

```js
export function connectAgentStatus(onStatusChange) {
  const ws = new WebSocket(process.env.NEXT_PUBLIC_EVENT_BUS_WS_URL || 'ws://localhost:4000');
  ws.onmessage = (e) => {
    const { type, agent, status } = JSON.parse(e.data);
    if (type === 'agent:status') onStatusChange(agent, status);
  };
  return () => ws.close();
}
```

---

### 4.2 Event Bus Needs Persistence

**Current:** The custom Node.js `EventEmitter`-based broker stores zero events. If any agent crashes and restarts, it misses all events published during downtime.

**Recommended:** Add a simple in-memory ring buffer per topic (configurable, e.g. last 500 events) with a `GET /replay/:topic?since=<timestamp>` endpoint. Agents can call this on startup to catch up:

```js
// event-bus/broker.js
const RING_SIZE = 500;
const rings = new Map(); // topic → []

function publish(topic, payload) {
  const ring = rings.get(topic) || [];
  ring.push({ ts: Date.now(), payload });
  if (ring.length > RING_SIZE) ring.shift();
  rings.set(topic, ring);
  // ... existing emit logic
}

// New route:
fastify.get('/replay/:topic', (req, reply) => {
  const since = Number(req.query.since || 0);
  const events = (rings.get(req.params.topic) || [])
    .filter(e => e.ts > since);
  return reply.send(events);
});
```

---

### 4.3 Supabase RLS Is Not Applied on Dashboard API Routes

**File:** `dashboard/app/api/v1/_auth.js` and `supabase/migrations/20260420000003_rls_org_isolation.sql`

**Problem:** RLS is defined in Supabase migrations with per-org policies, but the dashboard API routes construct a Supabase client with the `SUPABASE_SERVICE_ROLE_KEY` which bypasses all RLS policies. A compromised API key gives full cross-tenant access.

**Fix:** For user-facing queries, use the anon key and rely on RLS:

```js
// For user requests: use anon key + user JWT
const userClient = createClient(url, process.env.SUPABASE_ANON_KEY, {
  global: { headers: { Authorization: `Bearer ${userJwt}` } },
});

// Only use service role for internal/admin operations
const adminClient = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY);
```

---

## 5. Backend Microservice Improvements

---

### 5.1 Add `updatedAt` to Resolution Documents

**File:** `resolution/api/options.service.js`

**Problem:** Resolution documents in Firestore lack an `updatedAt` field. The analytics MTTR calculation (Section 2.6) requires this. Additionally, the resolution agent has no way to mark a resolution as stale after a certain time.

**Fix:** On every write to Firestore's `resolutions` collection, include `updatedAt: new Date().toISOString()`. On status change (e.g. to `'resolved'`), also record `resolvedAt`.

---

### 5.2 Scraper Rate Limiting and Retry Backoff

**File:** `disruption/tools/*.js` (all scrapers)

**Problem:** Scrapers run on a fixed polling interval with no exponential backoff on failure. If a target website blocks requests (HTTP 429/503), the scraper retries immediately, wasting quota and risking IP bans.

**Fix:** Wrap each scraper in a retry-with-backoff utility:

```js
// shared/lib/retryWithBackoff.js
export async function retryWithBackoff(fn, { maxRetries = 3, baseDelayMs = 1000 } = {}) {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      if (attempt >= maxRetries) throw err;
      const delay = baseDelayMs * 2 ** attempt + Math.random() * 500;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}
```

Also add a circuit breaker per scraper domain: after 5 consecutive failures, pause that scraper for 15 minutes.

---

### 5.3 News Intel Agent Dedup Store Should Use Supabase, Not In-Memory

**File:** `news-intel/tools/dedupStore.js`

**Problem:** The dedup store uses an in-memory `Set` of seen alert IDs. When the service restarts on Render (which restarts frequently on the free tier), the entire dedup state is lost and all recent alerts are re-published.

**Fix:** Persist the dedup store in Supabase:

```js
// Check if seen:
const { data } = await supabase
  .from('news_alerts')
  .select('id')
  .eq('external_id', externalId)
  .single();
if (data) return true; // already seen
```

---

### 5.4 Gemini Prompt Safety Fallback

**File:** `shared/lib/gemini.js`

**Problem:** The Gemini API calls have no handling for safety-filtered responses. If Gemini returns a `SAFETY` finish reason (common with supply-chain content that mentions embargoes, sanctions, or military conflict), the agent crashes or returns `undefined`.

**Fix:** Add a check after every Gemini call:

```js
const candidate = result.response.candidates?.[0];
if (!candidate || candidate.finishReason === 'SAFETY') {
  logger.warn('[Gemini] Response blocked by safety filter');
  return null; // caller must handle null gracefully
}
const text = candidate.content.parts.map(p => p.text).join('');
return text;
```

---

## 6. Dashboard (Next.js) Improvements

---

### 6.1 Add Skeleton Loading States to All Pages

**Problem:** Analytics, Replay, and Shipments pages show plain text ("Loading analytics...") while data loads. This looks unpolished and gives no sense of the layout to come.

**Fix for Analytics page:** Replace the plain loading div with a skeleton:

```jsx
function AnalyticsSkeleton() {
  return (
    <div className="flex h-screen flex-col bg-[#020617]">
      <NavBar />
      <main className="flex-1 p-6 space-y-6">
        <div className="h-8 w-48 rounded-lg bg-white/5 animate-pulse" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[0,1,2,3].map(i => (
            <div key={i} className="h-24 rounded-2xl bg-white/5 animate-pulse" />
          ))}
        </div>
        <div className="h-64 rounded-2xl bg-white/5 animate-pulse" />
        <div className="grid grid-cols-2 gap-4">
          <div className="h-56 rounded-2xl bg-white/5 animate-pulse" />
          <div className="h-56 rounded-2xl bg-white/5 animate-pulse" />
        </div>
      </main>
    </div>
  );
}
```

Use this in the `if (!data)` branch.

---

### 6.2 Add Keyboard Navigation to Shipments Table

**File:** `dashboard/app/shipments/components/ShipmentsTab.jsx`

**Problem:** The shipments table has no keyboard navigation. Pressing `↑`/`↓` should move between rows; `Enter` should open the detail modal; `E` should trigger edit; `Delete` should prompt deletion.

**Fix:** Add a `useEffect` on the table container that maps these keys to table row selection state.

---

### 6.3 `custom-scrollbar` Class Is Referenced but May Not Be Defined

**Problem:** `custom-scrollbar` is used in at least 6 components, but it is never defined in any CSS file visible in the repository. If `globals.css` does not include it, the scrollbar styling silently falls back to the browser default.

**Fix:** Add to `dashboard/app/globals.css`:

```css
.custom-scrollbar {
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.12) transparent;
}

.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
  height: 4px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.12);
  border-radius: 2px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.25);
}
```

---

### 6.4 Globe Paused State Needs a Better Fallback

**File:** `dashboard/app/page.js`

**Problem:** When the globe is paused (`isGlobeActive === false`), the entire view area shows only the text "Globe is paused while inactive." — a full-screen empty dark panel with a single grey string.

**Fix:** Show a minimal static dashboard with KPI numbers pulled from the Zustand stores instead:

```jsx
{!isGlobeActive && (
  <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#020617] gap-8">
    <p className="text-white/30 text-sm">Globe paused · Tab inactive</p>
    <div className="flex gap-6">
      <PausedKpiCard label="Active Shipments" value={shipments.filter(s => s.status === 'active').length} />
      <PausedKpiCard label="Disruptions" value={disruptions.length} color="text-red-400" />
      <PausedKpiCard label="News Alerts" value={newsAlerts.length} color="text-cyan-400" />
    </div>
    <button onClick={() => setGlobeEnabled(true)} className="text-xs text-white/40 hover:text-white/70 border border-white/10 rounded-full px-4 py-1.5">
      Resume Globe
    </button>
  </div>
)}
```

---

### 6.5 Add Error Boundary Around Each Page Section

**Problem:** `ErrorBoundary` is defined and used around `GlobeView`, but nothing else is wrapped. A crash inside `AgentPanel`, `DecisionModal`, or `NewsFeed` will white-screen the entire application.

**Fix:** Wrap every dynamically-loaded component with the existing `ErrorBoundary`:

```jsx
<ErrorBoundary fallback={<MinimalErrorFallback name="Agent Panel" />}>
  <AgentPanel ... />
</ErrorBoundary>
```

Create a `MinimalErrorFallback` component that shows a non-destructive inline error and a retry button.

---

### 6.6 Add a Settings / Preferences Page

No user preferences exist anywhere. Add `dashboard/app/settings/page.js` with the following controls:

| Setting | Type | Storage |
|---|---|---|
| Notification preferences (push, email) | Toggle | Firestore |
| Globe auto-rotate timeout (5s / 10s / 30s / never) | Select | localStorage |
| Default filter (all / active / delayed) | Select | localStorage |
| Theme mode (dark / light) | Toggle | localStorage + cookie |
| Org display name | Text | Firestore |

---

## 7. Light Mode Implementation Guide

> **Constraint:** Light mode must apply to all pages **except the Globe page** (`/`). The Globe is a Cesium 3D viewer with hardcoded dark sky/atmosphere and cannot meaningfully invert to light mode.

---

### 7.1 Strategy: CSS Custom Properties + `data-theme` Attribute

The recommended approach is to use CSS custom properties scoped to a `data-theme="light"` attribute on the `<html>` element, with all non-globe pages reading from those properties. The Globe page explicitly opts out by setting `data-globe="true"` on its root element and using CSS specificity to override.

---

### 7.2 Step 1 — Define the Token System

In `dashboard/app/globals.css`, define both themes:

```css
/* ── Dark theme (default) ── */
:root,
[data-theme="dark"] {
  --bg-base:        #020617;
  --bg-surface:     #0f172a;
  --bg-elevated:    #1e293b;
  --bg-overlay:     rgba(0, 0, 0, 0.6);

  --border-subtle:  rgba(255, 255, 255, 0.06);
  --border-default: rgba(255, 255, 255, 0.12);
  --border-strong:  rgba(255, 255, 255, 0.25);

  --text-primary:   rgba(255, 255, 255, 0.90);
  --text-secondary: rgba(255, 255, 255, 0.55);
  --text-muted:     rgba(255, 255, 255, 0.30);

  --accent-cyan:    #22d3ee;
  --accent-blue:    #3b82f6;
  --accent-amber:   #f59e0b;
  --accent-red:     #ef4444;
  --accent-green:   #22c55e;

  --shadow-card:    0 4px 24px rgba(0, 0, 0, 0.45);
  --shadow-modal:   0 24px 80px rgba(0, 0, 0, 0.70);
}

/* ── Light theme ── */
[data-theme="light"] {
  --bg-base:        #f1f5f9;
  --bg-surface:     #ffffff;
  --bg-elevated:    #f8fafc;
  --bg-overlay:     rgba(255, 255, 255, 0.85);

  --border-subtle:  rgba(0, 0, 0, 0.06);
  --border-default: rgba(0, 0, 0, 0.12);
  --border-strong:  rgba(0, 0, 0, 0.25);

  --text-primary:   rgba(15, 23, 42, 0.92);
  --text-secondary: rgba(15, 23, 42, 0.55);
  --text-muted:     rgba(15, 23, 42, 0.35);

  --accent-cyan:    #0891b2;
  --accent-blue:    #2563eb;
  --accent-amber:   #d97706;
  --accent-red:     #dc2626;
  --accent-green:   #16a34a;

  --shadow-card:    0 2px 12px rgba(0, 0, 0, 0.08);
  --shadow-modal:   0 20px 60px rgba(0, 0, 0, 0.18);
}

/* ── Globe page always stays dark regardless of theme ── */
[data-globe="true"],
[data-globe="true"] * {
  /* Force dark values inline — Cesium controls all visuals */
  color-scheme: dark;
}
```

---

### 7.3 Step 2 — Theme Context Provider

Create `dashboard/app/providers/ThemeProvider.jsx`:

```jsx
'use client';

import { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext({ theme: 'dark', toggleTheme: () => {} });

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState('dark');

  // Hydrate from localStorage on mount
  useEffect(() => {
    const stored = typeof window !== 'undefined'
      ? window.localStorage.getItem('gdg_theme')
      : null;
    if (stored === 'light' || stored === 'dark') {
      setTheme(stored);
      document.documentElement.setAttribute('data-theme', stored);
    }
  }, []);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    window.localStorage.setItem('gdg_theme', next);
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
```

Add `ThemeProvider` to `layout.js` wrapping `DataProvider`:

```jsx
<ThemeProvider>
  <DataProvider>
    {children}
  </DataProvider>
</ThemeProvider>
```

---

### 7.4 Step 3 — Globe Page Opts Out

In `dashboard/app/page.js`, add `data-globe="true"` to the root element:

```jsx
return (
  <div
    data-globe="true"
    className="flex flex-col h-screen w-screen overflow-hidden bg-[#020617]"
  >
    {/* All existing JSX unchanged */}
  </div>
);
```

This applies the CSS rule that forces `color-scheme: dark` on the globe page and all its children.

---

### 7.5 Step 4 — Migrate Pages to CSS Variables

**NavBar** — Replace hardcoded colour classes with variable-driven ones:

```jsx
// Before:
<nav className="h-12 ... bg-black/60 border-b border-white/5">

// After:
<nav className="h-12 ... bg-[var(--bg-overlay)] border-b border-[var(--border-subtle)]">
```

**Analytic page cards:**
```jsx
// Before:
<article className="rounded-2xl border border-white/10 bg-white/5 p-4">

// After:
<article className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-[var(--shadow-card)] p-4">
```

**Text colours:**
```jsx
// Before: text-white, text-white/60, text-white/40
// After:  text-[var(--text-primary)], text-[var(--text-secondary)], text-[var(--text-muted)]
```

Apply this pattern to: `analytics/page.js`, `shipments/page.js`, `replay/page.js`, `health/page.js`, `settings/page.js`, `login/page.js`, and all non-Globe components.

---

### 7.6 Step 5 — Theme Toggle Button in NavBar

Add the toggle to `NavBar.jsx` (only rendered on non-globe pages):

```jsx
import { useTheme } from '../providers/ThemeProvider.jsx';
import { Moon, Sun } from 'lucide-react';

// Inside NavBar:
const { theme, toggleTheme } = useTheme();
const isGlobePage = pathname === '/';

// In the JSX (right side of nav, before the links):
{!isGlobePage && (
  <button
    onClick={toggleTheme}
    aria-label="Toggle theme"
    className="p-1.5 rounded-lg border border-[var(--border-default)] hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] transition-colors"
  >
    {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
  </button>
)}
```

---

### 7.7 Step 6 — Recharts in Light Mode

Recharts uses inline colour props. Pass them from theme tokens:

```jsx
// analytics/page.js
const { theme } = useTheme();
const tickColor = theme === 'light' ? '#475569' : '#64748b';
const tooltipBg = theme === 'light' ? '#ffffff' : '#0f172a';
const tooltipBorder = theme === 'light' ? '1px solid rgba(0,0,0,0.1)' : '1px solid rgba(255,255,255,0.08)';

// Pass to charts:
<XAxis tick={{ fill: tickColor, fontSize: 11 }} />
<Tooltip contentStyle={{ background: tooltipBg, border: tooltipBorder }} />
```

---

### 7.8 Light Mode Colour Reference

| Token | Dark Value | Light Value | Use |
|---|---|---|---|
| `--bg-base` | `#020617` | `#f1f5f9` | Page background |
| `--bg-surface` | `#0f172a` | `#ffffff` | Cards, panels |
| `--bg-elevated` | `#1e293b` | `#f8fafc` | Hovered cards, inputs |
| `--bg-overlay` | `rgba(0,0,0,0.6)` | `rgba(255,255,255,0.85)` | NavBar, modals |
| `--border-default` | `rgba(255,255,255,0.12)` | `rgba(0,0,0,0.12)` | Card borders |
| `--text-primary` | `rgba(255,255,255,0.90)` | `rgba(15,23,42,0.92)` | Headings, values |
| `--text-secondary` | `rgba(255,255,255,0.55)` | `rgba(15,23,42,0.55)` | Labels, captions |
| `--text-muted` | `rgba(255,255,255,0.30)` | `rgba(15,23,42,0.35)` | Placeholders |
| `--accent-cyan` | `#22d3ee` | `#0891b2` | Primary accent |
| `--shadow-card` | `0 4px 24px rgba(0,0,0,0.45)` | `0 2px 12px rgba(0,0,0,0.08)` | Card elevation |

---

## 8. Professional UI Upgrade Guide

The following upgrades target the gap between "functional project" and "production platform." Each section is independently implementable.

---

### 8.1 NavBar — Command Bar Upgrade

**Current state:** A minimal 12-height bar with plain text links and no visual hierarchy.

**Upgrade — Floating Command Bar:**

The NavBar should feel like a command surface, not a generic nav strip. Replace it with a floating pill bar that lifts slightly off the page on hover, with animated active state underlines and a live system status pulse.

```jsx
// dashboard/app/components/NavBar.jsx — full replacement

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, BarChart3, Globe, Package, RotateCcw, Settings } from 'lucide-react';
import { useTheme } from '../providers/ThemeProvider.jsx';

const NAV_ITEMS = [
  { href: '/', label: 'Globe', icon: Globe },
  { href: '/shipments', label: 'Shipments', icon: Package },
  { href: '/replay', label: 'Replay', icon: RotateCcw },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/health', label: 'System', icon: Activity },
];

export default function NavBar() {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const isGlobePage = pathname === '/';

  return (
    <nav
      className="h-14 shrink-0 flex items-center justify-between px-5
                 bg-[var(--bg-overlay)] backdrop-blur-xl
                 border-b border-[var(--border-subtle)] z-40
                 transition-colors duration-300"
    >
      {/* Brand */}
      <div className="flex items-center gap-3">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-500/30 to-blue-600/20
                        border border-cyan-400/25 flex items-center justify-center">
          <span className="text-[10px] font-bold text-cyan-300 tracking-tighter">SC</span>
        </div>
        <div className="hidden sm:block">
          <span className="text-[13px] font-semibold text-[var(--text-primary)] tracking-tight">
            Anti-Fragile
          </span>
          <span className="ml-1.5 text-[11px] text-[var(--text-muted)] tracking-wide hidden md:inline">
            Supply Chain
          </span>
        </div>
      </div>

      {/* Links */}
      <div className="flex items-center bg-[var(--bg-elevated)] rounded-xl border
                      border-[var(--border-subtle)] p-1 gap-0.5">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = href === '/'
            ? pathname === '/'
            : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={[
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium',
                'transition-all duration-150',
                active
                  ? 'bg-[var(--bg-overlay)] text-[var(--text-primary)] shadow-sm'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-overlay)]/40',
              ].join(' ')}
            >
              <Icon className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">{label}</span>
            </Link>
          );
        })}
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-2">
        {!isGlobePage && (
          <ThemeToggleButton theme={theme} onToggle={toggleTheme} />
        )}
        <Link
          href="/settings"
          className="p-1.5 rounded-lg border border-[var(--border-subtle)]
                     text-[var(--text-muted)] hover:text-[var(--text-secondary)]
                     hover:bg-[var(--bg-elevated)] transition-colors"
          aria-label="Settings"
        >
          <Settings className="w-3.5 h-3.5" />
        </Link>
      </div>
    </nav>
  );
}
```

---

### 8.2 Analytics Page — Professional Data Dashboard

**Current state:** Four flat KPI cards and basic Recharts wrappers with minimal styling.

**Upgrade — Glassmorphic Command Intelligence Page:**

The analytics page should feel like a military operations centre, not a stats page.

**KPI Cards:**
- Replace flat cards with cards that have a thin animated top-border in the accent colour
- Add sparkline trend arrows (▲ +12% vs last period) below each value
- Use a monospace display font for the numbers (`font-mono text-4xl font-light`)

```jsx
function KpiCard({ label, value, sub, trend, accentColor = 'var(--accent-cyan)' }) {
  return (
    <article
      className="relative overflow-hidden rounded-2xl border border-[var(--border-default)]
                 bg-[var(--bg-surface)] shadow-[var(--shadow-card)] p-5 group"
    >
      {/* Top accent bar */}
      <div
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)` }}
      />
      <p className="text-[10px] uppercase tracking-[0.25em] text-[var(--text-muted)]">{label}</p>
      <p className="mt-3 font-mono text-4xl font-light text-[var(--text-primary)] leading-none">
        {value}
      </p>
      <div className="mt-2 flex items-center justify-between">
        <p className="text-xs text-[var(--text-secondary)]">{sub}</p>
        {trend && (
          <span className={`text-xs font-medium ${trend > 0 ? 'text-green-400' : 'text-red-400'}`}>
            {trend > 0 ? '▲' : '▼'} {Math.abs(trend)}%
          </span>
        )}
      </div>
    </article>
  );
}
```

**Chart containers:** Replace inline section/article wrappers with a standardised chart panel:

```jsx
function ChartPanel({ title, subtitle, children }) {
  return (
    <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)]
                    shadow-[var(--shadow-card)] p-5 space-y-4">
      <div>
        <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-[0.18em]">
          {title}
        </p>
        {subtitle && (
          <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">{subtitle}</p>
        )}
      </div>
      {children}
    </div>
  );
}
```

---

### 8.3 Shipments Page — Professional Data Table

**Current state:** A basic table with minimal row styling and no visual hierarchy.

**Upgrade requirements:**

- **Frozen column headers** that stay visible on scroll with a `backdrop-blur` effect
- **Status pills** use icon + text: `● Active`, `⚠ Delayed`, `↻ Rerouted`, `✕ Disrupted`
- **Row hover** should show a subtle left-accent border and background lift
- **Cargo value** should format as abbreviated currency: `$1.2M`, `$250K`
- **Row expand** — clicking a row expands an inline detail panel rather than opening a full modal (save modals for editing only)
- **Column sorting** — clicking column headers sorts in-place with a direction indicator

**Cargo value formatter:**
```js
function formatCargo(usd) {
  if (!usd) return '—';
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`;
  if (usd >= 1_000) return `$${(usd / 1_000).toFixed(0)}K`;
  return `$${usd}`;
}
```

---

### 8.4 Replay Page — Timeline Visualisation

**Current state:** A horizontal scroll of event cards with a range input slider. The slider does nothing visually meaningful.

**Upgrade — Vertical Severity Timeline:**

Replace the horizontal card scroll with a vertical timeline on the left side and detail panel on the right:

```
[Vertical timeline]          [Detail Panel]
  ●── Apr 19, 14:32          Location: Strait of Malacca
  │   WEATHER · Sev 7        Type: WEATHER
  │                          Severity: 7 / 10
  ●── Apr 18, 09:15          Confidence: 84%
  │   STRIKE · Sev 9         ─────────────────
  │                          Raw Description:
  ●── Apr 17, 22:41          Tropical storm...
      GEOPOLITICAL · Sev 4
```

Style the timeline dots with severity-based colour and size. A severity-9 event should have a pulsing red dot three times the size of a severity-3 dot.

---

### 8.5 Globe Page — Overlay Refinements

The Cesium globe is powerful but the 2D overlays are plain. Upgrade the following:

**Agent Status Badge** — The current badge shows only `Idle Agent` in monospace. Upgrade to show a real-time animated signal:

```jsx
// Pulse ring when any agent is active
<div className="relative">
  {status !== 'idle' && (
    <span className="absolute inset-0 rounded-full animate-ping opacity-30 bg-current" />
  )}
  <span className={`w-2.5 h-2.5 rounded-full ${config.color}`} />
</div>
```

**Globe Controls Panel** — The filter buttons are plain text in a `backdrop-blur` box. Upgrade to show mini sparklines per status (a 7px-tall bar for each of the last 20 shipments in that status):

The filter buttons should also show a thin coloured underline instead of background fill for the active state — prevents visual competition with the globe.

**Tooltip** — The hover tooltip appears at a fixed translate but snaps position sharply. Add a CSS `transition: transform 0.08s ease` for a smoother follow.

---

### 8.6 Decision Modal — Surgical Action Surface

**Current state:** Three resolution option cards in a `flex-row` with plain approve buttons.

**Upgrade requirements:**

- **Risk Matrix:** Above the option cards, add a 2×2 risk/reward scatter plot (Cost vs Speed) with the three options plotted as labelled dots. Built with pure SVG, no library required.
- **Option cards:** Add a horizontal progress bar at the bottom showing relative cost visually (Option 1 = 60% of max cost, Option 2 = 100%, Option 3 = 35%).
- **Keyboard shortcut labels:** The `[1]`, `[2]`, `[3]` keyboard hints should be shown as actual `<kbd>` elements styled as physical keycap buttons.

```jsx
<kbd className="inline-flex items-center justify-center w-5 h-5 rounded border
                border-white/20 bg-white/8 text-[10px] font-mono text-white/50
                shadow-[inset_0_-1px_0_rgba(0,0,0,0.3)]">
  {shortcutKey}
</kbd>
```

- **Approved state:** After approval, the selected option card should run an animation: the background fills with a green gradient sweep from left to right over 0.6s, then fades to a softer "confirmed" state. Rejected options dim to 30% opacity.

---

### 8.7 Login Page — Premium First Impression

**Current state:** A centred card with a basic Google sign-in button.

**Upgrade — Atmospheric Entry Screen:**

The login page is the only page where you can freely use dramatic visuals without competing with data. Make it memorable.

```jsx
// Animated star field background using CSS custom properties
<div className="absolute inset-0">
  <canvas ref={starsRef} className="absolute inset-0 w-full h-full opacity-40" />
  <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#040615]" />
</div>
```

- Add a subtle animated particle field (50–80 tiny dots moving at 0.1–0.3px/frame using `requestAnimationFrame`)
- The sign-in card should have a `border-image` gradient border: `border-image: linear-gradient(135deg, rgba(34,211,238,0.4), transparent 40%, rgba(59,130,246,0.4)) 1`
- The button should have a micro-animation on hover: the background sweeps from left with a `linear-gradient` via CSS `background-position` transition
- Below the card: show 3 mini feature badges in a row — `Real-time Disruptions`, `AI Resolution`, `Global Coverage`

---

### 8.8 News Feed — Enhanced Signal Cards

**Current state:** Article cards with an emoji icon, headline, and truncated summary.

**Upgrade:**

- **Source provenance bar:** A thin coloured left-border on each card that maps to source credibility (Reuters = dark blue, GDELT = purple, Maritime News = teal).
- **Time-ago labels** instead of raw timestamps: "3m ago", "1h ago", "Yesterday".
- **Inline action:** A small `➕ Add to watch` button that pins a news item to a watched list stored in Zustand.
- **Severity pulse:** Cards with `severity >= 8` should have a very subtle red-tinged background pulse (`animate-pulse bg-red-500/5`) to demand attention without being alarming.

---

### 8.9 Typography System

The current app uses `Geist` and `Geist Mono` exclusively. These are excellent but the display typography needs variation for hierarchy.

**Recommended type scale:**

```js
// dashboard/app/layout.js — add alongside existing fonts
import { Space_Grotesk, Fira_Code } from 'next/font/google';

const spaceGrotesk = Space_Grotesk({
  variable: '--font-display',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

const firaCode = Fira_Code({
  variable: '--font-mono',
  subsets: ['latin'],
  weight: ['300', '400', '500'],
});
```

**Apply by element type:**

| Element | Font | Size | Weight |
|---|---|---|---|
| Page headings (H1) | `var(--font-display)` | `2.5rem` / `3rem` | `600` |
| Section titles (H2) | `var(--font-display)` | `1.25rem` | `500` |
| Body text | `var(--font-geist-sans)` | `0.875rem` | `400` |
| KPI values | `var(--font-mono)` | `2.5rem–3rem` | `300` |
| Code / IDs / timestamps | `var(--font-mono)` | `0.75rem` | `400` |
| Labels / badges | `var(--font-geist-sans)` | `0.65rem` | `600` with `letter-spacing: 0.2em` |

---

### 8.10 Motion Design System

Add a consistent motion language to the application. Create `dashboard/app/lib/motion.js`:

```js
// Shared Framer Motion variants for consistent animation language

export const PAGE_ENTER = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.32, ease: [0.16, 1, 0.3, 1] },
  },
};

export const STAGGER_CHILDREN = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.06, delayChildren: 0.1 },
  },
};

export const CARD_ITEM = {
  hidden: { opacity: 0, y: 8, scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.24, ease: [0.4, 0, 0.2, 1] },
  },
};

export const SLIDE_FROM_RIGHT = {
  hidden: { opacity: 0, x: 24 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.28, ease: [0.4, 0, 0.2, 1] } },
  exit: { opacity: 0, x: 24, transition: { duration: 0.18 } },
};
```

Wrap each page's `<main>` with `<motion.main variants={PAGE_ENTER} initial="hidden" animate="visible">`.

---

## 9. Performance & Reliability Improvements

---

### 9.1 Memoize Expensive GlobeView Computations

`groupedRoutes` in `GlobeView.jsx` runs on every shipment or reroutedRoutes change. With 1000+ shipments this is expensive. The current `useMemo` is correct but the dependency on `reroutedRoutes` (an object) causes unnecessary re-runs due to reference inequality.

**Fix:** Store `reroutedRoutes` as a stable Map in Zustand and use `useShallow` comparison:

```js
const reroutedRoutes = useAlertStore(
  useShallow((x) => x.reroutedRoutes)
);
```

---

### 9.2 Lazy-Load Cesium Only When Globe Is Enabled

Currently `GlobeView` is wrapped in `dynamic(() => import(...), { ssr: false })`, but the Cesium bundle (several MB) is still fetched on initial page load even if the user immediately switches to Shipments. Add `prefetch={false}` to the dynamic import and only trigger the import when `globeEnabled === true`.

---

### 9.3 Firestore Index: Add `createdAt` Composite Index for Resolutions

The analytics route queries resolutions by `createdAt desc`. Supabase has an index, but Firestore does not have a composite index defined for `(createdAt desc, status)`. Add to `firestore.indexes.json`:

```json
{
  "indexes": [
    {
      "collectionGroup": "resolutions",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "createdAt", "order": "DESCENDING" },
        { "fieldPath": "status", "order": "ASCENDING" }
      ]
    }
  ]
}
```

---

### 9.4 Add `Content-Security-Policy` Header

The Next.js app sends no `Content-Security-Policy` header. This allows any inline script injection. Add in `next.config.js`:

```js
const cspHeader = `
  default-src 'self';
  script-src 'self' 'unsafe-eval' 'unsafe-inline' https://cesium.com;
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  img-src 'self' data: blob: https://*.tile.openstreetmap.org https://ion.cesium.com;
  connect-src 'self' https://*.supabase.co https://firestore.googleapis.com wss://;
  font-src 'self' https://fonts.gstatic.com;
  worker-src blob:;
  frame-src 'none';
`.replace(/\n/g, ' ').trim();

module.exports = {
  async headers() {
    return [{ source: '/(.*)', headers: [{ key: 'Content-Security-Policy', value: cspHeader }] }];
  },
};
```

---

## 10. Security Hardening

---

### 10.1 `INTERNAL_TOKEN` Not Validated on All Internal Routes

**File:** Multiple `route.js` files under `dashboard/app/api/`

**Problem:** Some internal routes (e.g. `/api/webhooks/disruption`) check for `INTERNAL_TOKEN` but others (e.g. `/api/execute`, `/api/news-poll`) only validate the presence of a body without any token check.

**Fix:** Create a shared internal auth middleware:

```js
// dashboard/app/api/_internal-auth.js
export function verifyInternalToken(req) {
  const token =
    req.headers.get('Authorization')?.replace('Bearer ', '') ||
    req.headers.get('X-Internal-Token');
  if (!token || token !== process.env.INTERNAL_TOKEN) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
  return null; // null = pass
}
```

Apply to every route that should only be called by backend services.

---

### 10.2 API v1 Key Is Not Rate-Limited

**File:** `dashboard/app/api/v1/_auth.js`

**Problem:** The API key validation checks if the key exists in Supabase but imposes no rate limiting. A leaked key allows unlimited requests.

**Fix:** Use Vercel's `@vercel/kv` or a Supabase counter to implement a sliding window rate limit:

```js
// Per-key: 100 requests per 60 seconds
const count = await kv.incr(`ratelimit:${apiKey}`);
if (count === 1) await kv.expire(`ratelimit:${apiKey}`, 60);
if (count > 100) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
```

---

## 11. Testing & Observability

---

### 11.1 Add Integration Tests for the Critical Path

The smoke tests in `scripts/smoke-overall.mjs` only verify health endpoints. Add integration tests for the critical path: disruption → impact → resolution → dashboard update.

Create `tests/integration/pipeline.test.mjs`:

```js
// 1. Inject a disruption via the disruption agent
// 2. Poll the event bus until an impact-report event appears
// 3. Poll until a resolution appears in Firestore
// 4. Verify the disruption appears in /api/disruptions
// 5. Verify /api/analytics returns updated counts
```

---

### 11.2 Add OpenTelemetry Traces to All Agents

Each agent currently logs to stdout with no structured correlation. Add `@opentelemetry/sdk-node` to each Fastify service with trace IDs that match the disruption `traceId`, so a single disruption can be followed across all 4 agents in a tracing backend.

---

### 11.3 Add `healthScore` to Each Agent's `/health` Endpoint

The current `/health` responses return minimal data. Extend the response schema:

```js
{
  status: 'ok',
  healthScore: 98,       // 0–100
  lastEventAt: '...',    // ISO timestamp of last processed event
  pendingQueueDepth: 0,  // events waiting to be processed
  version: '1.4.2',      // semver from package.json
  uptime: 3600,          // seconds since process start
}
```

This lets `AgentHealthPanel` show a proper health percentage bar.

---

*End of GDG Professional Upgrade Guide — Phase 7*

> This guide was authored against the Phase 7 codebase snapshot dated 2026-04-21. All file paths are relative to the repository root unless stated otherwise.
