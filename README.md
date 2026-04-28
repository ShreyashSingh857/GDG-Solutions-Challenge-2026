# 🌍 OpenTrade — AI Supply Chain Command Center
 
> **Detect. Score. Resolve. In under 60 seconds.**
 
OpenTrade is a real-time multi-agent AI system that monitors global shipping disruptions, scores their financial impact, and autonomously generates ranked resolution strategies — surfaced as an interactive decision dashboard for human approval.
 
Built for the age of fragile supply chains.
 
---
 
## 🏆 What We Built
 
A fully autonomous, end-to-end pipeline spanning five microservices:
 
```
[Global News + AIS Data]
         ↓
  [Monitor Agent]          ← scrapes Reuters, GDELT, MarineTraffic
         ↓
  [Event Bus / SSE]        ← fan-out to all downstream agents
         ↓
  [Impact Agent]           ← Gemini AI scores cargo at risk, cascade probability
         ↓
  [Resolution Agent]       ← Gemini AI generates 3 ranked strategic options
         ↓
  [Dashboard]              ← Real-time Firestore + Cesium globe visualization
         ↓
  [Human Decision Modal]   ← One-click protocol approval + PDF report
```
 
All agents run as independent Node.js microservices coordinated via Server-Sent Events. The dashboard is a Next.js 15 app with a 3D Cesium globe, real-time shipment tracking, and a cinematic decision interface.
 
---
 
## 🎯 The Problem
 
Global supply chains lose **$184 billion per year** to disruptions — port strikes, extreme weather, Suez/Panama blockages, geopolitical crises. Most logistics operators learn about disruptions via email hours after the fact, with no automated resolution tooling.
 
**OpenTrade cuts Mean Time to Detect (MTTD) from hours to seconds and Mean Time to Resolve (MTTR) from days to minutes.**
 
---
 
## ⚡ Key Features
 
| Feature | Technology |
|---------|-----------|
| Real-time news scraping | GDELT, Reuters, NewsAPI |
| AIS vessel tracking | AISStream WebSocket → Firestore |
| AI disruption detection | Gemini 2.5 Flash |
| Financial impact scoring | UN Comtrade trade weight data |
| Route optimization | Geodesic waypoint routing (3 strategies) |
| Carbon footprint delta | Per-mode emissions calculation |
| Sanctions compliance | Corridor-based sanctions screening |
| Insurance premium estimation | Cargo value + corridor risk model |
| Air freight availability | OpenSky Network live data |
| 3D globe visualization | CesiumJS + Cesium World Terrain |
| Decision modal | React + Framer Motion + Firestore realtime |
| PDF executive report | jsPDF + Gemini-generated narrative |
| Push notifications | Web Push API + VAPID |
| Multi-tenant API | Supabase RLS + org isolation |
| Webhook fanout | POST to registered partner URLs |
 
---
 
## 🏗 Architecture
 
```
┌─────────────────────────────────────────────────────────┐
│                    Dashboard (Next.js 15)                │
│  ┌───────────┐ ┌────────────┐ ┌───────────────────────┐ │
│  │ Globe     │ │ Agent Panel│ │ Decision Modal         │ │
│  │ (CesiumJS)│ │ (Chat+News)│ │ (3 Options + Execute) │ │
│  └───────────┘ └────────────┘ └───────────────────────┘ │
│         ↕ Firestore Realtime      ↕ REST API            │
└─────────────────────────────────────────────────────────┘
         ↕                              ↕
┌─────────────────┐         ┌──────────────────────┐
│   Event Bus     │         │      Supabase DB      │
│  (SSE Fan-out)  │         │  (Postgres + RLS)     │
└─────────────────┘         └──────────────────────┘
   ↕          ↕
┌────────┐  ┌────────┐  ┌────────────┐  ┌──────────┐
│Monitor │  │Impact  │  │Resolution  │  │News Intel│
│Agent   │  │Agent   │  │Agent       │  │Agent     │
│:3001   │  │:3002   │  │:3003       │  │:3005     │
└────────┘  └────────┘  └────────────┘  └──────────┘
```
 
---
 
## 🚀 Getting Started
 
### Prerequisites
 
- Node.js 20+
- A Firebase project (Firestore + Auth)
- A Supabase project
- A Google AI Studio API key (free at [aistudio.google.com](https://aistudio.google.com))
### 1. Clone & Install
 
```bash
git clone https://github.com/your-org/OpenTrade
cd OpenTrade
 
# Install root dependencies (event bus + shared packages)
npm install
 
# Install dashboard dependencies
cd dashboard && npm install && cd ..
 
# Install resolution agent dependencies
cd resolution && npm install && cd ..
```
 
### 2. Configure Environment
 
```bash
cp .env.example .env
bash scripts/copy-env.sh  # Copies .env to each service
```
 
**Required variables:**
 
```env
# AI
GEMINI_API_KEY=your-key-from-aistudio.google.com
 
# Firebase Admin (server-side)
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
 
# Firebase Client (browser-safe)
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
 
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
 
# Security
INTERNAL_TOKEN=change_this_before_deploy
```
 
### 3. Set Up Databases
 
**Supabase:**
```bash
# Apply all migrations
supabase db push
# Or manually run files in supabase/migrations/ in order
```
 
**Firestore:**
- Enable Firestore in Native mode
- Deploy security rules from `firestore.rules`
- Enable required composite indexes (Firestore will prompt on first query)
### 4. Seed Sample Data
 
```bash
node shared/db/seed/seed.js
```
 
### 5. Start All Services
 
```bash
# Terminal 1: Event Bus
npm run start:event-bus
 
# Terminal 2: Monitor Agent
npm run start:disruption
 
# Terminal 3: Impact Agent
npm run start:impact
 
# Terminal 4: Resolution Agent
cd resolution && npm start
 
# Terminal 5: News Intelligence Agent
npm run start:news-intel
 
# Terminal 6: Dashboard
cd dashboard && npm run dev
```
 
Open [http://localhost:3000](http://localhost:3000)
 
---
 
## 🎬 Running a Demo
 
The fastest way to see the full pipeline:
 
```bash
# Inject a simulated Pacific Storm disruption
node resolution/simulation/inject.js pacific_storm
 
# Or inject a Suez closure
node resolution/simulation/inject.js suez_closure
 
# Or inject a port strike
node resolution/simulation/inject.js port_strike
```
 
Watch the globe update, the news feed populate, and the Decision Modal appear with three AI-generated resolution strategies within ~60 seconds.
 
**Alternatively**, use the "Simulation" button in the top-right of the dashboard UI.
 
---
 
## 🔁 Pipeline Walkthrough
 
**Step 1 — Detection (0–5s)**
The Monitor Agent scrapes Reuters, GDELT, and MarineTraffic continuously. When a pattern matching a shipping disruption is detected, it publishes a `disruption-events` message to the Event Bus with location, type, severity estimate, and affected zones.
 
**Step 2 — Impact Scoring (5–20s)**
The Impact Agent receives the disruption event. It cross-references active shipments from Supabase, weights them by UN Comtrade trade volume, calculates financial exposure per shipment, and assigns a cascade risk score. It writes the impact report to Firestore and publishes to `impact-reports`.
 
**Step 3 — Resolution Generation (20–60s)**
The Resolution Agent receives the impact report. It:
1. Detects the disruption scenario (Pacific storm, Suez closure, port strike, etc.)
2. Retrieves real-time freight rates and air freight availability
3. Looks up alternative suppliers by region
4. Calculates cost, carbon, and time delta for three routing strategies
5. Calls Gemini AI to generate ranked resolution options with natural-language justification
6. Enriches each option with insurance premium, sanctions screening, and carbon delta
7. Writes options to Firestore + Supabase and publishes to `resolution-options`
**Step 4 — Human Decision (60s+)**
The dashboard's `DecisionModal` receives the options via Firestore real-time. The operator:
- Sees three ranked strategies with full cost/time/carbon/confidence breakdown
- Can approve any option with a single click (or keyboard shortcut 1/2/3)
- Gets a PDF executive report generated by Gemini on demand
- The approved option triggers rerouting status updates to all affected shipments
---
 
## 📊 Performance Benchmarks
 
From latest smoke test (`smoke-check-results.json`):
 
| Metric | Value |
|--------|-------|
| MTTD (Mean Time to Detect) | < 5 seconds |
| End-to-end pipeline latency | ~60 seconds |
| Disruption → Options complete | 3 poll attempts |
| Resolution option count | 3 (always) |
| Pipeline success rate | 100% in smoke test |
| Human hours saved per incident | 6 (tracked in Firestore stats) |
 
---
 
## 🗂 Repository Structure
 
```
OpenTrade/
├── event-bus/              # SSE fan-out message broker
│   ├── index.js            # Fastify server, publish/subscribe/replay
│   └── topics.js           # Canonical topic names
│
├── disruption/             # Monitor Agent (:3001)
│   ├── agent/              # Gemini prompt + agent config
│   ├── api/                # REST routes (events, scrape, health)
│   └── tools/              # Scrapers (Reuters, GDELT, AIS)
│
├── impact/                 # Impact Agent (:3002)
│   ├── agent/              # Scoring prompt
│   ├── api/                # REST routes
│   └── tools/              # Trade weight, cargo scoring
│
├── resolution/             # Resolution Agent (:3003)
│   ├── agent/              # Resolution system prompt
│   ├── api/                # options.service.js (core AI), stream, execute
│   ├── simulation/         # Inject test scenarios
│   └── tools/              # Routing, cost, carbon, sanctions, insurance
│
├── news-intel/             # News Intelligence Agent (:3005)
│   ├── api/                # Polling routes
│   └── tools/              # GDELT, Reuters, NewsAPI scrapers
│
├── dashboard/              # Next.js 15 frontend
│   ├── app/
│   │   ├── api/            # BFF routes (resolutions, execute, generate-report)
│   │   ├── components/     # Globe, Decision Modal, Agent Panel, Nav
│   │   ├── hooks/          # useResolutions, useDisruptions, useShipments
│   │   ├── store/          # Zustand stores (alertStore, shipmentStore)
│   │   └── providers/      # DataProvider (wires all Firestore hooks)
│   └── lib/                # Firebase client, PDF generator
│
├── shared/                 # Shared libraries across all agents
│   ├── db/                 # Firebase admin + Supabase clients
│   ├── lib/                # Gemini, logger, metrics, scraper, LLM JSON
│   └── types/              # AgentPayload, Shipment, Supplier schemas
│
├── supabase/
│   └── migrations/         # All DB schema migrations in order
│
├── tests/
│   └── integration/        # End-to-end pipeline test
│
└── scripts/
    ├── copy-env.sh          # Distribute .env to all services
    └── smoke-overall.mjs   # Full smoke test
```
 
---
 
## 🔒 Security
 
- All inter-service communication authenticated via `INTERNAL_TOKEN` (Bearer)
- Firestore security rules enforce org-level data isolation
- Supabase Row Level Security (RLS) enabled on all tables with org isolation
- Firebase client SDK protected by Firestore security rules (no service key in browser)
- Supabase anon key scoped to RLS-protected reads only
- Push notification VAPID keys server-side only
---
 
## 🌐 Deployment
 
The project deploys as follows:
 
| Service | Platform |
|---------|----------|
| Dashboard | Vercel (auto-deploys from `main`) |
| Event Bus | Render (always-on) |
| Monitor Agent | Render |
| Impact Agent | Render |
| Resolution Agent | Render |
| News Intel Agent | Render |
| Database | Supabase (managed Postgres) |
| Realtime | Firebase Firestore |
 
CI/CD via `.github/workflows/deploy.yml`.
 
**Environment variables** must be set in each platform's dashboard. Use `scripts/copy-env.sh` to keep local `.env` files in sync.
 
---
 
## 🧪 Testing
 
```bash
# Smoke test (requires all services running)
node scripts/smoke-overall.mjs
 
# Integration test
RUN_INTEGRATION_TESTS=1 node --test tests/integration/pipeline.test.mjs
 
# Resolution agent unit tests
cd resolution && npm test
 
# Scraper smoke test
node scripts/smoke-scraper.mjs
```
 
---
 
## 🤝 Contributing
 
1. Fork the repository
2. Create a feature branch (`git checkout -b feat/your-feature`)
3. Run the smoke test before pushing (`node scripts/smoke-overall.mjs`)
4. Open a pull request — CI will run integration tests automatically
---
 
## 📄 License
 
MIT License. See `LICENSE` for details.
 
---
 
## 🙏 Acknowledgments
 
Built with:
- [Google Gemini](https://aistudio.google.com) — AI backbone
- [Firebase](https://firebase.google.com) — Realtime database
- [Supabase](https://supabase.com) — Structured data + RLS
- [CesiumJS](https://cesium.com) — 3D globe
- [GDELT Project](https://www.gdeltproject.org) — Global news intelligence
- [AISStream](https://aisstream.io) — Vessel tracking
- [UN Comtrade](https://comtradeplus.un.org) — Trade volume weighting
---
 
*OpenTrade — Because the world can't wait for email chains when $500M of cargo is on the line.*