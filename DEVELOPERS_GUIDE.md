# OpenTrade Developers Guide

This guide explains how to access the OpenTrade API and make requests from curl, JavaScript, and Python.

## Base URL

Use your deployed dashboard URL as the API host.

- Production example: `https://your-app.vercel.app`
- Local example: `http://localhost:3000`

All public endpoints are under `/api/v1`.

## Authentication

Every API request must include an API key in the `x-api-key` header.

Example header:

```http
x-api-key: YOUR_API_KEY
```

If your environment has a seeded demo key, you can use:

```http
x-api-key: opentrade-demo-key-2026
```

## Getting API Key

### Option A: Use the public demo key

If your deployment seeded the demo key, use this value directly:

```http
x-api-key: opentrade-demo-key-2026
```

### Option B: Seed the demo key in Supabase (one-time)

Run the SQL below in your Supabase SQL editor:

```sql
INSERT INTO api_keys (id, org_id, label, key_hash, created_at)
VALUES (
  gen_random_uuid(),
  'demo-org',
  'Public Demo Key - Read Only',
  encode(sha256('opentrade-demo-key-2026'::bytea), 'hex'),
  now()
)
ON CONFLICT DO NOTHING;
```

After this insert, clients can authenticate with:

```http
x-api-key: opentrade-demo-key-2026
```

### Option C: Create org keys from the app UI

Open the Settings page and use the API Keys section to generate per-org keys.
Newly generated keys are shown once and should be stored securely by the caller.

## Quick Start (curl)

```bash
BASE_URL="http://localhost:3000"
API_KEY="opentrade-demo-key-2026"

curl "${BASE_URL}/api/v1/shipments?pageSize=10" \
  -H "x-api-key: ${API_KEY}"
```

## Endpoint Reference

### 1) List shipments

`GET /api/v1/shipments`

Optional query params:

- `pageSize` (default 25, max 100)
- `cursor`

```bash
curl "${BASE_URL}/api/v1/shipments?pageSize=10" \
  -H "x-api-key: ${API_KEY}"
```

### 2) Create shipment

`POST /api/v1/shipments`

Required fields:

- `origin`, `destination`
- `originLat`, `originLng`
- `destLat`, `destLng`
- `carrier`, `cargoValueUSD`

```bash
curl -X POST "${BASE_URL}/api/v1/shipments" \
  -H "x-api-key: ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "origin": "Singapore",
    "destination": "Los Angeles",
    "originLat": 1.3521,
    "originLng": 103.8198,
    "destLat": 34.0522,
    "destLng": -118.2437,
    "carrier": "COSCO",
    "cargoValueUSD": 850000
  }'
```

### 3) Get shipment by ID

`GET /api/v1/shipments/:id`

```bash
curl "${BASE_URL}/api/v1/shipments/ship-abc123" \
  -H "x-api-key: ${API_KEY}"
```

### 4) Update shipment status

`PATCH /api/v1/shipments/:id/status`

Allowed statuses:

- `active`, `delayed`, `rerouted`, `delivered`, `cancelled`

```bash
curl -X PATCH "${BASE_URL}/api/v1/shipments/ship-abc123/status" \
  -H "x-api-key: ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{ "status": "rerouted" }'
```

### 5) List disruptions

`GET /api/v1/disruptions`

Optional query params:

- `from` (ISO date)
- `to` (ISO date)
- `limit` (default 50, max 200)

```bash
curl "${BASE_URL}/api/v1/disruptions?limit=20" \
  -H "x-api-key: ${API_KEY}"
```

### 6) Get disruption details

`GET /api/v1/disruptions/:id`

Returns disruption details and latest resolution options.

```bash
curl "${BASE_URL}/api/v1/disruptions/disr-001" \
  -H "x-api-key: ${API_KEY}"
```

### 7) Register webhook

`POST /api/v1/webhooks`

Currently supported event:

- `resolution.ready`

```bash
curl -X POST "${BASE_URL}/api/v1/webhooks" \
  -H "x-api-key: ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-app.com/webhook",
    "event": "resolution.ready"
  }'
```

### 8) Delete webhook

`DELETE /api/v1/webhooks/:id`

```bash
curl -X DELETE "${BASE_URL}/api/v1/webhooks/wh-001" \
  -H "x-api-key: ${API_KEY}"
```

## JavaScript Example

```js
const BASE_URL = 'http://localhost:3000';
const API_KEY = 'opentrade-demo-key-2026';

async function listShipments() {
  const response = await fetch(`${BASE_URL}/api/v1/shipments?pageSize=10`, {
    headers: { 'x-api-key': API_KEY },
  });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  const body = await response.json();
  return body.data;
}
```

## Python Example

```python
import requests

BASE_URL = "http://localhost:3000"
API_KEY = "opentrade-demo-key-2026"

response = requests.get(
    f"{BASE_URL}/api/v1/disruptions?limit=10",
    headers={"x-api-key": API_KEY},
    timeout=30,
)
response.raise_for_status()
print(response.json())
```

## CORS and Browser Usage

The v1 API supports CORS, including `OPTIONS` preflight for browser clients and API tools.

## Common Error Responses

- `401`: Missing or invalid API key
- `429`: API key rate limit exceeded
- `400`: Validation error (for example, missing required fields)
- `500`: Server-side processing error

## Related Docs

- Public API portal UI: `/developers`
- Main project overview: `README.md`
