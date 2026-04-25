# HOW TO RUN (Phase 2.5)

This guide is for local development on Windows/macOS/Linux.
## 1. Prerequisites

- Node.js 18+
- npm 9+
- Firebase project (Firestore enabled)
- Supabase project
- Gemini API key

## 2. Clone and Install

```bash
git clone <repo-url>
cd GDG-Solutions-Challenge-2026
npm run setup
```
## 3. Environment Setup

1. Copy root env template:

```bash
cp .env.example .env
```

2. Fill all required values in `.env`:
- `GEMINI_API_KEY`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `EVENT_BUS_URL`
- `DISRUPTION_AGENT_URL`
- `NEWSAPI_KEY` (optional)
- `NEWS_CRON_SCHEDULE` or `NEWS_POLL_INTERVAL_MS`
- `NEXT_PUBLIC_FIREBASE_*`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

3. Copy env to services:

```bash
bash scripts/copy-env.sh
```

On Git Bash/WSL you can also run:

```bash
scripts/copy-env.sh
```
## 4. Database Setup

1. In Supabase SQL Editor, run the Phase 2.5 schema SQL (enums, tables, indexes, views, policies).
2. Ensure `capabilities` table is seeded (included in the SQL).

## 5. Seed Data

```bash
npm run seed
```

Expected:
- 50 shipments in Firestore
- suppliers + supplier_capabilities in Supabase

## 6. Start Services (6 terminals)

Terminal 1:
```bash
npm run dev:bus
```

Terminal 2:
```bash
npm run dev:disruption
```

Terminal 3:
```bash
npm run dev:impact
```

Terminal 4:
```bash
npm run dev:resolution
```

Terminal 5:
```bash
npm run dev:news
```

Terminal 6:
```bash
npm run dev:dashboard
```

Dashboard URL: `http://localhost:3000`

## 7. Health Check

```bash
npm run health
```

## 8. Run Demo Simulations

```bash
npm run inject:pacific
npm run inject:strike
npm run inject:suez
```

## 9. Verify Expected Behavior

- New disruption appears in Firestore and dashboard alert stream.
- Impact report is generated and persisted in Supabase + Firestore.
- Resolution options appear in dashboard and persist in Supabase + Firestore.
- Executing an option marks resolution as resolved and updates shipment statuses.

## 10. Common Issues

- Missing Supabase env vars: check `.env` and re-run `bash scripts/copy-env.sh`.
- `FIREBASE_PRIVATE_KEY` parse errors: keep escaped newlines (`\n`) in `.env`.
- Seed fails on capabilities: re-run Supabase schema SQL first.
- Ports in use: free 3000, 3001, 3002, 3003, 3005, 4000 and restart services.
- News service cold starts can take a short delay before the first poll cycle fires.
- `ERR_MODULE_NOT_FOUND` for `@opentelemetry/sdk-node`: run `npm install` at repo root, then restart `npm run dev:all`.

