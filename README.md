# AI-Driven Anti-Fragile Supply Chain
### Google Hackathon 2026 - Free-Tier Multi-Agent System

---

## Overview

Real-time autonomous supply chain disruption detection and resolution using Gemini AI Studio, Firestore, and a custom Node.js event bus. No billing account required.

**Agent pipeline:** Monitor Agent → Impact Agent → Negotiator Agent → Dashboard → Execution

---

## Tech Stack

- **AI:** Gemini 1.5 Flash via Google AI Studio (free API key)
- **Event Bus:** Custom Node.js EventEmitter (replaces GCP Pub/Sub)
- **Database:** Firebase Firestore (free tier)
- **Auth:** Firebase Auth (Google OAuth)
- **Backend:** Fastify microservices on Render.com (free tier)
- **Frontend:** Next.js 15 on Vercel (free hobby tier)
- **CI/CD:** GitHub Actions

---

## Local Setup

### 1. Clone and install

```bash
git clone <repo-url>
cd GDG-Solutions-Challenge-2026-main
```

Install deps for each service:

```bash
cd event-bus && npm install && cd ..
cd disruption && npm install && cd ..
cd impact && npm install && cd ..
cd resolution && npm install && cd ..
cd news-intel && npm install && cd ..
cd dashboard && npm install && cd ..
```

### 2. Environment variables

Copy `.env.example` to `.env` in the repo root and fill in all values. Each agent service also needs a `.env` file - symlink or copy the root one.

### 3. Seed Firestore

```bash
node shared/db/seed/seed.js
```

### 4. Start services (6 terminals)

```bash
# Terminal 1
cd event-bus && npm run dev

# Terminal 2
cd disruption && npm run dev

# Terminal 3
cd impact && npm run dev

# Terminal 4
cd resolution && npm run dev

# Terminal 5
cd news-intel && npm run dev

# Terminal 6
cd dashboard && npm run dev
```

### 5. Run a demo scenario

```bash
node resolution/simulation/inject.js pacific_storm
```

---

## Service Ports

| Service | Port |
|---|---|
| Event Bus | 4000 |
| Disruption Agent | 3001 |
| Impact Agent | 3002 |
| Resolution Agent | 3003 |
| News Intel Agent | 3005 |
| Dashboard | 3000 |

---

## Deployment Notes

If you deploy with `render.yaml`, add the news service alongside the other web services:

```yaml
- type: web
  name: news-intel
  env: node
  plan: free
  buildCommand: cd news-intel && npm install
  startCommand: cd news-intel && npm start
  envVars:
    - key: NEWSAPI_KEY
      sync: false
    - key: DISRUPTION_AGENT_URL
      value: https://disruption.onrender.com
    - key: EVENT_BUS_URL
      value: https://event-bus.onrender.com
    - key: GEMINI_API_KEY
      sync: false
    - key: INTERNAL_TOKEN
      sync: false
```

Render free tier sleeps after 15 minutes of inactivity. The internal cron scheduler fires every 15 minutes, which helps wake the service automatically. The first poll after a cold start can take 30-60 seconds while Node boots.

---

## Architecture

```
Browser (Next.js → Vercel)
  |-- Firestore real-time listeners
  |-- SSE ← Resolution Agent (Gemini reasoning tokens)
  |-- WebSocket ← Event Bus (agent heartbeats)

Event Bus (Node.js EventEmitter → Render.com :4000)
  |-- disruption-events → Impact Agent
  |-- impact-reports → Resolution Agent
  |-- resolution-options → Dashboard webhook
  |-- news-alerts → Dashboard feed + Disruption Agent injection

Agents (Fastify → Render.com)
  |-- Monitor Agent :3001 → Gemini AI Studio + Open-Meteo
  |-- Impact Agent :3002 → Gemini AI Studio + haversine scorer + Firestore
  |-- Resolution Agent :3003 → Gemini AI Studio + static routes + Firestore
  |-- News Intel Agent :3005 → GDELT / NewsAPI + Gemini classifier + Firestore
```

---

## THINGS TO LEAVE ALONE (Phase 2+)

Do not implement the following files during Phase 1. Leave their existing stubs as-is:

- `disruption/agent/agent.js` - Phase 2
- `disruption/api/events.service.js` - Phase 2
- `disruption/api/events.route.js` - Phase 2
- `disruption/tools/searchTool.js` - Phase 2
- `disruption/tools/weatherTool.js` - Phase 2
- `disruption/agent/prompt.md` - Phase 2
- `impact/agent/agent.js` - Phase 2
- `impact/api/impact.service.js` - Phase 2
- `impact/api/impact.route.js` - Phase 2
- `impact/tools/shipmentLookup.js` - Phase 2
- `impact/tools/severityScorer.js` - Phase 2 (create this file in Phase 2)
- `impact/agent/prompt.md` - Phase 2
- `resolution/agent/agent.js` - Phase 2
- `resolution/api/options.service.js` - Phase 2
- `resolution/api/options.route.js` - Phase 2
- `resolution/api/execute.route.js` - Phase 2
- `resolution/tools/routingTool.js` - Phase 2
- `resolution/tools/supplierLookup.js` - Phase 2
- `resolution/tools/costCalculator.js` - Phase 2
- `resolution/simulation/pacific_storm.js` - Phase 2
- `resolution/simulation/port_strike.js` - Phase 2
- `resolution/simulation/suez_closure.js` - Phase 2
- `resolution/simulation/inject.js` - Phase 2
- `dashboard/app/components/` (all component files) - Phase 3

---

## Phase 1 Exit Criteria

When Phase 1 is complete, verify all of the following:

1. `curl http://localhost:4000/health` returns JSON with `status: "ok"` and the three topic names
2. Publishing to the event bus (`POST /publish`) and subscribing (`GET /subscribe/disruption-events`) works end-to-end - the subscriber receives the message
3. `curl http://localhost:3001/health`, `curl http://localhost:3002/health`, `curl http://localhost:3003/health` all return `status: "ok"`
4. `node shared/db/seed/seed.js` runs without error and 50 documents appear in the Firebase console under `shipments`
5. Opening the dashboard at `http://localhost:3000` shows "✅ Firestore connected - 50 shipments loaded"
6. Calling `generate('say hello')` from `shared/lib/gemini.js` returns a non-empty string (smoke test in a scratch file)

