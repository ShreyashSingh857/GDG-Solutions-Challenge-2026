# 🚀 Supply Chain AI — Multi-Agent Autonomous System

## 🧠 Overview

This project is a **production-grade AI-driven supply chain system** built using:

* **Multi-Agent Architecture (Monitor → Impact → Negotiator)**
* **Event-Driven Design (Pub/Sub)**
* **Real-Time Dashboard (Next.js + Firestore)**
* **Vertex AI + Gemini for reasoning**

The system detects disruptions, analyzes impact, and autonomously generates resolution strategies.

---

## 📂 Repository Structure

```
supply-chain-ai/
│
├── disruption/        # Monitor Agent
├── impact/            # Impact Agent
├── resolution/        # Negotiator Agent
├── dashboard/         # Frontend (Next.js)
├── shared/            # Shared utilities & infra
├── docs/              # Documentation
├── .env.example
└── README.md
```

---

## 🆕 Dashboard Production Structure

The dashboard is organized for production readiness:

```
dashboard/
	src/
		app/
			dashboard/
				page.jsx, layout.jsx
				api/webhooks/pubsub/route.js
				components/
					map/GlobalCommandMap.jsx, ShipmentMarker.jsx, RouteOverlay.jsx
					alerts/AlertToast.jsx, SeverityBadge.jsx
					decision/DecisionModal.jsx, OptionCard.jsx, CostTimeChart.jsx, FeedbackThumb.jsx
					agent/AgentChatSidebar.jsx, AgentStatusBadge.jsx
				store/shipmentStore.js, alertStore.js
				hooks/useShipments.js, useDisruptions.js
				lib/websocket.js, firebase.js
```

All files are initialized with minimal boilerplate for rapid development.

---

---

## 🔍 Folder & File Responsibilities

### 1️⃣ disruption/ (Monitor Agent)

Detects real-world disruptions.

* `agent/agent.yaml` → Vertex AI agent config
* `agent/prompt.md` → LLM instructions
* `tools/searchTool.js` → Google Search grounding
* `tools/weatherTool.js` → Weather API integration
* `tools/pubsubTrigger.js` → Publishes events
* `api/events.route.js` → REST endpoints
* `api/events.service.js` → Business logic
* `types/DisruptionEvent.js` → Event schema
* `index.js` → Service entry point

---

### 2️⃣ impact/ (Impact Agent)

Analyzes disruption impact.

* `agent/agent.yaml` → Agent config
* `prompt.md` → Impact reasoning logic
* `tools/bigqueryTool.js` → ML queries
* `tools/shipmentLookup.js` → DB queries
* `api/impact.route.js` → API endpoints
* `api/impact.service.js` → Core logic
* `ml/*.sql` → ML models (ARIMA, scoring)
* `types/ImpactReport.js` → Output schema
* `index.js` → Entry point

---

### 3️⃣ resolution/ (Negotiator Agent)

Generates solutions.

* `agent/agent.yaml` → Agent config
* `prompt.md` → Decision logic
* `tools/routingTool.js` → Google Maps routing
* `tools/supplierLookup.js` → AI embeddings search
* `tools/costCalculator.js` → Cost evaluation
* `api/options.route.js` → Fetch + SSE stream
* `api/options.service.js` → Core logic
* `api/execute.route.js` → Execute decisions
* `simulation/*.js` → Demo scenarios
* `types/ResolutionOption.js` → Output schema
* `index.js` → Entry point

---

### 4️⃣ dashboard/ (Frontend)

Real-time UI for visualization.

#### app/

* `page.jsx` → Main UI layout
* `layout.jsx` → Providers & auth

#### components/

**Map**

* `GlobalCommandMap.jsx` → Main map
* `ShipmentMarker.jsx` → Shipment UI
* `RouteOverlay.jsx` → Route visualization

**Alerts**

* `AlertToast.jsx` → Notifications
* `SeverityBadge.jsx` → Alert severity

**Decision**

* `DecisionModal.jsx` → Options UI
* `OptionCard.jsx` → Option display
* `CostTimeChart.jsx` → Charts
* `FeedbackThumb.jsx` → Feedback

**Agent**

* `AgentChatSidebar.jsx` → SSE reasoning stream
* `AgentStatusBadge.jsx` → Agent state

#### state & hooks

* `store/*.js` → Zustand stores
* `hooks/*.js` → Firestore listeners

#### utils

* `lib/websocket.js` → WS client
* `lib/firebase.js` → Firebase config

---

### 5️⃣ shared/ (Core Infrastructure)

Used across all services.

#### db/

* `schema.sql` → PostgreSQL schema
* `firebase.js` → Firebase Admin
* `seed/mock_shipments.json` → Demo data

#### pubsub/

* `publisher.js` → Publish events
* `subscriber.js` → Consume events

#### types/

* `Shipment.js` → Shipment schema
* `Supplier.js` → Supplier schema
* `AgentPayload.js` → Message format

#### auth/

* `firebase-auth.js` → JWT middleware

#### orchestrator/

* `agent.yaml` → Master orchestration
* `handoff.md` → Agent contracts

#### infra/

* `cloudbuild.yaml` → CI/CD
* `cloud-run/service.yaml` → Deployment
* `pubsub/topics.yaml` → Topics
* `bigquery/dataset.yaml` → ML infra

---

### 6️⃣ docs/

* `demo-script.md` → Demo walkthrough

---

## ⚙️ Setup

```bash
node setup.js
npm install
```

---

## ▶️ Run (High Level)

```bash
# Start services (example)
node disruption/index.js
node impact/index.js
node resolution/index.js

# Start frontend
cd dashboard
npm run dev
```

---

## 🐳 Docker Compose (Local Development)

To run the entire system in containers on different ports:

```bash
docker-compose up --build
```

This will start:

- disruption (port 4001)
- impact (port 4002)
- resolution (port 4003)
- dashboard (port 3000)

See `docker-compose.yml` for details.

---

## 🔁 System Flow

1. Event detected → Monitor Agent
2. Published via Pub/Sub
3. Impact Agent calculates risk
4. Negotiator Agent generates 3 solutions
5. Dashboard shows results in real-time

---

## 🏆 Key Features

* ⚡ Real-time event-driven architecture
* 🤖 Multi-agent AI reasoning
* 🌍 Live map visualization
* 📡 SSE + WebSocket streaming
* 📊 ML-powered impact analysis

---

## 📌 Note

This is a **hackathon-grade production architecture**, designed to demonstrate:

* System design excellence
* AI orchestration
* Real-time distributed systems

---

## 👨‍💻 Author

Built for **Google Hackathon 2026**
