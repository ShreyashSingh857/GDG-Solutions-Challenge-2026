# OpenTrade - AI-Driven Supply Chain Intelligence
### Autonomous Multi-Agent Logistics Resolution System

---

## Overview

**OpenTrade** is a complete, production-ready system providing real-time autonomous supply chain disruption detection and resolution. Powered by Gemini AI, Firestore, and a custom high-throughput Node.js event bus, OpenTrade serves as an automated command center that protects global trade pipelines from unforeseen events.

By replacing hours of manual analysis with instantaneous AI-driven reasoning, OpenTrade identifies disruptions, evaluates their financial and logistical impact, and negotiates the most optimal rerouting solutions—all in under 60 seconds.

The system relies on a seamless multi-agent pipeline:
**News Intel Agent** → **Monitor Agent** → **Impact Agent** → **Resolution Agent** → **Dashboard & Execution**

---

## Architecture & Flow

OpenTrade operates on a resilient, event-driven microservices architecture:

1. **News Intel Agent**
   - **Role:** Continuously polls global news sources (GDELT, NewsAPI) and assesses breaking events using a Gemini classifier.
   - **Flow:** Upon detecting a high-severity incident, it broadcasts a `news-alerts` event to the central Event Bus.
2. **Monitor (Disruption) Agent**
   - **Role:** Listens to incoming `news-alerts`. Cross-references events with live weather telemetry (Open-Meteo) and AIS maritime tracking data.
   - **Flow:** Identifies actionable disruptions and publishes a precise `disruption-events` payload to the Event Bus.
3. **Impact Agent**
   - **Role:** Listens to `disruption-events`. Instantly queries the global shipping database (Firestore) to pinpoint shipments intersecting the disruption zone using advanced haversine geospatial scoring.
   - **Flow:** Computes the total cargo value at risk and emits comprehensive `impact-reports` to the Event Bus.
4. **Resolution (Negotiator) Agent**
   - **Role:** Listens to `impact-reports`. Utilizes Gemini's advanced reasoning to generate viable, cost-effective resolution options (e.g., rerouting, alternative transport). It calculates the deltas for cost, time, and carbon emissions.
   - **Flow:** Safely persists options to Firestore and dispatches a `resolution-options` payload via external webhooks.
5. **Dashboard & Execution Engine**
   - **Role:** A premium Next.js frontend featuring real-time 3D globe visualizations of active shipments and anomalies.
   - **Flow:** Displays the generated options in an interactive command center interface. Authorized personnel can execute the chosen resolution with a single click, immediately updating active shipment trajectories across the database.

---

## Tech Stack

- **Core AI:** Gemini 1.5 Flash (via Google AI Studio)
- **Event Bus:** Custom Node.js EventEmitter / SSE Server
- **Database:** Firebase Firestore
- **Authentication:** Firebase Auth (Google OAuth)
- **Backend Services:** Fastify Microservices
- **Frontend Command Center:** Next.js 15 (React 19)
- **Data Visualization:** Cesium (3D Globe), Recharts, Framer Motion
- **CI/CD:** GitHub Actions

---

## Endpoints

Developer onboarding and API call examples are documented in **DEVELOPERS_GUIDE.md**.

### 1. Dashboard (Next.js - API v1)
Provides the public REST API and frontend integration.
- `GET /api/v1/shipments`: List shipments (paginated)
- `POST /api/v1/shipments`: Create a new shipment
- `GET /api/v1/shipments/:id`: Get a single shipment
- `PATCH /api/v1/shipments/:id/status`: Update shipment status
- `GET /api/v1/disruptions`: List disruptions
- `GET /api/v1/disruptions/:id`: Get disruption details + resolution options
- `POST /api/v1/webhooks`: Register an outbound webhook
- `DELETE /api/v1/webhooks/:id`: Delete a webhook
- `GET /api/visualize/timeline`: Get event timeline for visualization
- `GET /api/visualize/trace/:id`: Get detailed execution trace
- `GET /api/stream/:traceId`: SSE stream for live agent reasoning

### 2. Event Bus
Central pub/sub message broker.
- `GET /health`: Health check
- `GET /metrics`: Service metrics
- `POST /publish`: Publish an event to a topic (`{ topic, payload }`)
- `GET /subscribe/:topic`: SSE endpoint for subscribing to a topic
- `GET /replay/:topic`: Retrieve historical events for a topic
- `GET /dead-letters`: Retrieve failed events

### 3. News Intel Agent
- `GET /health` / `GET /metrics`: Health and metrics
- `GET /news`: List recent news alerts
- `GET /news/:id`: Get specific news alert
- `POST /news/poll`: Manually trigger a polling cycle

### 4. Monitor (Disruption) Agent
- `GET /health` / `GET /metrics`: Health and metrics
- `GET /events`: List detected disruption events
- `GET /events/:id`: Get specific disruption event
- `POST /events`: Manually ingest an event

### 5. Impact Agent
- `GET /health` / `GET /metrics`: Health and metrics
- `GET /impact/:id`: Get impact report by disruption ID
- `POST /impact/run`: Manually trigger an impact analysis run for a given disruption ID

### 6. Resolution Agent
- `GET /health` / `GET /metrics`: Health and metrics
- `GET /options/:traceId`: Get resolution options for a specific trace
- `GET /options/stream/:traceId`: Stream resolution options generation
- `GET /stream/:traceId`: Raw SSE stream of Gemini reasoning
- `POST /execute`: Execute a chosen resolution option

---

## Local Setup

### 1. Clone and Install
```bash
git clone https://github.com/ShreyashSingh857/GDG-Solutions-Challenge-2026.git
cd GDG-Solutions-Challenge-2026

# Install dependencies across all packages
npm run setup
```

### 2. Environment Variables
Copy `.env.example` to `.env` in the root directory and populate keys (Gemini, Firebase, etc.). The microservices will automatically inherit from the root `.env` file.

### 3. Seed Database
Initialize the Firestore database with baseline shipping data:
```bash
npm run seed
```

### 4. Start the Cluster
Use the provided concurrent runner to seamlessly boot all 6 microservices at once:
```bash
npm run dev
```

### 5. Run a Disruption Simulation
Trigger a simulated global event (e.g., a Suez Canal closure) to watch the AI agents perform:
```bash
npm run inject:suez
```
Open the Dashboard at `http://localhost:3000` to monitor the multi-agent pipeline resolving the crisis in real-time.

---

## Deployment Configuration

OpenTrade is optimized for seamless deployment across standard cloud providers:
- **Backend Microservices:** Deployable directly to Render, Heroku, or Google Cloud Run as separate web services.
- **Frontend Dashboard:** Optimized for Vercel deployment with serverless functions handling the API v1 layer.
- **Monitoring:** OpenTelemetry instrumentation is supported out-of-the-box for enterprise observability.
