# Phase 3 — Verification, Bug Report, and Implementation Specification

---

## SECTION 1 — CURRENT STATE VERIFICATION (Phase 2.5 Audit)

### What is working correctly

The backend pipeline from CLI inject → Disruption Agent → Impact Agent → Resolution Agent → Firestore is architecturally solid. The dual-write pattern (Firestore for real-time, Supabase for structured storage) is in place. The event bus SSE works correctly with stream/traceId route order fixed. The fallback classifier and per-option try-catch validation are in place. Supabase client is shared correctly. Seed writes shipments to Firestore and suppliers to Supabase. The Negotiator prompt has a full schema with examples.

### Bugs found in the current codebase

**Bug 1 — `useDisruptions` queries by `receivedAt` but that field does not exist on documents written by the agent**
In `dashboard/app/hooks/useDisruptions.js`, the Firestore query is `orderBy('receivedAt', 'desc')`. But `disruption/api/events.service.js` writes documents with field `detectedAt`, not `receivedAt`. The `receivedAt` field only exists on documents written by the webhook route (`dashboard/app/api/webhooks/disruption/route.js`), which is not used in the current pipeline. This query will silently return zero results or throw a Firestore index error. Fix: change `orderBy('receivedAt', 'desc')` to `orderBy('detectedAt', 'desc')`.

**Bug 2 — `detectScenario` in `options.service.js` always returns `pacific_storm`**
In `resolution/api/options.service.js`, the disruption passed to `detectScenario` is reconstructed as `{ location: impactReport.affectedShipments?.[0]?.corridor || 'Pacific', type: 'WEATHER', affectedZones: [] }`. The corridor value from a shipment is something like `'Pacific'`, `'Suez'`, or `'Indian Ocean'`. The `detectScenario` function checks if the string contains `'suez'` or `'red sea'` — but the corridor value `'Suez'` (capitalised) will NOT match `c.includes('suez')` because `c` is lowercased correctly via `.toLowerCase()`, so `'suez'` → this actually would match. However the `type` is hardcoded as `'WEATHER'` regardless of the actual disruption type. For `port_strike`, the `type === 'STRIKE'` check in `detectScenario` will never trigger because the injected type is always `'WEATHER'`. The fix is to pass the actual disruption data from the impactReport, not a reconstructed stub. The `impactReport` received from the event bus contains `disruptionId` — the agent should look up the disruption or carry it in the payload.

**Bug 3 — `websocket.js` is an empty stub but `AgentStatusBadge` needs it**
`dashboard/app/lib/websocket.js` exports `connectWebSocket()` as an empty function. The blueprint specifies AgentStatusBadge listens via WebSocket to the event bus for agent heartbeats. This entire feature is unimplemented. Not a crash bug today (the component is also a stub), but both must be built together in Phase 3.

**Bug 4 — `dashboard/app/globals.css` uses light mode background as default**
The CSS has `--background: #ffffff` in `:root` and only switches to dark in `@media (prefers-color-scheme: dark)`. But the layout already forces `dark` class on `<html>` and sets `bg-gray-950` via Tailwind. The globals.css `body { background: var(--background) }` will override the Tailwind dark background on systems that prefer light mode, because the `dark` media query won't fire. The CSS should set dark colors as the default since this is explicitly a dark-mode-only dashboard.

**Bug 5 — `useResolutions` hook overwrites options with a single-element array each time**
In `dashboard/app/hooks/useResolutions.js`, every `added` change calls `setResolutionOptions([{ id: change.doc.id, ...change.doc.data() }])` — wrapping a single resolution in an array and replacing the entire store. If two resolutions are added in the same snapshot batch, only the last one survives. The store should accumulate resolutions or at least keep the most recent complete one including its subcollection options.

**Bug 6 — `useResolutions` fetches the parent resolution document only, not the options subcollection**
The resolution document in Firestore contains metadata (traceId, cascadeRisk, urgency, etc.) but the 3 actual options live in `resolutions/{traceId}/options/{rank}` subcollection. The hook never fetches this subcollection, so the `DecisionModal` will have no options to display. A secondary fetch or `onSnapshot` on the subcollection is needed.

**Bug 7 — `options.service.js` has a duplicate fallback block**
In `resolution/api/options.service.js`, there are two separate fallback option definitions: one inside the JSON parse try-catch (lines using anonymous objects) and another named `fallbackOptions` array. The first one sets `options` to a fallback array when parsing fails, but then `validatedOptions` runs the per-option try-catch against those fallback options which will also pass through the normalization. This is redundant but not harmful — it does mean the fallbacks are defined twice with slightly different supplier names. It should be cleaned up to use a single fallback source.

**Bug 8 — `impactReport.affectedShipments` is stored as a large nested array in Firestore but in Supabase it's in a join table**
In `impact/api/impact.service.js`, the full `scoredShipments` array (up to 20 objects each with ~10 fields) is stored inside the Firestore `impactReports` document. Firestore documents have a 1MB limit, and for 20 shipments this is ~15–30KB — fine for now. However, the data in Firestore's `affectedShipments` field and the data in Supabase's `impact_report_shipments` table can drift if one write fails. The `affectedShipments` array should be treated as the source of truth in Supabase only, and Firestore should store a summary (count + ids) instead of the full nested array. This is an architectural debt item — not an immediate crash but will cause confusion in Phase 3 when the UI tries to display affected shipments.

### Architectural concerns

**Concern 1 — Scenario detection is fragile and wrong for the judge demo**
The `detectScenario` function drives which GeoJSON routes and cost calculations are shown. It currently uses text matching on corridor names. When a `suez_closure` scenario is injected, the disruption agent correctly classifies type as `GEOPOLITICAL` and location as `Suez Canal`. But in `options.service.js`, the reconstructed stub `{ type: 'WEATHER', affectedZones: [] }` means `suez_closure` and `port_strike` will always be served the `pacific_storm` routes. For the judge demo this is catastrophic — the Suez closure scenario will show "Northern Arc via Aleutian Islands" as the resolution. The fix is to store the disruption type in the ImpactReport or carry it through the event bus payload.

**Concern 2 — The `activeStreams` Map in `options.service.js` leaks memory if the service restarts**
The `activeStreams` Map is in-process memory. If Render.com restarts the service mid-stream (which happens on free tier after 15 min idle), all active streams are lost. The SSE clients will receive nothing. For the demo, ensure the event bus keep-alive pings are working and that the service doesn't restart. For Phase 4, streams should be persisted briefly to Firestore/Redis.

**Concern 3 — No Firestore Security Rules index for `shipments` ordered by `detectedAt`**
The `firestore.indexes.json` has a composite index for `shipments` on `currentLat + currentLng` and a single-field index for `disruptions.detectedAt`. But the `useShipments` hook does a full collection scan with no ordering — this works but will slow down as the collection grows. Not critical for 50 documents but worth noting.

**Concern 4 — `dashboard/app/lib/firebase.js` has `'use client'` directive but is imported in both client components and server-side files**
The file exports `auth` which is imported in client components. The `'use client'` directive is correct for Next.js App Router. However, `dashboard/lib/firebase-admin.js` (server-side) is a separate file as it should be. This is fine architecturally but the naming (`firebase.js` vs `firebase-admin.js`) is in different directories (`app/lib` vs `lib`) which could confuse developers.

---

## SECTION 2 — PRE-PHASE 3 FIXES REQUIRED

Before writing any Phase 3 UI code, fix these two bugs. They are blockers:

1. **Fix `useDisruptions.js`**: Change `orderBy('receivedAt', 'desc')` to `orderBy('detectedAt', 'desc')`.

2. **Fix `detectScenario` in `options.service.js`**: The disruption type must be passed correctly. The ImpactReport payload from the event bus carries `disruptionId`. The `agentPayload.payload` is the ImpactReport object. Add a `disruptionType` field to the ImpactReport when it is created in `impact.service.js` (copy `disruption.type` into the report). Then in `options.service.js`, use `impactReport.disruptionType` when building the `disruption` stub for `detectScenario`.

3. **Fix `globals.css`**: Set dark colors as default in `:root` to match the forced dark theme.

4. **Fix `useResolutions.js`**: After detecting a new resolution parent document, also subscribe to its `options` subcollection and load all 3 options into the alert store.

---

## SECTION 3 — PHASE 3 IMPLEMENTATION SPECIFICATION

Phase 3 builds the complete UI on top of the working backend. The dashboard must go from its current placeholder state to the full command center described in the blueprint.

### 3.1 New npm packages required

Add to `dashboard/package.json`:
- `react-globe.gl` — 3D globe component
- `three` — peer dependency of react-globe.gl  
- `recharts` — bar charts for cost/time comparison in OptionCard
- `sonner` — toast notification library (lightweight, works with Next.js App Router)

### 3.2 Page layout — `dashboard/app/page.js`

Replace the placeholder page with a two-panel layout:
- Left panel (70% width): `GlobeView` component
- Right panel (30% width): `AgentChatSidebar` component
- Floating overlay top-right: `AgentStatusBadge`
- Floating overlay bottom-left: `AlertToast` stack
- Full-screen overlay (conditional): `DecisionModal`
- The page is `'use client'` and initialises all Firestore hooks on mount

Layout is `flex-row h-screen overflow-hidden bg-[#020617]` (the blueprint's exact dark earth background colour).

### 3.3 Globe — `dashboard/app/components/globe/GlobeView.jsx`

This is the centrepiece visual. Uses `react-globe.gl`.

**Data sources**: shipments from `useShipmentStore`, disruptions from `useAlertStore`.

**Points layer**: Each shipment's current position rendered as a coloured dot:
- `active` → green (`#22c55e`)
- `delayed` → red (`#ef4444`)  
- `rerouted` → blue (`#3b82f6`)
- `disrupted` → orange (`#f97316`)

Point size: 0.4. On hover: show tooltip with shipment id, origin→destination, carrier, cargo value.

**Arcs layer**: Each shipment rendered as an arc from `[originLng, originLat]` to `[destLng, destLat]`:
- Arc colour matches shipment status (same colour scheme as points)
- Stroke width: 1.5 for active, 2.5 for delayed/disrupted, 3 for rerouted
- `dashLength: 0.4`, `dashGap: 0.1` for active arcs (animated dashes)
- Rerouted shipments show the new route arc from the resolution option's GeoJSON coordinates instead of the straight origin→dest arc

**Polygons layer**: When a disruption is active, render the affected zone as a red semi-transparent polygon. Use a circular polygon approximation around `epicenterLat/epicenterLng` with radius proportional to severity.

**Globe config**:
```js
backgroundColor="#020617"
globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
atmosphereColor="#1e3a5f"
atmosphereAltitude={0.15}
```

**Auto-camera**: When a new disruption is added, animate `pointOfView` to `{ lat: epicenterLat, lng: epicenterLng, altitude: 2.0 }` over 1500ms.

### 3.4 Globe controls — `dashboard/app/components/globe/GlobeControls.jsx`

A HUD overlay positioned top-left of the globe panel.

Contains:
- Status filter buttons: "All" | "Active" | "Delayed" | "Rerouted" — clicking filters which shipment arcs are shown on the globe
- Scenario selector: "Pacific Storm" | "Port Strike" | "Suez Closure" — clicking calls `fetch('/api/inject', { method: 'POST', body: JSON.stringify({ scenario }) })` which triggers the simulation CLI server-side (Phase 4 feature — stub with a disabled state and tooltip "Use CLI to inject" for now)
- Live counter: `{active} active · {delayed} delayed · {rerouted} rerouted`

Styling: glass-morphism card `bg-black/40 backdrop-blur-md border border-white/10 rounded-xl p-3`.

### 3.5 Globe camera hook — `dashboard/app/components/globe/useGlobeCamera.js`

A custom hook that accepts a `globeRef` and manages camera movements.

```js
export function useGlobeCamera(globeRef) {
  const disruptions = useAlertStore(s => s.disruptions)
  
  useEffect(() => {
    if (!globeRef.current || disruptions.length === 0) return
    const latest = disruptions[0]
    if (!latest.epicenterLat || !latest.epicenterLng) return
    globeRef.current.pointOfView(
      { lat: latest.epicenterLat, lng: latest.epicenterLng, altitude: 2.0 },
      1500
    )
  }, [disruptions])
}
```

### 3.6 Alert toast — `dashboard/app/components/alerts/AlertToast.jsx`

Fires when a new disruption is added to `alertStore.disruptions`. Uses `sonner`'s `toast()` function called from inside the component's `useEffect` watching `disruptions`.

Toast content:
- Icon: 🌊 for WEATHER, ✊ for STRIKE, ⚠️ for GEOPOLITICAL, 🔧 for INFRASTRUCTURE
- Title: `{disruption.type} — Severity {disruption.severity}/10`
- Body: `{disruption.location}`
- Sub-line: `${disruption.affectedZones.slice(0,3).join(', ')} affected`
- Cargo at risk badge (from the corresponding impactReport if available, otherwise omit)
- "View Options" button — sets `alertStore.activeDisruptionId` and opens DecisionModal
- Auto-dismiss: 15 seconds
- Position: bottom-right
- Toast style: dark, with left border colour matching severity (red ≥7, orange 4-6, yellow <4)

### 3.7 Severity badge — `dashboard/app/components/alerts/SeverityBadge.jsx`

A small inline badge component.

```jsx
// Props: severity (1-10), showLabel (bool)
// CRITICAL (8-10): bg-red-900 text-red-300 border border-red-700
// HIGH (6-7): bg-orange-900 text-orange-300 border border-orange-700  
// MEDIUM (4-5): bg-yellow-900 text-yellow-300 border border-yellow-700
// LOW (1-3): bg-green-900 text-green-300 border border-green-700
// Label: CRITICAL / HIGH / MEDIUM / LOW
```

### 3.8 AgentStatusBadge — `dashboard/app/components/agent/AgentStatusBadge.jsx`

Shows which agent is currently active. Connects to the event bus WebSocket for real-time heartbeats.

States cycle: `Idle` → `Monitor` → `Impact` → `Negotiator` → `Resolved`

Implementation: The component calls `connectWebSocket()` from `dashboard/app/lib/websocket.js` on mount. The websocket connects to `ws://localhost:4000` (or the `EVENT_BUS_URL` with protocol swapped). When a message arrives with `agentId`, the badge updates.

**For Phase 3, implement `websocket.js` as a polling fallback** since the event bus currently has no WebSocket endpoint. The badge polls `GET /health` on each agent every 3 seconds and updates status based on `lastEventAt` freshness (if `lastEventAt` was within the last 5 seconds, that agent is "active").

Badge UI: `absolute top-4 right-4 flex items-center gap-2 bg-black/60 backdrop-blur-sm border border-white/10 rounded-full px-3 py-1.5`

Animated pulse dot: `w-2 h-2 rounded-full animate-pulse` — green for Idle, yellow for Monitor/Impact/Negotiator, blue for Resolved.

Text: `{status} Agent` in `text-xs text-white/80`.

### 3.9 Agent Chat Sidebar — `dashboard/app/components/agent/AgentChatSidebar.jsx`

The 30% right panel. Shows the Gemini reasoning stream token-by-token.

Layout: full height right panel with header, scrollable content area, and status footer.

Header: "AI Reasoning" with current traceId (last 8 chars) if active.

Content: When `alertStore.activeDisruptionId` is set, open an `EventSource` connection to `http://localhost:3003/options/stream/{traceId}` and append each `chunk` to the display. Render the accumulated text as formatted markdown-like output (no actual markdown parser needed — just preserve newlines and highlight JSON-like patterns with a different colour).

Show "tool call" badges when the text contains patterns like `"supplierName"` or `"distanceKm"` — indicate that a tool was called with a small pill badge.

Persist the last 5 reasoning chains in a local `useState` array so the manager can review previous analyses.

Footer: Shows `{agent} is thinking...` with animated dots when stream is active, `Analysis complete` when done.

Empty state: "Inject a disruption scenario to see AI reasoning" with instructions.

### 3.10 Decision Modal — `dashboard/app/components/decision/DecisionModal.jsx`

Full-screen overlay that opens automatically when `alertStore.resolutionOptions` contains a resolution with options loaded.

**Trigger**: Opens when `resolutionOptions.length > 0` AND the resolution has `status === 'pending'`.

**Layout**:
- Dark overlay `bg-black/80 backdrop-blur-sm` covering entire viewport
- Centred card `max-w-5xl w-full bg-gray-900 rounded-2xl border border-white/10`
- Header: disruption summary (type, location, severity badge, total cargo at risk)
- Body: 3 `OptionCard` components in a row (flex-row on desktop, flex-col on mobile)
- Footer: dismiss button (sets `activeDisruptionId` to null but keeps options in store)

**Data flow**: The modal reads `resolutionOptions[0]` from the alert store. It also needs the 3 individual options from the subcollection. These are fetched when the modal opens via `getDocs(collection(db, 'resolutions', traceId, 'options'))`.

**On approve**: Calls `fetch('http://localhost:3003/execute', { method: 'POST', body: JSON.stringify({ traceId, rank }) })`. On success, updates the globe arcs and shows a success toast. Closes the modal.

### 3.11 Option Card — `dashboard/app/components/decision/OptionCard.jsx`

One card per resolution option (3 total).

Props: `option` (ResolutionOption object), `onApprove` callback, `isApproving` bool.

Content:
- Rank badge: `#1 Recommended` / `#2 Fastest` / `#3 Cheapest` with different colours (gold/silver/bronze)
- Title (bold)
- Description (2-3 sentence text from Gemini)
- `CostTimeChart` component showing cost delta and time delta as a bar chart
- Supplier name + reliability score pill
- Confidence score: `{Math.round(confidence * 100)}% confidence`
- Approve button: primary for rank 1, secondary for rank 2/3

Card styling: `bg-gray-800 rounded-xl border border-white/5 p-5 flex flex-col gap-4`. Rank 1 card has `border-yellow-500/30` accent.

### 3.12 Cost Time Chart — `dashboard/app/components/decision/CostTimeChart.jsx`

A compact Recharts `BarChart` showing cost delta and time delta side by side.

Props: `costDelta` (integer USD), `timeDelta` (integer hours).

- Two bars: "Cost Impact" and "Time Impact"
- Cost bar: green if `costDelta < 0` (savings), red if `costDelta > 0`
- Time bar: green if `timeDelta < 0` (time saved), red if `timeDelta > 0`
- Format values: `costDelta` as `$${Math.abs(costDelta / 1000).toFixed(0)}K`, `timeDelta` as `${Math.abs(timeDelta)}h`
- Chart height: 120px, no legend, minimal axes

### 3.13 Updated Firestore hooks — fixes for bugs 1, 5, 6

`useDisruptions.js` — fix `orderBy('receivedAt', 'desc')` → `orderBy('detectedAt', 'desc')`.

`useResolutions.js` — completely rewrite:
```js
// 1. onSnapshot on resolutions collection (parent docs)
// 2. When a new resolution parent is added, subscribe to its options subcollection
// 3. Combine parent + options into a single object and call setResolutionOptions
```

### 3.14 Updated alert store — add options to resolution data

Add a new store field `activeResolutionWithOptions` that holds both the parent resolution document and its 3 options array together, so the `DecisionModal` doesn't need to do a separate fetch.

### 3.15 Updated `websocket.js` — polling-based agent status

Replace the empty stub with a polling implementation that checks agent health endpoints every 3 seconds and derives agent status from `lastEventAt`.

### 3.16 `dashboard/app/globals.css` — fix dark mode default

Change the `:root` variables to dark defaults and remove the light-mode defaults entirely, since this is a dark-mode-only application.

### 3.17 New file: `dashboard/app/components/globe/` directory

Create the directory with three files: `GlobeView.jsx`, `GlobeControls.jsx`, `useGlobeCamera.js`.

### 3.18 Impact on `impact/api/impact.service.js`

Add `disruptionType: disruption.type` to the ImpactReport object when creating it, so the Resolution Agent can correctly detect the scenario.

### 3.19 Updated `dashboard/app/page.js`

Replace with the two-panel layout wiring all Phase 3 components.

---

## SECTION 4 — PHASE 3 EXIT CRITERIA

- 3D globe renders at `http://localhost:3000` with 50 shipment arcs visible against dark earth texture
- Running `node resolution/simulation/inject.js pacific_storm` causes: globe camera to animate to Pacific, AlertToast to appear within 3 seconds, shipment arc colours to change from green to red
- AgentChatSidebar shows Gemini reasoning tokens streaming in real time (not blank)
- DecisionModal opens automatically when resolution options are ready (~30 seconds after inject)
- Approving a resolution option changes the delayed shipment arcs from red to blue on the globe
- AgentStatusBadge cycles: Idle → Monitor active → Impact active → Negotiator active → Resolved
- Running all 3 scenarios (`pacific_storm`, `port_strike`, `suez_closure`) each works end-to-end
- Each scenario shows the correct routes on the globe (Pacific routes for storm, Cape routes for Suez, etc.)
