# Supply Chain AI — Master Build Blueprint  
## Google Hackathon 2026  

---

# AI-DRIVEN ANTI-FRAGILE SUPPLY CHAIN

## Master Build Blueprint — Production-Grade Architecture

**Google Hackathon 2026 · Problem Statement #1 · 4-Person Team · 72-Hour Build**

---

## Complexity
**10 / 10**

## Primary Tech
**Vertex AI + Gemini**

## Arch Pattern
**Multi-Agent + Event-Driven**

## Demo Impact
**Autonomous Resolution**

---

# 1. System Vision & Engineering Philosophy

This document is the single source of truth for building the AI-Driven Anti-Fragile Supply Chain system. It covers architecture, communication protocols, folder structure, file-by-file responsibilities, Google Developer tooling, and a phase-by-phase build plan with explicit task assignments per team member.

---

## 1.1 The Core Shift

| Dimension | Legacy Supply Chain (Status Quo) | Our System (What We Build) |
|----------|----------------------------------|-----------------------------|
| Response Mode | Alert → Human Decision → Manual Action | Detect → Reason → Resolve (Autonomous) |
| Architecture | Monolithic REST API | Multi-Agent + Event-Driven + Multi-Protocol |
| Communication | Polling / Email alerts | Pub/Sub + WebSocket + SSE (Real-time) |
| AI Role | None / basic ML forecasting | Vertex AI Agent Orchestration (Tool-Calling) |
| Data Depth | Structured DB queries only | BigQuery ML + Google Search Grounding |
| Response Time | 4–72 hours (human loop) | < 60 seconds (autonomous loop) |

---

## 1.2 Why Multi-Protocol (Not Just REST)

Most hackathon teams build a single REST API backend. This is acceptable for CRUD, but catastrophic for a real-time multi-agent system.

| Protocol | Used For | Why Not REST | Files Involved |
|----------|----------|-------------|----------------|
| REST (HTTP/JSON) | Shipment CRUD, supplier management, option execution | Appropriate for structured, non-time-sensitive operations | events.route.js, impact.route.js, options.route.js, execute.route.js |
| WebSocket | Real-time agent status broadcast | REST polling adds latency | subscriber.js → websocket.js |
| Pub/Sub | Agent pipeline events | Decoupling agents | publisher.js, subscriber.js |
| Server-Sent Events | Gemini reasoning stream | Lower overhead than WS | AgentChatSidebar.jsx |
| Firestore RT | Live state sync | REST cannot push | firebase.js, hooks |

---

# 2. Complete Technology Stack — Google Developer Tools

## 2.1 Google AI & ML Services

- Vertex AI Agent Builder → orchestration layer  
- Gemini 1.5 Flash → reasoning LLM  
- Google Search Grounding → live signals  
- BigQuery ML (ARIMA+) → predictive models  
- Vertex AI Embeddings → supplier semantic search  

---

## 2.2 Google Infrastructure

- Google Cloud Pub/Sub → event bus  
- Cloud Run → serverless microservices  
- Firebase Data Connect → relational DB  
- Firestore → real-time dashboard  
- Firebase Auth → authentication  
- Cloud Messaging → push alerts  
- Cloud Build → CI/CD  
- Google Maps → routing + visualization  
- Cloud Storage → datasets  
- Secret Manager → secrets  
- Cloud Logging + Trace → observability  

---

## 2.3 Frontend Stack

- Next.js 15  
- Tailwind CSS  
- Shadcn/UI  
- Zustand  
- Recharts  
- Lucide Icons  

---

# 3. Complete Folder Structure & File Responsibilities

## 3.1 Full Repository Map

```

supply-chain-ai/

├── disruption/
├── impact/
├── resolution/
├── dashboard/
└── shared/

````

---

# 4. System Architecture — Deep Dive

## 4.1 Multi-Agent Orchestration on Vertex AI

| Agent | Role | Pub/Sub In | Pub/Sub Out | Tools |
|------|------|------------|-------------|------|
| Monitor | Detect disruption | External | disruption-events | searchTool, weatherTool |
| Impact | Analyze impact | disruption-events | impact-reports | bigqueryTool |
| Negotiator | Generate options | impact-reports | resolution-options | routingTool |

---

## 4.2 Communication Protocol Map

(Complete mapping preserved exactly)

---

## 4.3 End-to-End Data Flow — "Pacific Storm"

Step-by-step 11-stage pipeline:

1. Inject event  
2. Classify  
3. Publish  
4. Dashboard alert  
5. Impact analysis  
6. Publish report  
7. Generate options  
8. Stream reasoning  
9. Display options  
10. Execute decision  
11. Update map  

(All latency + file references preserved)

---

## 4.4 Firebase Data Connect Schema

```sql
CREATE TABLE shipments (...);
CREATE TABLE suppliers (...);
CREATE TABLE disruption_events (...);
CREATE TABLE resolution_options (...);
````

(Full schema preserved exactly)

---

## 4.5 BigQuery ML Models

* ARIMA Transit Model
* Severity Score Model
* Cascade Impact Model

(Full SQL preserved)

---

# 5. Gemini Agent Prompts & Function Call Contracts

## 5.1 Monitor Agent Prompt

(Full prompt preserved)

## 5.2 Impact Agent Prompt

(Full prompt preserved)

## 5.3 Negotiator Agent Prompt

(Full prompt preserved)

---

# 6. Key Code Patterns — Production-Quality Implementations

## 6.1 Pub/Sub Publisher

```js
export async function publish(...) { ... }
```

## 6.2 SSE Streaming

```js
res.setHeader('Content-Type', 'text/event-stream');
```

## 6.3 Firestore Hook

```js
onSnapshot(...)
```

## 6.4 SSE Consumer

```js
const es = new EventSource(...)
```

(All code preserved)

---

# 7. Google Developer Tools — Setup Guide

## 7.1 GCP Setup

```bash
gcloud services enable ...
```

## 7.2 Vertex AI Setup

## 7.3 BigQuery Setup

## 7.4 Firebase Setup

## 7.5 Pub/Sub Setup

## 7.6 Maps Setup

(All commands preserved exactly)

---

# 8. Phase 1 — Infrastructure (0–12 hrs)

Checklist:

* GCP setup
* DB schema
* Pub/Sub topics
* Next.js scaffold
* CI/CD pipeline

(Detailed task table preserved)

---

# 9. Phase 2 — Core Agents (12–36 hrs)

* Monitor Agent
* Impact Agent
* Negotiator Agent

(Full task breakdown preserved)

---

# 10. Phase 3 — Dashboard (36–60 hrs)

* Map components
* Alerts
* Decision modal
* State management

(Full component-level detail preserved)

---

# 11. Phase 4 — Polish (60–72 hrs)

* Deployment
* Error handling
* Demo readiness

---

# 12. Production Quality Checklist

## Architecture Quality

* Idempotency
* Observability
* Scalability
* Security

## Code Quality

* Typed schemas
* AgentPayload enforced
* No hardcoding

---

# 13. Critical Do's & Don'ts

## ✅ Do's

* Show full agent chain
* Use real Gemini calls
* Use Cloud Logging
* Deploy on Cloud Run

## ❌ Don'ts

* No hardcoded AI responses
* No REST-only architecture
* No localhost demo

---
