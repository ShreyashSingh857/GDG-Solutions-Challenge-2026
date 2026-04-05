# 🚀 AI-Driven Anti-Fragile Supply Chain  
### Google Hackathon 2026 · Production-Grade Multi-Agent System

---

## 🧠 Overview

**AI-Driven Anti-Fragile Supply Chain** is a real-time, autonomous decision-making system that detects disruptions, analyzes impact, and resolves them using AI agents — all within seconds.

Unlike traditional systems that rely on human intervention, this platform uses **Vertex AI + Gemini-powered agents** to:

- Detect disruptions (storms, strikes, closures)
- Analyze financial & operational impact
- Generate optimal resolution strategies
- Execute decisions autonomously

---

## ⚡ Key Highlights

- 🤖 **Multi-Agent AI System** (Monitor → Impact → Negotiator)
- 🔄 **Event-Driven Architecture** using Pub/Sub
- ⚡ **Real-Time Dashboard** with Firestore + WebSockets
- 🧠 **Gemini 1.5 Flash Reasoning + Tool Calling**
- 📊 **BigQuery ML (ARIMA+) for Predictions**
- 🗺️ **Google Maps Fleet Routing Integration**
- 📡 **Live Agent Reasoning Streaming (SSE)**

---

## 🏗️ Architecture Overview

```

External Event → Monitor Agent → Impact Agent → Negotiator Agent → Dashboard → Execution

```

### Core Flow:
1. Disruption detected (news/weather/API)
2. Monitor Agent classifies event
3. Impact Agent evaluates affected shipments
4. Negotiator Agent generates 3 solutions
5. Dashboard displays options in real-time
6. Manager approves → system executes automatically

---

## 🧩 Tech Stack

### 🔹 AI & ML
- Vertex AI Agent Builder
- Gemini 1.5 Flash
- BigQuery ML (ARIMA+)
- Vertex AI Embeddings

### 🔹 Backend & Infra
- Google Cloud Run
- Google Cloud Pub/Sub
- Firebase Data Connect (PostgreSQL)
- Firestore (Real-time DB)
- Cloud Build (CI/CD)
- Secret Manager

### 🔹 Frontend
- Next.js 15 (App Router)
- Tailwind CSS
- Shadcn/UI
- Zustand (State Management)
- Recharts (Data Visualization)

### 🔹 Maps & Routing
- Google Maps Platform
- Fleet Routing API

---

## 📁 Repository Structure

```

supply-chain-ai/

├── disruption/     # Monitor Agent
├── impact/         # Impact Agent
├── resolution/     # Negotiator Agent
├── dashboard/      # Next.js Frontend
└── shared/         # Shared modules (DB, Pub/Sub, Auth, Types)

````

---

## 🤖 Agents Breakdown

### 🟡 Monitor Agent
- Detects disruptions using Google Search + Weather API
- Classifies severity and affected zones
- Publishes events to Pub/Sub

### 🔵 Impact Agent
- Uses BigQuery ML to calculate impact
- Identifies affected shipments
- Generates ImpactReport

### 🟢 Negotiator Agent
- Generates 3 optimized resolution strategies:
  - Best balance
  - Fastest
  - Cheapest
- Uses routing, supplier lookup, and cost analysis

---

## 🔄 Communication Architecture

| Protocol | Purpose |
|----------|--------|
| REST | CRUD + execution |
| Pub/Sub | Agent-to-agent communication |
| WebSocket | Agent status updates |
| SSE | Streaming AI reasoning |
| Firestore RT | Real-time UI sync |

---

## ⚙️ Setup Guide

### 1️⃣ Clone Repo
```bash
git clone https://github.com/your-username/supply-chain-ai.git
cd supply-chain-ai
````

---

### 2️⃣ Install Dependencies

```bash
npm install
```

---

### 3️⃣ Setup Environment Variables

Create `.env` based on `.env.example`:

```
GCP_PROJECT_ID=
FIREBASE_PROJECT_ID=
MAPS_API_KEY=
VERTEX_AI_LOCATION=us-central1
```

---

### 4️⃣ Enable GCP Services

```bash
gcloud services enable \
  aiplatform.googleapis.com \
  bigquery.googleapis.com \
  pubsub.googleapis.com \
  run.googleapis.com \
  firestore.googleapis.com
```

---

### 5️⃣ Setup Firebase

```bash
firebase login
firebase init
```

---

### 6️⃣ Run Locally

#### Start Backend Services

```bash
npm run dev:disruption
npm run dev:impact
npm run dev:resolution
```

#### Start Frontend

```bash
cd dashboard
npm run dev
```

---

## 🧪 Run Simulation

Trigger a disruption scenario:

```bash
node resolution/simulation/inject.js pacific_storm
```

Other scenarios:

* `suez_closure`
* `port_strike`

---

## 📊 Dashboard Features

* 🌍 Live shipment tracking on map
* 🚨 Real-time disruption alerts
* 🧠 AI reasoning stream (like ChatGPT thinking)
* 📈 Cost vs Time decision charts
* ✅ One-click resolution execution

---

## 🔁 End-to-End Flow (Demo)

1. Inject disruption
2. Alert appears on dashboard
3. Impact calculated via BigQuery
4. AI generates 3 options
5. Reasoning streams live
6. Manager selects option
7. System updates routes instantly

---

## 🏆 Why This Project Wins

* Real **agentic architecture**, not just API calls
* True **event-driven system** (not REST chaining)
* Uses **multiple Google services deeply**
* Demonstrates **real AI reasoning + decision-making**
* Fully **deployable production-grade system**

---

## 🚀 Deployment

Deploy all services using Cloud Run:

```bash
gcloud builds submit --config infra/cloudbuild.yaml
```

---

## 🔍 Observability

* Cloud Logging → trace every agent decision
* Cloud Trace → latency per agent
* Firestore → real-time state debugging

---

## 📌 Future Improvements

* Reinforcement learning for decision optimization
* Multi-region deployment
* Predictive disruption prevention
* Autonomous execution without human approval

---

## 👥 Team

**4-Person Hackathon Team**

* AI Lead
* Backend Engineer (x2)
* Frontend Engineer

---

## 📜 License

MIT License

---

## 💡 Final Thought

> “Don’t just detect problems. Build systems that **fix them automatically**.”

---

