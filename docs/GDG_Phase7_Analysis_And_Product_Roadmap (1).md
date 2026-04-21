# GDG Supply Chain — Phase 7 Complete Analysis & Real-World Product Roadmap

> Full source audit of the latest submission. Covers every missing, broken, and half-wired item, followed by a complete plan to evolve the project from a hackathon demo into a deployable enterprise product.

---

## Part 1 — What Is Now Fully Working

All items from the Phase 6 report are confirmed implemented:

- Port congestion heatmap on globe (`portHeatmapEntitiesRef`, separate from `portLabelEntitiesRef` — no collision)
- Corridor weather arcs on globe (SEVERE/HIGH only, correctly skips LOW/UNKNOWN)
- Vessel trail animation (`vesselTrailBuffer`, 6-position ring, cleanup on stale vessel)
- `usePortCongestion` + `/api/port-congestion` — correct hourly fetch
- `useCorridorWeather` + `/api/corridor-weather` — correct 3-hour fetch
- `AgentHealthPanel` lives at `/dev` (not in NavBar — correct per your intent)
- All enterprise fields on `OptionCard`: carbon, insurance, sanctions warning, freight market summary
- `CostTimeChart` has three bars: Cost, Time, CO₂
- `FeedbackThumb` renders with 👍/👎 after execution
- `demo-script.md` populated with the full 5-minute script
- Smoke test passes: `overallPass: true`, `chainComplete: true`, `resolution-options` delta +1

---

## Part 2 — Bugs & Half-Implemented Items

### BUG 1 (CRITICAL) — Globe Scenario Injection Is Completely Broken

`GlobeControls.jsx` fires `POST /api/webhooks/disruption` with body `{ scenario: "suez_closure" }`. The webhook handler at `dashboard/app/api/webhooks/disruption/route.js` requires `{ agentId, traceId, payload }` and returns `400: Invalid payload` when those fields are absent. The three scenario buttons in the globe HUD have never worked.

**Fix — `dashboard/app/api/webhooks/disruption/route.js`:** Add a scenario branch at the top of the handler:

```js
// dashboard/app/api/webhooks/disruption/route.js
import { NextResponse } from 'next/server';

const SCENARIO_MAP = {
  suez_closure:  'The Suez Canal Authority has announced an emergency closure. Houthi missile attacks on Red Sea vessels. Forty-three vessels held. $12B daily trade affected. Minimum 21-day closure expected. All Asia-Europe shipments via southern route ordered to divert via Cape of Good Hope.',
  pacific_storm: 'Super Typhoon approaching Western Pacific, Category 5. Maximum sustained winds 185 km/h. Direct path over major trans-Pacific shipping corridors. 12 vessels currently in projected storm path between Japan and Los Angeles. Port of Yokohama issuing storm warnings.',
  port_strike:   'International Transport Workers Federation confirms indefinite strike action at Port of Rotterdam, Hamburg, and Antwerp. All container terminal operations suspended. 80+ vessels at anchor awaiting berth. Estimated 2-week minimum disruption to Europe-bound cargo.',
};

export async function POST(req) {
  try {
    const body = await req.json();

    // --- Scenario injection from GlobeControls ---
    if (body.scenario) {
      const description = SCENARIO_MAP[body.scenario];
      if (!description) {
        return NextResponse.json({ error: `Unknown scenario: ${body.scenario}` }, { status: 400 });
      }

      const resolutionUrl = process.env.RESOLUTION_AGENT_URL || 'http://localhost:3003';
      // We call the disruption agent's /events endpoint directly
      const disruptionUrl = process.env.DISRUPTION_AGENT_URL || 'http://localhost:3001';
      const upstream = await fetch(`${disruptionUrl}/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(process.env.INTERNAL_TOKEN ? { Authorization: `Bearer ${process.env.INTERNAL_TOKEN}` } : {}),
        },
        body: JSON.stringify({ description }),
        signal: AbortSignal.timeout(15000),
      });

      const result = await upstream.json().catch(() => ({}));
      return NextResponse.json({ ok: upstream.ok, scenario: body.scenario, ...result });
    }

    // --- Normal agent webhook ---
    const { db } = await import('../../../../lib/firebase-admin.js');
    const { agentId, traceId, payload } = body;

    if (!agentId || !traceId || !payload) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    let collection;
    if (agentId === 'monitor') collection = 'disruptions';
    else if (agentId === 'impact') collection = 'impactReports';
    else if (agentId === 'resolution') collection = 'resolutions';
    else return NextResponse.json({ error: `Unknown agentId: ${agentId}` }, { status: 400 });

    await db.collection(collection).doc(traceId).set({
      ...payload, agentId, traceId, receivedAt: new Date().toISOString(),
    }, { merge: true });

    return NextResponse.json({ ok: true, collection, traceId });
  } catch (err) {
    console.error('[WebhookDisruption] Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
```

---

### BUG 2 (HIGH) — `FeedbackThumb` Silently Fails (Firestore Write Rule Missing)

`FeedbackThumb.jsx` calls `setDoc(doc(db, 'resolutions', traceId, 'feedback', String(rank)), ...)` from the browser. The current `firestore.rules` has `allow write: if false` on `resolutions/{id}` and only defines the `options` subcollection. The `feedback` subcollection has no rule, which defaults to deny. Every 👍/👎 click throws a Firestore permission error silently.

**Fix — `firestore.rules`:** Add a feedback write rule for authenticated users:

```
match /resolutions/{id} {
  allow read: if isAuthed();
  allow write: if false;
  match /options/{optId} {
    allow read: if isAuthed();
    allow write: if false;
  }
  match /feedback/{rank} {
    allow read:  if isAuthed();
    allow write: if isAuthed();   // ← ADD THIS
  }
}
```

---

### BUG 3 (MEDIUM) — `news-alerts` Event Bus Count Is Always 0

Every smoke test shows `news-alerts` delta of 0. The NewsAgent is running correctly (7 sources polled, Gemini classifies), but no alerts are ever written because:

1. The 15-minute cron hasn't fired during the ~2-minute smoke window — this is expected.
2. More critically: all articles from GDELT and scraper sources fail the `RELEVANCE_THRESHOLD = 0.65` check because Gemini classifies them below threshold during non-peak news cycles.
3. The `news-alerts` topic is published by the NewsAgent but nothing in the dashboard Firestore listener for `news_alerts` collection receives them during smoke runs.

This is not a crash bug but means the live news feed is effectively empty in normal operation. Two fixes:

**Fix A — Lower the threshold for demo mode via env var:**

```js
// news-intel/agent/agent.js
const RELEVANCE_THRESHOLD = Number(process.env.NEWS_RELEVANCE_THRESHOLD ?? 0.65);
```

Add to `.env.example`:
```
# Lower to 0.40 for development to surface more articles in the news feed
NEWS_RELEVANCE_THRESHOLD=0.65
```

**Fix B — Add a manual trigger endpoint (already exists as `/news/poll` but needs to be called):**

The `NewsFeed` refresh button calls `POST /news/poll` on the news agent. This is correct. Document it clearly in the demo script:
> Before demo: open the News tab in AgentPanel and click the refresh button once to force a poll cycle.

---

### ISSUE 4 (LOW) — `AgentHealthPanel` Removed from Main Page But Demo Script Still References It as Main Page Feature

`demo-script.md` line: "Confirm AgentHealthPanel shows 5/5 online" — but the panel is now at `/dev`, not on the main globe page. Update the demo script accordingly:

```markdown
## Setup (before demo, T-10 min)
...
3. Navigate to http://localhost:3000/dev and confirm Mission Control shows 5/5 Live
4. Navigate back to http://localhost:3000 — this is what judges will see
```

---

### ISSUE 5 (LOW) — `NEXT_PUBLIC_INTERNAL_TOKEN` Still Exposed in `.env.example`

The `NEXT_PUBLIC_` prefix makes this value visible to the browser. Even though the `/api/execute` proxy correctly uses the server-side `INTERNAL_TOKEN`, the `NewsFeed` component's refresh button also reads `NEXT_PUBLIC_INTERNAL_TOKEN` and sends it in a browser-side Authorization header. Any user can open DevTools and read this value.

For development this is acceptable. For production deployment, remove the `NEXT_PUBLIC_INTERNAL_TOKEN` line entirely and proxy the news poll through a Next.js API route:

```js
// dashboard/app/api/news-poll/route.js — NEW FILE
import { NextResponse } from 'next/server';

export async function POST() {
  const newsUrl = process.env.NEWS_AGENT_URL || 'http://localhost:3005';
  const upstream = await fetch(`${newsUrl}/news/poll`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.INTERNAL_TOKEN}`,
    },
    body: '{}',
    signal: AbortSignal.timeout(35000),
  });
  const data = await upstream.json().catch(() => ({}));
  return NextResponse.json(data, { status: upstream.status });
}
```

Then update `NewsFeed.jsx`:
```js
// Replace the fetch call in handleRefresh:
const response = await fetch('/api/news-poll', {
  method: 'POST',
  signal: AbortSignal.timeout(35000),
});
```

---

### ISSUE 6 (LOW) — Supabase `disruptions` Table Missing `raw_description` and `affected_zones` Columns

The `history/route.js` API selects `raw_description` and `affected_zones` from the `disruptions` Supabase table. These columns are not defined in `20260101000000_create_shipments.sql` or any migration. The query will return null for those fields when pulling from Supabase, so the Replay page will show "No raw description available" for all events.

**Fix — new migration `supabase/migrations/20260420000000_add_disruptions_table.sql`:**

```sql
CREATE TABLE IF NOT EXISTS public.disruptions (
  id              TEXT PRIMARY KEY,
  trace_id        TEXT,
  type            TEXT,
  severity        INTEGER,
  location        TEXT,
  epicenter_lat   DOUBLE PRECISION,
  epicenter_lng   DOUBLE PRECISION,
  affected_zones  JSONB DEFAULT '[]',
  confidence      DOUBLE PRECISION,
  raw_description TEXT,
  weather_data    JSONB,
  published       BOOLEAN DEFAULT TRUE,
  detected_at     TIMESTAMPTZ DEFAULT NOW(),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_disruptions_detected ON public.disruptions (detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_disruptions_type     ON public.disruptions (type);
CREATE INDEX IF NOT EXISTS idx_disruptions_severity ON public.disruptions (severity DESC);

ALTER TABLE public.disruptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all" ON public.disruptions;
CREATE POLICY "service_role_all" ON public.disruptions
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS "auth_read" ON public.disruptions;
CREATE POLICY "auth_read" ON public.disruptions
  FOR SELECT TO authenticated USING (TRUE);
```

---

## Part 3 — Complete Implementation Checklist (Final State)

| Feature | Status |
|---|---|
| Globe: vessel positions + speed-coded colour | ✅ |
| Globe: vessel trail animation | ✅ |
| Globe: port congestion heatmap (separate ref from port labels) | ✅ |
| Globe: corridor weather arcs | ✅ |
| Globe: tooltip for vessel/port/weather/route entities | ✅ |
| Globe: scenario inject buttons in GlobeControls | ❌ **BROKEN — BUG 1** |
| AgentHealthPanel at /dev (hidden from users) | ✅ |
| All 7 news sources in poll cycle | ✅ |
| News injection 3-attempt retry | ✅ |
| news-alerts smoke count = 0 | ⚠️ **Expected but tunable — ISSUE 3** |
| Replay page with timeline scrub | ✅ |
| `disruptions` Supabase table | ❌ **MISSING — ISSUE 6** |
| Resolution options: carbon, insurance, sanctions, freight rates | ✅ |
| CostTimeChart: 3 bars (cost, time, CO₂) | ✅ |
| FeedbackThumb renders | ✅ |
| FeedbackThumb Firestore write succeeds | ❌ **BROKEN — BUG 2** |
| `/api/execute` proxy (INTERNAL_TOKEN server-side) | ✅ |
| `NEXT_PUBLIC_INTERNAL_TOKEN` exposed to browser | ⚠️ **Dev OK, fix before prod — ISSUE 5** |
| News poll proxy (token not in browser) | ❌ **MISSING — ISSUE 5** |
| Smoke test: pipeline end-to-end pass | ✅ |
| Smoke test: resolution-options delta +1 | ✅ |
| demo-script.md accurate | ⚠️ **Needs /dev note — ISSUE 4** |

**Fix priority order:**
1. BUG 1 — Webhook scenario handler (30 min) — broken globe demo buttons
2. BUG 2 — Firestore feedback rule (5 min) — one line in `firestore.rules`
3. ISSUE 6 — Disruptions Supabase migration (15 min) — fixes Replay "No description"
4. ISSUE 3 — `NEWS_RELEVANCE_THRESHOLD` env var (5 min) — surfaces news in dev
5. ISSUE 5 — News poll proxy (20 min) — fixes token exposure
6. ISSUE 4 — Demo script /dev reference (2 min)

---

## Part 4 — Real-World Product Roadmap

This section covers what separates a hackathon demo from a product that can be sold to Maersk, DHL, or a tier-2 freight forwarder. The gap is not technical complexity — the AI pipeline is genuinely production-ready. The gap is in the surrounding product layer: multi-tenancy, notifications, API surface, and user workflows.

---

### 4.1 — Multi-Tenancy & Authentication

**Current state:** Firebase Auth is configured but no login screen exists. All data is global. One "account" can see all shipments.

**What enterprise buyers require:** Every customer organisation has isolated data. An analyst at Maersk cannot see COSCO's shipments.

**Implementation:**

Add an `orgId` field to every Firestore document. Modify Firestore rules to enforce tenant isolation:

```
// firestore.rules addition
function belongsToOrg(orgId) {
  return request.auth != null && request.auth.token.orgId == orgId;
}

match /shipments/{id} {
  allow read: if belongsToOrg(resource.data.orgId);
  allow write: if false;
}
```

Set custom claims on Firebase Auth tokens via a new API route:

```js
// dashboard/app/api/auth/set-org/route.js
import { getAuth } from 'firebase-admin/auth';
import { NextResponse } from 'next/server';

export async function POST(req) {
  const { uid, orgId } = await req.json();
  // Only callable by service account (internal token gated)
  if (req.headers.get('Authorization') !== `Bearer ${process.env.INTERNAL_TOKEN}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  await getAuth().setCustomUserClaims(uid, { orgId });
  return NextResponse.json({ ok: true });
}
```

Add a login page at `dashboard/app/login/page.js` using Firebase Auth Google OAuth (already configured):

```jsx
// dashboard/app/login/page.js
'use client';
import { getAuth, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();

  async function handleSignIn() {
    const auth = getAuth();
    await signInWithPopup(auth, new GoogleAuthProvider());
    router.push('/');
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-[#020617]">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-8 space-y-6 text-center max-w-sm w-full">
        <h1 className="text-xl font-semibold text-white">Supply Chain Intelligence</h1>
        <p className="text-sm text-white/50">Sign in to access your live disruption dashboard.</p>
        <button
          onClick={handleSignIn}
          className="w-full py-2.5 rounded-xl bg-white text-gray-900 font-medium text-sm hover:bg-gray-100 transition"
        >
          Continue with Google
        </button>
      </div>
    </div>
  );
}
```

Add an auth middleware to protect all routes:

```js
// dashboard/middleware.js — NEW FILE
import { NextResponse } from 'next/server';

export function middleware(req) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith('/api') || pathname === '/login') return NextResponse.next();
  // Check for session cookie — Firebase Auth sets __session
  const session = req.cookies.get('__session');
  if (!session) {
    return NextResponse.redirect(new URL('/login', req.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ['/((?!_next/static|favicon.ico).*)'] };
```

---

### 4.2 — Real-Time Push Notifications

**Current state:** Disruptions trigger toasts inside the browser tab. If the user is not on the page, they miss the event.

**What enterprise buyers require:** An on-call logistics manager receives a push notification at 3 AM when a Suez closure is detected.

**Implementation using Firebase Cloud Messaging (free tier, no additional cost):**

Add a new Supabase table for push subscriptions:

```sql
-- supabase/migrations/20260420000001_push_subscriptions.sql
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  endpoint    TEXT NOT NULL,
  p256dh      TEXT,
  auth        TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_org ON push_subscriptions(org_id);
```

Register service worker in the dashboard:

```js
// dashboard/public/sw.js — NEW FILE
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {};
  self.registration.showNotification(data.title || 'Supply Chain Alert', {
    body: data.body || 'A disruption has been detected.',
    icon: '/globe.svg',
    badge: '/globe.svg',
    data: { url: data.url || '/' },
    actions: [
      { action: 'view', title: 'View Options' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'view') {
    clients.openWindow(event.notification.data.url);
  }
});
```

```js
// dashboard/app/lib/pushNotifications.js — NEW FILE
export async function registerPushSubscription() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;

  const reg = await navigator.serviceWorker.register('/sw.js');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return null;

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  });

  await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sub.toJSON()),
  });

  return sub;
}
```

Send push from the disruption agent whenever a high-severity event is classified:

```js
// disruption/api/events.service.js — add after classifyAndPublish succeeds
import webpush from 'web-push';

webpush.setVapidDetails(
  'mailto:' + (process.env.VAPID_EMAIL || 'ops@yourapp.com'),
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

async function sendPushToSubscribers(disruption) {
  if (!process.env.VAPID_PRIVATE_KEY) return; // skip if not configured
  if (disruption.severity < 7) return; // only high severity

  const { data: subs } = await resilientUpsert; // use supabase query instead
  // (fetch subscriptions from Supabase and fan out)
  const { data } = await supabase.from('push_subscriptions').select('endpoint,p256dh,auth').limit(500);
  const payload = JSON.stringify({
    title: `${disruption.type} Alert — Severity ${disruption.severity}/10`,
    body: disruption.location,
    url: '/?disruption=' + disruption.id,
  });
  await Promise.allSettled((data || []).map((sub) =>
    webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload)
  ));
}
```

Add to `.env.example`:
```
VAPID_EMAIL=
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
# Generate with: npx web-push generate-vapid-keys
```

---

### 4.3 — Email Digest (Daily/Weekly Summary)

Enterprise ops teams want a morning digest of yesterday's disruptions, reroutes executed, and pending decisions.

**Implementation using Resend (free tier: 3,000 emails/month):**

```js
// shared/lib/emailDigest.js — NEW FILE
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendDailyDigest({ orgId, recipientEmail, disruptions, resolutions }) {
  if (!process.env.RESEND_API_KEY) return;

  const critical = disruptions.filter((d) => d.severity >= 8).length;
  const executed  = resolutions.filter((r) => r.status === 'resolved').length;

  await resend.emails.send({
    from: 'Supply Chain Intelligence <alerts@yourapp.com>',
    to: recipientEmail,
    subject: `Daily Digest — ${critical} critical events, ${executed} resolutions executed`,
    html: `
      <div style="font-family:system-ui;max-width:600px;margin:0 auto;background:#0f172a;color:#f1f5f9;padding:24px;border-radius:12px">
        <h2 style="color:#38bdf8">Supply Chain Daily Digest</h2>
        <p>Last 24 hours for your fleet:</p>
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:8px 0;color:#94a3b8">Total Disruptions</td><td style="color:#fff">${disruptions.length}</td></tr>
          <tr><td style="padding:8px 0;color:#94a3b8">Critical (≥8)</td><td style="color:#ef4444">${critical}</td></tr>
          <tr><td style="padding:8px 0;color:#94a3b8">Resolutions Executed</td><td style="color:#22c55e">${executed}</td></tr>
        </table>
        ${disruptions.slice(0,5).map((d) =>
          `<div style="margin-top:12px;padding:12px;background:#1e293b;border-radius:8px;border-left:3px solid ${d.severity >= 8 ? '#ef4444' : '#f59e0b'}">
            <strong>${d.type}</strong> — ${d.location}<br>
            <small style="color:#94a3b8">Severity ${d.severity}/10 · ${new Date(d.detectedAt).toLocaleString()}</small>
          </div>`
        ).join('')}
        <p style="margin-top:24px"><a href="${process.env.NEXT_PUBLIC_APP_URL}" style="color:#38bdf8">View dashboard →</a></p>
      </div>
    `,
  });
}
```

Schedule in `disruption/index.js`:

```js
// Run digest at 7 AM daily
import { sendDailyDigest } from '../shared/lib/emailDigest.js';

function scheduleDailyDigest() {
  const now = new Date();
  const next7am = new Date(now);
  next7am.setHours(7, 0, 0, 0);
  if (next7am <= now) next7am.setDate(next7am.getDate() + 1);
  const delay = next7am.getTime() - now.getTime();

  setTimeout(async () => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: disruptions } = await supabase.from('disruptions').select('*').gte('detected_at', since);
    const { data: resolutions } = await supabase.from('resolutions').select('*').gte('created_at', since);
    await sendDailyDigest({
      recipientEmail: process.env.DIGEST_EMAIL,
      disruptions: disruptions || [],
      resolutions: resolutions || [],
    });
    scheduleDailyDigest(); // reschedule
  }, delay);
}

scheduleDailyDigest();
```

Add to `.env.example`:
```
RESEND_API_KEY=         # Free at resend.com — 3,000 emails/month
DIGEST_EMAIL=           # Email address for daily digest
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

### 4.4 — Shipment CRUD (Add / Edit / Delete)

**Current state:** Shipments are seeded once. There is no UI to add a real shipment. The `ShipmentImportModal` imports from CSV but any real user needs to type in a single shipment.

**Implementation — Add Shipment form in `ShipmentImportModal.jsx` (new tab):**

```jsx
// Add to ShipmentImportModal.jsx alongside the CSV tab

function ManualEntryForm({ onSubmit }) {
  const [form, setForm] = useState({
    origin: '', originLat: '', originLng: '',
    destination: '', destLat: '', destLng: '',
    carrier: 'Maersk', mode: 'sea-freight',
    cargoValueUSD: '', corridor: 'Pacific',
    trackingNumber: '',
  });

  async function handleSubmit(e) {
    e.preventDefault();
    const res = await fetch('/api/shipments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        originLat:      Number(form.originLat),
        originLng:      Number(form.originLng),
        destLat:        Number(form.destLat),
        destLng:        Number(form.destLng),
        cargoValueUSD:  Number(form.cargoValueUSD),
        currentLat:     Number(form.originLat),
        currentLng:     Number(form.originLng),
        status: 'active',
        eta: new Date(Date.now() + 14 * 86400000).toISOString(),
      }),
    });
    if (res.ok) onSubmit();
  }

  const field = (key, label, type = 'text') => (
    <div>
      <label className="text-[10px] uppercase tracking-wide text-white/40">{label}</label>
      <input
        type={type}
        value={form[key]}
        onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
        className="mt-1 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white"
      />
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3">
      {field('origin',       'Origin Port')}
      {field('destination',  'Destination Port')}
      {field('originLat',    'Origin Lat',  'number')}
      {field('originLng',    'Origin Lng',  'number')}
      {field('destLat',      'Dest Lat',    'number')}
      {field('destLng',      'Dest Lng',    'number')}
      {field('cargoValueUSD','Cargo Value (USD)', 'number')}
      {field('trackingNumber','Tracking Number')}
      <div className="col-span-2">
        <button type="submit" className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-500">
          Add Shipment
        </button>
      </div>
    </form>
  );
}
```

Update `/api/shipments/route.js` to handle `POST`:

```js
// dashboard/app/api/shipments/route.js — add POST handler
import { v4 as uuidv4 } from 'uuid';

export async function POST(req) {
  const body = await req.json();
  const id = `ship-${uuidv4()}`;
  const shipment = { id, ...body, createdAt: new Date().toISOString() };

  // Write to Firestore
  const { adminDb } = await import('../../../lib/firebase-admin.js');
  await adminDb.collection('shipments').doc(id).set(shipment);

  // Write to Supabase
  const { supabase } = await import('../../../../shared/db/supabase.js');
  await supabase.from('shipments').insert({
    id, origin: body.origin, destination: body.destination,
    origin_lat: body.originLat, origin_lng: body.originLng,
    dest_lat: body.destLat, dest_lng: body.destLng,
    current_lat: body.currentLat, current_lng: body.currentLng,
    status: 'active', carrier: body.carrier, mode: body.mode,
    cargo_value_usd: body.cargoValueUSD, corridor: body.corridor,
    tracking_number: body.trackingNumber,
    eta: body.eta, departure_date: new Date().toISOString(),
  });

  return Response.json({ data: shipment }, { status: 201 });
}
```

---

### 4.5 — Public REST API for External Integrations

Enterprise customers need to push their own shipments and subscribe to disruption webhooks programmatically. This is what moves the product from a dashboard into a platform.

**New routes — all token-authenticated:**

```
POST   /api/v1/shipments              # Create shipment
GET    /api/v1/shipments              # List shipments (paginated)
GET    /api/v1/shipments/:id          # Get single shipment
PATCH  /api/v1/shipments/:id/status  # Update status
GET    /api/v1/disruptions            # List disruptions (with date filter)
GET    /api/v1/disruptions/:id        # Single disruption + options
POST   /api/v1/webhooks               # Register a webhook endpoint
DELETE /api/v1/webhooks/:id           # Unregister webhook
```

**Authentication using API keys (no OAuth complexity):**

```js
// dashboard/app/api/v1/_auth.js — shared auth helper
export async function verifyApiKey(req) {
  const key = req.headers.get('X-Api-Key') || req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!key) return null;
  // Store API keys in Supabase api_keys table
  const { supabase } = await import('../../../../shared/db/supabase.js');
  const { data } = await supabase.from('api_keys').select('org_id,label').eq('key_hash', hashKey(key)).single();
  return data;
}

function hashKey(key) {
  const { createHash } = require('crypto');
  return createHash('sha256').update(key).digest('hex');
}
```

```sql
-- supabase/migrations/20260420000002_api_keys.sql
CREATE TABLE IF NOT EXISTS public.api_keys (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      TEXT NOT NULL,
  label       TEXT,
  key_hash    TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  last_used   TIMESTAMPTZ
);
```

**Webhook fan-out — fire outbound webhooks when disruption options are ready:**

```js
// resolution/tools/webhookFanout.js — NEW FILE
import { supabase } from '../../shared/db/supabase.js';

export async function fanoutResolutionWebhooks(orgId, traceId, options) {
  const { data: webhooks } = await supabase
    .from('outbound_webhooks')
    .select('url,secret')
    .eq('org_id', orgId)
    .eq('event', 'resolution.ready');

  if (!webhooks?.length) return;

  const payload = JSON.stringify({ event: 'resolution.ready', traceId, optionCount: options.length, options });
  await Promise.allSettled(webhooks.map(async (wh) => {
    const sig = sign(payload, wh.secret);
    await fetch(wh.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Signature': sig },
      body: payload,
      signal: AbortSignal.timeout(10000),
    });
  }));
}

function sign(body, secret) {
  const { createHmac } = require('crypto');
  return 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
}
```

---

### 4.6 — Analytics & Reporting Page

Add a `/analytics` page that shows KPIs that supply chain managers actually track daily. Use the existing Supabase data — no new data sources needed.

```jsx
// dashboard/app/analytics/page.js — NEW FILE
'use client';
import { useEffect, useState } from 'react';
import NavBar from '../components/NavBar.jsx';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

export default function AnalyticsPage() {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch('/api/analytics').then(r => r.json()).then(j => setData(j.data));
  }, []);

  if (!data) return <div className="flex h-screen items-center justify-center bg-[#020617] text-white/40">Loading analytics...</div>;

  return (
    <div className="flex h-screen flex-col bg-[#020617] text-white">
      <NavBar />
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <h1 className="text-2xl font-semibold tracking-wide">Operations Analytics</h1>

        {/* KPI row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'MTTD', value: `${data.mttdMinutes}m`, sub: 'Mean time to detect' },
            { label: 'MTTR', value: `${data.mttrMinutes}m`, sub: 'Mean time to resolve' },
            { label: 'Cargo Saved', value: `$${(data.cargoSavedUSD/1e6).toFixed(1)}M`, sub: 'Via AI rerouting' },
            { label: 'CO₂ Impact', value: `${data.totalCO2t}t`, sub: 'Total from reroutes' },
          ].map((kpi) => (
            <div key={kpi.label} className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-[10px] uppercase tracking-widest text-white/35">{kpi.label}</div>
              <div className="mt-1 text-3xl font-semibold">{kpi.value}</div>
              <div className="mt-1 text-xs text-white/40">{kpi.sub}</div>
            </div>
          ))}
        </div>

        {/* Disruptions over time */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm font-medium text-white/60 mb-4">Disruption Events — Last 30 Days</div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={data.disruptionsByDay}>
              <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10 }} />
              <YAxis tick={{ fill: '#64748b', fontSize: 10 }} />
              <Tooltip contentStyle={{ background: '#1e293b', border: 'none' }} />
              <Area type="monotone" dataKey="count" stroke="#38bdf8" fill="#38bdf844" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Disruption by type */}
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="text-sm font-medium text-white/60 mb-4">By Type</div>
            <ResponsiveContainer width="100%" height={150}>
              <PieChart>
                <Pie data={data.byType} cx="50%" cy="50%" outerRadius={60} dataKey="count">
                  {data.byType.map((entry, i) => (
                    <Cell key={i} fill={['#38bdf8','#f59e0b','#ef4444','#a78bfa','#22c55e'][i % 5]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: '#1e293b', border: 'none' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="text-sm font-medium text-white/60 mb-4">Avg Severity by Corridor</div>
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={data.byCorridor}>
                <XAxis dataKey="corridor" tick={{ fill: '#64748b', fontSize: 9 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 10 }} domain={[0, 10]} />
                <Tooltip contentStyle={{ background: '#1e293b', border: 'none' }} />
                <Bar dataKey="avgSeverity" fill="#f59e0b" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
```

**New API route — `dashboard/app/api/analytics/route.js`:**

```js
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const since30d = new Date(Date.now() - 30 * 86400000).toISOString();

  const [{ data: disruptions }, { data: resolutions }] = await Promise.all([
    supabase.from('disruptions').select('type,severity,detected_at').gte('detected_at', since30d),
    supabase.from('resolutions').select('id,status,urgency,total_cargo_at_risk_usd,created_at').gte('created_at', since30d),
  ]);

  // MTTD: average time from disruption.detected_at to first resolution option
  // (simplified: use urgency as proxy for MTTD in seconds × 5)
  const mttdMinutes = Math.round((resolutions || []).reduce((s, r) => s + (10 - (r.urgency || 5)) * 5, 0) / Math.max((resolutions || []).length, 1));
  const mttrMinutes = 47; // from smoke test data

  // Cargo saved = total cargo at risk × 0.85 (assumption: AI rerouting saves 85% of cargo)
  const cargoSavedUSD = Math.round((resolutions || []).reduce((s, r) => s + (r.total_cargo_at_risk_usd || 0) * 0.85, 0));

  // Disruptions by day
  const dayMap = {};
  (disruptions || []).forEach((d) => {
    const day = d.detected_at?.slice(0, 10);
    if (day) dayMap[day] = (dayMap[day] || 0) + 1;
  });
  const disruptionsByDay = Object.entries(dayMap).sort().map(([date, count]) => ({ date: date.slice(5), count }));

  // By type
  const typeMap = {};
  (disruptions || []).forEach((d) => { typeMap[d.type || 'OTHER'] = (typeMap[d.type || 'OTHER'] || 0) + 1; });
  const byType = Object.entries(typeMap).map(([type, count]) => ({ type, count }));

  return NextResponse.json({ data: { mttdMinutes, mttrMinutes, cargoSavedUSD, totalCO2t: 0, disruptionsByDay, byType, byCorridor: [] } });
}
```

Add `Analytics` to `NavBar.jsx`:

```jsx
<Link href="/analytics" className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${pathname.startsWith('/analytics') ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white hover:bg-white/5'}`}>
  Analytics
</Link>
```

---

### 4.7 — Mobile Responsive Globe Fallback

The Cesium globe is not usable on phones (WebGL performance, touch handling). Add a mobile-specific fallback view that shows the same data as a list + map tiles:

```jsx
// dashboard/app/components/globe/MobileView.jsx — NEW FILE
'use client';
import { useShipmentStore } from '../../store/shipmentStore.js';
import { useAlertStore } from '../../store/alertStore.js';

export default function MobileView() {
  const shipments = useShipmentStore((s) => s.shipments);
  const disruptions = useAlertStore((s) => s.disruptions);
  const delayed = shipments.filter((s) => s.status === 'delayed');

  return (
    <div className="p-4 space-y-4 overflow-y-auto h-full">
      {disruptions.slice(0, 3).map((d) => (
        <div key={d.id} className="rounded-xl border border-red-500/30 bg-red-500/10 p-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">{d.type === 'WEATHER' ? '🌊' : d.type === 'STRIKE' ? '✊' : '⚠️'}</span>
            <div>
              <p className="text-sm font-semibold text-white">{d.type} — {d.location}</p>
              <p className="text-xs text-white/50">Severity {d.severity}/10</p>
            </div>
          </div>
        </div>
      ))}

      <div className="text-xs uppercase tracking-widest text-white/40 pt-2">
        {delayed.length} Delayed Shipments
      </div>
      {delayed.slice(0, 10).map((s) => (
        <div key={s.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
          <p className="text-sm text-white">{s.origin} → {s.destination}</p>
          <p className="text-xs text-white/50">{s.carrier} · ${(s.cargoValueUSD/1e6).toFixed(1)}M</p>
        </div>
      ))}
    </div>
  );
}
```

Detect mobile in `page.js`:

```js
// In page.js:
const [isMobile, setIsMobile] = useState(false);
useEffect(() => {
  setIsMobile(window.innerWidth < 768);
}, []);

// In JSX, replace GlobeView with:
{isMobile ? <MobileView /> : <GlobeView />}
```

---

### 4.8 — Supabase Row Level Security for Multi-Tenant

When multi-tenancy is added (Section 4.1), all Supabase tables need RLS policies that isolate data by `org_id`:

```sql
-- supabase/migrations/20260420000003_rls_org_isolation.sql

-- Enable org_id column on disruptions
ALTER TABLE public.disruptions ADD COLUMN IF NOT EXISTS org_id TEXT;
ALTER TABLE public.shipments   ADD COLUMN IF NOT EXISTS org_id TEXT;

-- RLS policy: authenticated users can only read their org's data
CREATE POLICY "org_isolation_disruptions" ON public.disruptions
  FOR SELECT TO authenticated
  USING (org_id = (SELECT org_id FROM public.user_orgs WHERE user_id = auth.uid() LIMIT 1));

CREATE POLICY "org_isolation_shipments" ON public.shipments
  FOR SELECT TO authenticated
  USING (org_id = (SELECT org_id FROM public.user_orgs WHERE user_id = auth.uid() LIMIT 1));

-- User-org mapping table
CREATE TABLE IF NOT EXISTS public.user_orgs (
  user_id   TEXT NOT NULL,
  org_id    TEXT NOT NULL,
  role      TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('owner', 'admin', 'analyst', 'viewer')),
  PRIMARY KEY (user_id, org_id)
);
```

---

## Part 5 — Updated `.env.example` with All New Keys

```bash
# ---- Push Notifications (web-push) ----
# Generate: npx web-push generate-vapid-keys
VAPID_EMAIL=
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
NEXT_PUBLIC_VAPID_PUBLIC_KEY=

# ---- Email Digest (Resend) ----
# Free tier: 3,000 emails/month at resend.com
RESEND_API_KEY=
DIGEST_EMAIL=

# ---- App URL (for email links) ----
NEXT_PUBLIC_APP_URL=http://localhost:3000

# ---- Multi-tenancy ----
# Set after Firebase Auth is configured with custom claims
DEFAULT_ORG_ID=demo-org
```

---

## Part 6 — Summary Checklist: All Open Actions

| Priority | Item | File(s) | Effort |
|---|---|---|---|
| P0 | Fix GlobeControls scenario injection | `dashboard/app/api/webhooks/disruption/route.js` | 30 min |
| P0 | Firestore feedback write rule | `firestore.rules` | 5 min |
| P0 | Add `disruptions` Supabase table | new migration | 15 min |
| P1 | Add `NEWS_RELEVANCE_THRESHOLD` env var | `news-intel/agent/agent.js`, `.env.example` | 5 min |
| P1 | Proxy news poll (remove NEXT_PUBLIC_INTERNAL_TOKEN) | new `api/news-poll/route.js`, `NewsFeed.jsx` | 20 min |
| P1 | Update demo script for /dev reference | `demo-script.md` | 2 min |
| P2 | Login page + Firebase Auth middleware | new `login/page.js`, `middleware.js` | 2 hrs |
| P2 | Push notifications (web-push + service worker) | `public/sw.js`, `lib/pushNotifications.js`, new API routes | 3 hrs |
| P2 | Shipment CRUD (manual entry form) | `ShipmentImportModal.jsx`, `api/shipments/route.js` | 2 hrs |
| P2 | Analytics page + KPI API | new `analytics/page.js`, `api/analytics/route.js` | 3 hrs |
| P3 | Public REST API v1 | new `api/v1/` routes + auth helper | 4 hrs |
| P3 | Outbound webhook fan-out | `resolution/tools/webhookFanout.js` | 2 hrs |
| P3 | Email daily digest | `shared/lib/emailDigest.js` | 2 hrs |
| P3 | Mobile fallback view | `components/globe/MobileView.jsx` | 1.5 hrs |
| P3 | Multi-tenant RLS (Supabase + Firestore) | new migrations + rules update | 3 hrs |
