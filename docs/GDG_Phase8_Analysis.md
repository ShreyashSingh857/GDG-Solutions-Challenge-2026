# GDG Supply Chain — Phase 8 Analysis: Bugs & Improvements

> Full source audit of the latest zip. Every finding is evidence-based from the actual files. No assumptions.

---

## Confirmed Fixed From Phase 7

- ✅ Webhook scenario injection (`SCENARIO_MAP` branch in `/api/webhooks/disruption/route.js`)
- ✅ Firestore feedback write rule (`match /feedback/{rank}` with `allow write: if isAuthed()`)
- ✅ `disruptions` Supabase migration (`20260420000000_create_disruptions.sql`)
- ✅ `NEWS_RELEVANCE_THRESHOLD` configurable via env var
- ✅ News poll proxy (`/api/news-poll/route.js`, `NewsFeed` calls `/api/news-poll`)
- ✅ Demo script updated with `/dev` reference and pre-poll step
- ✅ Shipment CRUD fully implemented — `ShipmentModal`, `useShipmentMutations`, `POST /api/shipments`, `PATCH /api/shipments/[id]`, `DELETE /api/shipments/[id]`
- ✅ Cesium Ion token conditional: falls back to OSM when token absent
- ✅ AgentChatSidebar renders Gemini output via `ReactMarkdown + remark-gfm`
- ✅ `custom-scrollbar` CSS class defined in `globals.css`

---

## Part 1 — Active Bugs

### BUG 1 (CRITICAL) — Four Core Supabase Tables Have No CREATE TABLE Migration

The code writes to `impact_reports`, `impact_report_shipments`, `resolutions`, and `resolution_options` via `resilientUpsert`. None of these tables have a `CREATE TABLE` statement in any migration file. The constraint migration `20260419000000_add_unique_constraints_for_upserts.sql` tries to `ALTER TABLE` these tables to add unique constraints — but on a fresh Supabase project these `ALTER` statements will throw `ERROR: relation does not exist`, silently aborting the entire migration run.

The result on any fresh deployment: every `resilientUpsert` call for impact reports, resolution options, and resolutions hits an `undefined table` error and gets queued to the retry buffer indefinitely. The pipeline works (Firestore is the primary store) but the entire Supabase analytics layer is dark.

**Fix — new migration `supabase/migrations/20260420000001_create_pipeline_tables.sql`:**

```sql
-- Impact reports summary table
CREATE TABLE IF NOT EXISTS public.impact_reports (
  id                    TEXT PRIMARY KEY,
  disruption_id         TEXT NOT NULL,
  trace_id              TEXT,
  cascade_risk          TEXT NOT NULL DEFAULT 'MEDIUM'
                        CHECK (cascade_risk IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  urgency               INTEGER NOT NULL DEFAULT 5,
  total_cargo_at_risk_usd BIGINT DEFAULT 0,
  analysis_text         TEXT,
  shipment_count        INTEGER DEFAULT 0,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_impact_reports_disruption ON public.impact_reports (disruption_id);
CREATE INDEX IF NOT EXISTS idx_impact_reports_created    ON public.impact_reports (created_at DESC);
ALTER TABLE public.impact_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON public.impact_reports FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "auth_read"        ON public.impact_reports FOR SELECT TO authenticated USING (TRUE);

-- Per-shipment impact detail rows
CREATE TABLE IF NOT EXISTS public.impact_report_shipments (
  id               BIGSERIAL PRIMARY KEY,
  impact_report_id TEXT NOT NULL REFERENCES public.impact_reports(id) ON DELETE CASCADE,
  shipment_id      TEXT NOT NULL,
  distance_km      REAL,
  impact_score     REAL,
  cargo_value_usd  BIGINT,
  carrier          TEXT,
  origin           TEXT,
  destination      TEXT,
  corridor         TEXT,
  current_lat      DOUBLE PRECISION,
  current_lng      DOUBLE PRECISION,
  status_at_impact TEXT,
  UNIQUE (impact_report_id, shipment_id)
);
CREATE INDEX IF NOT EXISTS idx_irs_impact_report ON public.impact_report_shipments (impact_report_id);
ALTER TABLE public.impact_report_shipments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON public.impact_report_shipments FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "auth_read"        ON public.impact_report_shipments FOR SELECT TO authenticated USING (TRUE);

-- Resolution parent records
CREATE TABLE IF NOT EXISTS public.resolutions (
  id                     TEXT PRIMARY KEY,
  trace_id               TEXT,
  impact_report_id       TEXT,
  disruption_id          TEXT NOT NULL,
  cascade_risk           TEXT,
  urgency                INTEGER,
  total_cargo_at_risk_usd BIGINT,
  analysis_text          TEXT,
  option_count           INTEGER DEFAULT 3,
  status                 TEXT NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','resolved','dismissed')),
  selected_rank          INTEGER,
  resolved_at            TIMESTAMPTZ,
  created_at             TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_resolutions_disruption ON public.resolutions (disruption_id);
CREATE INDEX IF NOT EXISTS idx_resolutions_status     ON public.resolutions (status);
CREATE INDEX IF NOT EXISTS idx_resolutions_created    ON public.resolutions (created_at DESC);
ALTER TABLE public.resolutions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON public.resolutions FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "auth_read"        ON public.resolutions FOR SELECT TO authenticated USING (TRUE);

-- Resolution option rows (one per rank per resolution)
CREATE TABLE IF NOT EXISTS public.resolution_options (
  id               BIGSERIAL PRIMARY KEY,
  resolution_id    TEXT NOT NULL REFERENCES public.resolutions(id) ON DELETE CASCADE,
  trace_id         TEXT,
  rank             INTEGER NOT NULL CHECK (rank IN (1,2,3)),
  title            TEXT NOT NULL,
  description      TEXT,
  cost_delta       INTEGER DEFAULT 0,
  time_delta       INTEGER DEFAULT 0,
  supplier_id      TEXT,
  supplier_name    TEXT,
  confidence       REAL DEFAULT 0.75,
  route_geojson    JSONB,
  transport_mode   TEXT DEFAULT 'sea-freight',
  selected         BOOLEAN DEFAULT FALSE,
  executed_at      TIMESTAMPTZ,
  UNIQUE (resolution_id, rank)
);
CREATE INDEX IF NOT EXISTS idx_resolution_options_resolution ON public.resolution_options (resolution_id);
ALTER TABLE public.resolution_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON public.resolution_options FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "auth_read"        ON public.resolution_options FOR SELECT TO authenticated USING (TRUE);
```

Also update `20260419000000_add_unique_constraints_for_upserts.sql` — wrap the `ALTER TABLE` blocks in existence guards (they already use `DO $$ ... END $$` blocks which handle this, so no change needed if the migration above runs first).

---

### BUG 2 (HIGH) — AlertToast Fires On Every Page Load For Existing Disruptions

`AlertToast.jsx` compares `disruptions.length > prevLengthRef.current` where `prevLengthRef.current` starts at `0`. The `useDisruptions` hook calls `addDisruption` for every document with `change.type === 'added'` — which on initial Firestore snapshot includes all existing documents. With 5 disruptions in Firestore, on page load the store gets 5 items, `5 > 0` is true, and a toast fires for the newest disruption — which is not new at all.

**Root cause:** There is no distinction between "document added during this session" and "document that existed before the page loaded."

**Fix — `dashboard/app/components/alerts/AlertToast.jsx`:**

```jsx
'use client';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useAlertStore } from '../../store/alertStore.js';

const TYPE_ICONS = {
  WEATHER: '🌊', STRIKE: '✊', GEOPOLITICAL: '⚠️', INFRASTRUCTURE: '🔧', OTHER: '📡',
};

export default function AlertToastController() {
  const disruptions = useAlertStore((s) => s.disruptions);
  const prevLengthRef = useRef(null);      // null = not yet initialised
  const seenIdsRef    = useRef(new Set()); // tracks IDs already toasted this session

  useEffect(() => {
    // On the very first render, record baseline without toasting
    if (prevLengthRef.current === null) {
      prevLengthRef.current = disruptions.length;
      disruptions.forEach((d) => seenIdsRef.current.add(d.id || d.traceId));
      return;
    }

    if (disruptions.length > prevLengthRef.current) {
      const newest = disruptions[0];
      if (!newest) return;

      const id = newest.id || newest.traceId;
      if (seenIdsRef.current.has(id)) {
        prevLengthRef.current = disruptions.length;
        return; // already toasted this session — skip
      }
      seenIdsRef.current.add(id);

      const icon        = TYPE_ICONS[newest.type] || '📡';
      const zones       = (newest.affectedZones || []).slice(0, 3).join(', ') || 'Multiple zones';
      const borderColor = newest.severity >= 8 ? '#dc2626' : newest.severity >= 6 ? '#ea580c' : '#ca8a04';

      toast(
        <div className="flex flex-col gap-1 min-w-[260px]">
          <div className="flex items-center gap-2">
            <span className="text-lg">{icon}</span>
            <div>
              <p className="font-semibold text-white text-sm">{newest.type} — Severity {newest.severity}/10</p>
              <p className="text-white/70 text-xs">{newest.location}</p>
            </div>
          </div>
          <p className="text-white/50 text-xs">{zones} affected</p>
          <button
            className="mt-1 text-xs bg-white/10 hover:bg-white/20 text-white px-3 py-1 rounded-lg transition-colors text-left"
            onClick={() => useAlertStore.getState().setActiveDisruptionId(id)}
          >
            View Options →
          </button>
        </div>,
        {
          duration: 15000,
          style: {
            background: '#111827',
            border: `1px solid ${borderColor}40`,
            borderLeft: `4px solid ${borderColor}`,
            color: '#f9fafb',
          },
        }
      );
    }
    prevLengthRef.current = disruptions.length;
  }, [disruptions]);

  return null;
}
```

---

### BUG 3 (HIGH) — Delete Shipment Not Wired to UI

The backend is complete: `DELETE /api/shipments/[id]` exists and handles both Firestore and Supabase. But:

- `useShipmentMutations` has no `deleteShipment` function
- `shipmentStore` has no `removeShipment` action
- `ShipmentModal` has no delete button
- There is no way for a user to delete a shipment

**Fix 1 — `dashboard/app/store/shipmentStore.js`:** Add `removeShipment`:

```js
removeShipment: (id) =>
  set((state) => ({
    shipments: state.shipments.filter((s) => s.id !== id),
  })),
```

**Fix 2 — `dashboard/app/shipments/hooks/useShipmentMutations.js`:** Add `deleteShipment`:

```js
async function deleteShipment(id) {
  const res = await fetch(`${API}/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  useShipmentStore.getState().removeShipment(id);
  return { id };
}

return { createShipment, updateShipment, deleteShipment };
```

**Fix 3 — `dashboard/app/shipments/components/ShipmentModal.jsx`:** Add delete button for edit mode:

```jsx
// In ShipmentModal, add to props and inside the component:
export default function ShipmentModal({ shipment, onClose, onDelete }) {
  // ... existing state ...
  const { createShipment, updateShipment, deleteShipment } = useShipmentMutations();
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!window.confirm(`Delete shipment ${shipment.trackingNumber || shipment.id.slice(-8)}? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await deleteShipment(shipment.id);
      onDelete?.();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleting(false);
    }
  };

  // In the footer buttons, add when isEdit:
  // {isEdit && (
  //   <button onClick={handleDelete} disabled={deleting}
  //     className="px-4 py-2 rounded-lg text-sm font-medium text-red-400 hover:bg-red-950/40 border border-red-500/20 transition-colors disabled:opacity-50 mr-auto">
  //     {deleting ? 'Deleting...' : 'Delete'}
  //   </button>
  // )}
```

**Fix 4 — `dashboard/app/shipments/page.js`:** Pass `onDelete` to modal. Since `ShipmentModal` closes itself on success, `onDelete` can just be a no-op or a callback to refresh state (Firestore listener handles it automatically).

---

### BUG 4 (MEDIUM) — `POST /events` Has No Authentication or Rate Limiting

`disruption/api/events.route.js` accepts any `POST /events` request with a `description` field and immediately runs it through `classifyAndPublish`, which calls Gemini. There is no `INTERNAL_TOKEN` check on this endpoint. Any internet user who discovers the URL (trivial from the Render URL pattern) can exhaust the free Gemini quota with a single script.

**Fix — `disruption/api/events.route.js`:**

```js
// Add at the top of the POST handler, before processing:
const authHeader = req.headers['authorization'];
const token = authHeader?.replace('Bearer ', '').trim();
if (process.env.INTERNAL_TOKEN && token !== process.env.INTERNAL_TOKEN) {
  return reply.status(401).send({ error: 'Unauthorized', traceId: null });
}
```

Also add a basic in-memory rate limiter to cap abuse even if the token leaks:

```js
// disruption/api/events.route.js — add at module level
const requestCounts = new Map(); // ip → { count, windowStart }
const RATE_LIMIT = 20;           // max 20 classify calls per 15 min per IP
const RATE_WINDOW = 15 * 60_000;

function isRateLimited(ip) {
  const now = Date.now();
  const state = requestCounts.get(ip) || { count: 0, windowStart: now };
  if (now - state.windowStart > RATE_WINDOW) {
    requestCounts.set(ip, { count: 1, windowStart: now });
    return false;
  }
  state.count++;
  requestCounts.set(ip, state);
  return state.count > RATE_LIMIT;
}

// In the POST handler, before classifyAndPublish:
const clientIp = req.ip || req.headers['x-forwarded-for'] || 'unknown';
if (isRateLimited(clientIp)) {
  return reply.status(429).send({ error: 'Rate limit exceeded', traceId: null });
}
```

---

### BUG 5 (MEDIUM) — `api/resolutions` Fallback Ignores `activeDisruptionId`

When `useResolutions` cannot connect to Firestore (or on a permission error), it calls `loadFallback()` which hits `GET /api/resolutions`. That route returns the most recent resolution from Firestore — **regardless of which disruption is currently active**. This means the fallback path shows options from a previous disruption while the UI is waiting for the current one.

**Fix — `dashboard/app/api/resolutions/route.js`:** Accept an optional `disruptionId` query param:

```js
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const disruptionId = searchParams.get('disruptionId');

    let query = adminDb.collection('resolutions').orderBy('createdAt', 'desc').limit(1);
    if (disruptionId) {
      query = adminDb.collection('resolutions')
        .where('disruptionId', '==', disruptionId)
        .orderBy('createdAt', 'desc')
        .limit(1);
    }

    const parent = await query.get();
    if (parent.empty) return NextResponse.json({ data: null, error: null });
    const doc = parent.docs[0];
    const opt = await adminDb.collection('resolutions').doc(doc.id).collection('options').get();
    const options = opt.docs.map((d) => ({ ...d.data() })).sort((a, b) => a.rank - b.rank);
    return NextResponse.json({ data: { id: doc.id, ...doc.data(), options }, error: null });
  } catch (err) {
    return NextResponse.json({ data: null, error: err.message }, { status: 500 });
  }
}
```

Update `useResolutions.js` `loadFallback` to pass `activeDisruptionId`:

```js
const loadFallback = useCallback(async () => {
  const params = activeDisruptionId ? `?disruptionId=${encodeURIComponent(activeDisruptionId)}` : '';
  const res = await fetch(`/api/resolutions${params}`, { cache: 'no-store' });
  const json = await res.json();
  if (json.data) setResolutionWithOptions(json.data);
}, [activeDisruptionId, setResolutionWithOptions]);
```

---

### BUG 6 (LOW) — `vessel_positions`, `port_congestion`, `canal_events`, `agent_metrics` Have No RLS Policies

Migration `20260419000001_add_realtime_data_tables.sql` creates all four tables but never calls `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`. Without RLS, the Supabase `anon` role can read and write these tables directly from any browser using the public anon key. Vessel positions and port congestion data leak to any unauthenticated request.

**Fix — append to `20260419000001_add_realtime_data_tables.sql`:**

```sql
-- Enable RLS on all realtime tables
ALTER TABLE public.vessel_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.port_congestion  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canal_events     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_metrics    ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (agents write via service_role key)
CREATE POLICY "service_role_all" ON public.vessel_positions FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "service_role_all" ON public.port_congestion  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "service_role_all" ON public.canal_events     FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "service_role_all" ON public.agent_metrics    FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

-- Authenticated users can read
CREATE POLICY "auth_read" ON public.vessel_positions FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "auth_read" ON public.port_congestion  FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "auth_read" ON public.canal_events     FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "auth_read" ON public.agent_metrics    FOR SELECT TO authenticated USING (TRUE);
```

---

### BUG 7 (LOW) — `console.log` in Production in `GlobeView` `groupedRoutes` Memo

Line 261 of `GlobeView.jsx` logs every route grouping calculation including full route arrays:

```js
console.log('[Globe] Route grouping:', { uniqueRoutes: result.length, ... });
```

This fires every time any shipment status changes, which in a live system happens every few seconds via the Firestore listener. In production this creates severe console noise and measurably increases memory usage from retained log objects.

**Fix — remove or guard with `NODE_ENV`:**

```js
// Replace line 261 with:
if (process.env.NODE_ENV === 'development') {
  console.log('[Globe] Route grouping:', { uniqueRoutes: result.length, totalShipments: s.length });
}
```

---

### BUG 8 (LOW) — `NEXT_PUBLIC_CESIUM_ION_TOKEN` Not Documented in `.env.example`

`GlobeView.jsx` checks `process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN` and conditionally loads Cesium World Terrain and Bing aerial imagery when set, falling back to flat OSM tiles when absent. This token is not in `.env.example` so no developer will know it exists, and the globe will always show lower-quality OSM tiles in any deployment.

**Fix — add to `.env.example`:**

```bash
# ---- Cesium Ion (optional but recommended for globe quality) ----
# Free tier at ion.cesium.com - enables Cesium World Terrain + Bing aerial imagery
# Without this, the globe falls back to OpenStreetMap tiles (flat, no terrain)
NEXT_PUBLIC_CESIUM_ION_TOKEN=
```

---

## Part 2 — Wiring Improvements

### IMPROVEMENT 1 — GlobeView `corridors` useEffect Missing `zoomLevel` Dependency

The corridor weather polylines are rendered in a `useEffect` with deps `[corridors]` only. The effect creates polylines without any reference to `zoomLevel`. However, if you ever add label visibility to corridors (as is already done for port heatmap labels), the labels will not update when the user zooms. This is a latent bug — add `zoomLevel` to the dep array now before it causes confusion:

```js
// Change the closing line of the corridors useEffect:
  }, [corridors, zoomLevel]);   // was: [corridors]
```

---

### IMPROVEMENT 2 — `shipmentStore` Missing `removeShipment` (Required for Delete)

Covered in BUG 3 above — this is also an architectural improvement. The store should mirror the full CRUD surface:

```js
// dashboard/app/store/shipmentStore.js — complete store
export const useShipmentStore = create((set, get) => ({
  shipments: [],
  isLoading: true,

  setShipments:    (shipments) => set({ shipments, isLoading: false }),
  updateShipment:  (updated)   => set((s) => ({ shipments: s.shipments.map((x) => x.id === updated.id ? { ...x, ...updated } : x) })),
  removeShipment:  (id)        => set((s) => ({ shipments: s.shipments.filter((x) => x.id !== id) })),
  addShipment:     (ship)      => set((s) => ({ shipments: [ship, ...s.shipments] })),

  getShipmentById:         (id)       => get().shipments.find((s) => s.id === id) || null,
  getShipmentsByStatus:    (status)   => get().shipments.filter((s) => s.status === status),
  getShipmentsByCorridor:  (corridor) => get().shipments.filter((s) => s.corridor === corridor),
}));
```

---

### IMPROVEMENT 3 — `ShipmentsTab` Row Click Opens Edit But Has No Visual Indicator

Currently the row `onClick` calls `onEdit(s)` but there is no cursor or hover state visible on table rows. Users don't know rows are clickable.

**Fix — `dashboard/app/shipments/components/ShipmentsTab.jsx`:** Add `cursor-pointer` and hover to the row `className`:

```jsx
// Find the <tr> that wraps each shipment row and add:
className="border-b border-white/5 hover:bg-white/[0.03] cursor-pointer transition-colors"
```

---

### IMPROVEMENT 4 — News Agent Poll Cycle Has No Error Count Tracking in `/health`

The `news.service.js` has `getLastCycleStats()` but only tracks `fetched`, `classified`, `published`, `runAt`, and `isRunning`. It does not count the number of sources that failed in the last cycle. When all 7 scrapers return 0 results (common when GDELT is slow), there is no signal to distinguish "no relevant news" from "all sources failed."

**Fix — `news-intel/api/news.service.js`:** Add `sourceFailures` and `sourcesPolled` to the stats:

```js
let _lastCycleStats = {
  fetched: 0, classified: 0, published: 0,
  runAt: null, isRunning: false,
  sourcesPolled: 0, sourceFailures: 0,   // ← ADD
};

export function setLastCycleStats(stats) {
  _lastCycleStats = { ..._lastCycleStats, ...stats };
}

export function getLastCycleStats() { return _lastCycleStats; }
```

In `news-intel/agent/agent.js`, count settled results:

```js
const sourceResults = [gdeltResult, newsApiResult, gdacsResult, reutersResult, maritimeResult, lloydsResult, strikeResult];
const failureCount  = sourceResults.filter((r) => r.status === 'rejected').length;

setLastCycleStats({
  fetched: allArticles.length,
  classified: classified.length,
  published,
  runAt: new Date().toISOString(),
  isRunning: false,
  sourcesPolled: sourceResults.length,
  sourceFailures: failureCount,
});
```

---

### IMPROVEMENT 5 — `GlobeView` Filter Effect Iterates `entityMapRef` Incorrectly

The filter `useEffect` at line ~367 iterates `entityMapRef.current` — but `entityMapRef` stores `{ arc, originDot, destinationDot }` objects, not entity objects with a `properties.status` property. The `.getValue()` call on `entity.properties?.status` would work on a Cesium entity, but the map stores plain objects. This means the filter has no effect:

```js
// Current (broken):
for (const entity of entityMapRef.current.values()) {
  const status = entity.properties?.status?.getValue(); // entity here is {arc, originDot, destinationDot}
  // ...
}
```

**Fix — iterate the Cesium viewer's entity collection instead:**

```js
useEffect(() => {
  if (!vRef.current) return;
  vRef.current.entities.values.forEach((entity) => {
    const kind   = entity.properties?.kind?.getValue();
    const status = entity.properties?.status?.getValue();
    if (kind === 'route' || kind === 'dot') {
      entity.show = f === 'all' || status === f;
    }
  });
  vRef.current.scene.requestRender();
}, [f]);
```

---

### IMPROVEMENT 6 — `replay/page.js` Has No Loading Skeleton for Individual Event Panel

When the user scrubs the timeline slider, `selected` changes immediately but there is no visual feedback during the transition. For events fetched from Supabase, the `rawDescription` field often requires a second to populate. Add a loading state tied to `isLoading`:

```jsx
// In the selected event detail panel, replace the empty state check:
{isLoading ? (
  <div className="flex min-h-80 items-center justify-center rounded-3xl border border-dashed border-white/10 bg-black/20 text-sm text-white/35">
    Loading replay window...
  </div>
) : selected ? (
  // ... existing detail JSX
) : (
  <div className="flex min-h-80 items-center justify-center rounded-3xl border border-dashed border-white/10 bg-black/20 text-sm text-white/35">
    No disruptions found in the selected range.
  </div>
)}
```

---

### IMPROVEMENT 7 — `layout.js` Missing Viewport Meta and `og:` Tags

The `metadata` export has only `title` and `description`. For any external sharing or SEO this is insufficient, and missing `viewport` can cause zoom issues on mobile.

**Fix — `dashboard/app/layout.js`:**

```js
export const metadata = {
  title:       'AI Supply Chain — Anti-Fragile Command Center',
  description: 'Real-time multi-agent AI supply chain disruption detection and resolution.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'),
  openGraph: {
    title:       'AI Supply Chain Command Center',
    description: 'Detect, score, and resolve shipping disruptions in under 60 seconds.',
    type:        'website',
  },
};

export const viewport = {
  width:        'device-width',
  initialScale: 1,
  maximumScale: 1,   // prevent user zoom on globe — Cesium handles its own zoom
};
```

---

### IMPROVEMENT 8 — `docker-compose.yml` Uses `shell: true` Spawning (Deprecation Warning)

The smoke overall stderr log shows:
> `[DEP0190] DeprecationWarning: Passing args to a child process with shell option true`

This comes from `scripts/smoke-overall.mjs` spawning subprocesses. The warning does not affect functionality today but will become an error in a future Node.js version.

**Fix — `scripts/smoke-overall.mjs`:** Replace shell-true spawns with `execFile` or array-form `spawn`:

```js
// Replace: spawn('npm', ['run', 'smoke:scraper'], { shell: true })
// With:
import { spawn } from 'node:child_process';
const isWin = process.platform === 'win32';
spawn(isWin ? 'npm.cmd' : 'npm', ['run', 'smoke:scraper'], { shell: false, stdio: 'inherit' });
```

---

## Part 3 — Remaining Roadmap Items (Not Yet Implemented)

From the Phase 7 product roadmap, the following are confirmed absent:

| Item | Status | Effort |
|---|---|---|
| Login page + Firebase Auth middleware | ❌ Not started | 2 hrs |
| Push notifications (web-push + service worker) | ❌ Not started | 3 hrs |
| Analytics page (`/analytics`) | ❌ Not started | 3 hrs |
| Email daily digest (Resend) | ❌ Not started | 2 hrs |
| Public REST API v1 | ❌ Not started | 4 hrs |
| Outbound webhook fan-out | ❌ Not started | 2 hrs |
| Mobile fallback view | ❌ Not started | 1.5 hrs |
| Multi-tenant RLS | ❌ Not started | 3 hrs |

These are all covered with complete code in the `GDG_Phase7_Analysis_And_Product_Roadmap.md` guide already in `docs/`.

---

## Part 4 — Complete Bug Fix Priority Order

| Priority | Bug | File(s) | Effort |
|---|---|---|---|
| **P0** | Missing Supabase pipeline table migrations | new `20260420000001_create_pipeline_tables.sql` | 15 min |
| **P0** | AlertToast fires on page load for existing disruptions | `AlertToast.jsx` | 15 min |
| **P1** | Delete shipment not wired to UI | `shipmentStore.js`, `useShipmentMutations.js`, `ShipmentModal.jsx` | 30 min |
| **P1** | `/events` endpoint has no auth or rate limiting | `disruption/api/events.route.js` | 20 min |
| **P1** | `api/resolutions` fallback ignores `activeDisruptionId` | `api/resolutions/route.js`, `useResolutions.js` | 20 min |
| **P2** | RLS missing on 4 realtime tables | append to `20260419000001` migration | 10 min |
| **P2** | `console.log` in production in groupedRoutes memo | `GlobeView.jsx` line 261 | 2 min |
| **P2** | GlobeView filter effect iterates wrong map | `GlobeView.jsx` | 10 min |
| **P2** | `NEXT_PUBLIC_CESIUM_ION_TOKEN` undocumented | `.env.example` | 2 min |
| **P3** | corridors useEffect missing `zoomLevel` dep | `GlobeView.jsx` | 2 min |
| **P3** | News cycle stats missing `sourceFailures` | `news.service.js`, `agent.js` | 15 min |
| **P3** | `layout.js` missing viewport and og: tags | `layout.js` | 5 min |
| **P3** | Replay page loading skeleton | `replay/page.js` | 10 min |
| **P3** | `smoke-overall.mjs` shell deprecation warning | `scripts/smoke-overall.mjs` | 10 min |
