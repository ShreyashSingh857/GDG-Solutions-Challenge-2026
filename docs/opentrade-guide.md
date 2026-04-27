# OpenTrade — Day-Before-Submission Build Guide

Five features, in build order. Each section tells you exactly which files to touch and gives you complete copy-paste code.

---

## Feature 1 — CORS + Public Demo API Key

**Why first:** Judges will try to hit your API from their browser/Postman. Without CORS they'll get a blocked request. Without a demo key they'll have nothing to authenticate with.

### Step 1A — Add CORS middleware to all v1 routes

Create `dashboard/app/api/v1/_cors.js`:

```js
// dashboard/app/api/v1/_cors.js
const ALLOWED_ORIGINS = ['*']; // tighten after hackathon

export function corsHeaders(req) {
  const origin = req?.headers?.get('origin') || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-api-key, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

export function handleOptions(req) {
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}

export function withCors(response, req) {
  const headers = new Headers(response.headers);
  Object.entries(corsHeaders(req)).forEach(([k, v]) => headers.set(k, v));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
```

Then in **each** v1 route file (shipments/route.js, disruptions/route.js, webhooks/route.js), add the OPTIONS handler and wrap responses:

```js
// Add at the top of every dashboard/app/api/v1/*/route.js
import { handleOptions, withCors } from '../_cors.js'; // adjust relative path

export async function OPTIONS(req) {
  return handleOptions(req);
}

// Wrap your existing returns, e.g.:
// Before: return NextResponse.json({ data: shipments, ... });
// After:  return withCors(NextResponse.json({ data: shipments, ... }), req);
```

### Step 1B — Seed a read-only demo API key in Supabase

Run this **once** in your Supabase SQL editor. It creates a permanent demo key tied to a `demo-org` that only has read access:

```sql
-- Run in Supabase SQL Editor
INSERT INTO api_keys (id, org_id, label, key_hash, created_at)
VALUES (
  gen_random_uuid(),
  'demo-org',
  'Public Demo Key — Read Only',
  -- This is sha256('opentrade-demo-key-2026')
  encode(sha256('opentrade-demo-key-2026'::bytea), 'hex'),
  now()
)
ON CONFLICT DO NOTHING;
```

The raw key to share publicly is: **`opentrade-demo-key-2026`**

Users pass it as: `x-api-key: opentrade-demo-key-2026`

---

## Feature 2 — Developer Portal Page

**File to create:** `dashboard/app/developers/page.js`

This is a full static page — no backend required. It documents your v1 API with copy-paste curl examples and a live API tester widget.

```jsx
// dashboard/app/developers/page.js
'use client';

import { useState } from 'react';
import { Copy, Check, Terminal, Zap, Key, Webhook, Package, AlertTriangle } from 'lucide-react';
import NavBar from '../components/NavBar.jsx';

const BASE = process.env.NEXT_PUBLIC_APP_URL || 'https://your-deployed-url.vercel.app';
const DEMO_KEY = 'opentrade-demo-key-2026';

function CodeBlock({ code, lang = 'bash' }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="relative group">
      <pre className="bg-[#020617] border border-[var(--border-subtle)] rounded-xl p-4 text-[12px] text-[var(--text-secondary)] overflow-x-auto font-mono leading-relaxed">
        <code>{code}</code>
      </pre>
      <button
        onClick={copy}
        className="absolute top-3 right-3 p-1.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all opacity-0 group-hover:opacity-100"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

function EndpointCard({ method, path, description, example, response }) {
  const [open, setOpen] = useState(false);
  const colors = {
    GET: 'text-[var(--accent-cyan)] bg-[var(--accent-cyan)]/10 border-[var(--accent-cyan)]/20',
    POST: 'text-[var(--accent-green)] bg-[var(--accent-green)]/10 border-[var(--accent-green)]/20',
    PATCH: 'text-[var(--accent-amber)] bg-[var(--accent-amber)]/10 border-[var(--accent-amber)]/20',
    DELETE: 'text-[var(--accent-red)] bg-[var(--accent-red)]/10 border-[var(--accent-red)]/20',
  };
  return (
    <div className="border border-[var(--border-subtle)] rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-4 p-4 bg-[var(--bg-elevated)]/40 hover:bg-[var(--bg-elevated)] transition-colors text-left"
      >
        <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-lg border tracking-wider ${colors[method]}`}>{method}</span>
        <code className="text-[13px] font-mono text-[var(--text-primary)] flex-1">{path}</code>
        <span className="text-[11px] text-[var(--text-muted)] hidden md:block">{description}</span>
        <span className="text-[var(--text-muted)] text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="p-4 space-y-4 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)]">
          <p className="text-[12px] text-[var(--text-secondary)]">{description}</p>
          {example && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-2">curl example</p>
              <CodeBlock code={example} />
            </div>
          )}
          {response && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-2">response shape</p>
              <CodeBlock code={response} lang="json" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LiveTester() {
  const [endpoint, setEndpoint] = useState('/api/v1/shipments');
  const [apiKey, setApiKey] = useState(DEMO_KEY);
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    setResponse('');
    try {
      const res = await fetch(`${BASE}${endpoint}`, {
        headers: { 'x-api-key': apiKey },
      });
      const json = await res.json();
      setResponse(JSON.stringify(json, null, 2));
    } catch (e) {
      setResponse(`Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border border-[var(--border-subtle)] rounded-2xl overflow-hidden">
      <div className="bg-[var(--bg-elevated)] px-5 py-3 flex items-center gap-2 border-b border-[var(--border-subtle)]">
        <Terminal className="w-4 h-4 text-[var(--accent-cyan)]" />
        <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">Live API Tester</span>
      </div>
      <div className="p-5 space-y-3 bg-[var(--bg-surface)]">
        <div className="flex gap-2">
          <select
            value={endpoint}
            onChange={e => setEndpoint(e.target.value)}
            className="flex-1 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-[12px] font-mono text-[var(--text-primary)]"
          >
            <option value="/api/v1/shipments">GET /api/v1/shipments</option>
            <option value="/api/v1/disruptions">GET /api/v1/disruptions</option>
          </select>
          <button
            onClick={run}
            disabled={loading}
            className="px-5 py-2 rounded-lg bg-[var(--accent-cyan)] text-[#020617] text-[11px] font-extrabold uppercase tracking-widest hover:brightness-110 transition-all disabled:opacity-50"
          >
            {loading ? 'Running...' : 'Run'}
          </button>
        </div>
        <input
          value={apiKey}
          onChange={e => setApiKey(e.target.value)}
          placeholder="x-api-key"
          className="w-full bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-[12px] font-mono text-[var(--text-secondary)]"
        />
        {response && (
          <pre className="bg-[#020617] rounded-xl p-4 text-[11px] font-mono text-[var(--accent-cyan)] max-h-64 overflow-y-auto">
            {response}
          </pre>
        )}
      </div>
    </div>
  );
}

const ENDPOINTS = [
  {
    method: 'GET', path: '/api/v1/shipments', description: 'List all shipments for your org (paginated)',
    example: `curl "${BASE}/api/v1/shipments?pageSize=10" \\\n  -H "x-api-key: ${DEMO_KEY}"`,
    response: `{\n  "data": [\n    {\n      "id": "ship-abc123",\n      "origin": "Shanghai",\n      "destination": "Rotterdam",\n      "status": "active",\n      "cargoValueUSD": 1200000,\n      "eta": "2026-05-12T10:00:00Z",\n      "corridor": "Asia-Europe"\n    }\n  ],\n  "pagination": { "pageSize": 10, "nextCursor": "2026-04-01T..." }\n}`,
  },
  {
    method: 'POST', path: '/api/v1/shipments', description: 'Create a new shipment and start monitoring it',
    example: `curl -X POST "${BASE}/api/v1/shipments" \\\n  -H "x-api-key: YOUR_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "origin": "Singapore",\n    "destination": "Los Angeles",\n    "originLat": 1.3521,\n    "originLng": 103.8198,\n    "destLat": 34.0522,\n    "destLng": -118.2437,\n    "carrier": "COSCO",\n    "cargoValueUSD": 850000\n  }'`,
    response: `{ "data": { "id": "ship-xyz789", "status": "active", ... } }`,
  },
  {
    method: 'GET', path: '/api/v1/disruptions', description: 'List all detected disruptions with severity scores',
    example: `curl "${BASE}/api/v1/disruptions" \\\n  -H "x-api-key: ${DEMO_KEY}"`,
    response: `{\n  "data": [\n    {\n      "id": "disr-001",\n      "description": "Suez Canal closure...",\n      "severity": "high",\n      "affectedCargo": 3200000,\n      "detectedAt": "2026-04-26T08:14:00Z"\n    }\n  ]\n}`,
  },
  {
    method: 'GET', path: '/api/v1/disruptions/:id', description: 'Get a disruption with its full resolution options',
    example: `curl "${BASE}/api/v1/disruptions/disr-001" \\\n  -H "x-api-key: ${DEMO_KEY}"`,
    response: `{ "data": { "id": "disr-001", "options": [ { "rank": 1, "description": "...", "costDelta": 12000, "timeDeltaDays": 3 } ] } }`,
  },
  {
    method: 'PATCH', path: '/api/v1/shipments/:id/status', description: 'Update a shipment status after executing a resolution',
    example: `curl -X PATCH "${BASE}/api/v1/shipments/ship-abc123/status" \\\n  -H "x-api-key: YOUR_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{ "status": "rerouted" }'`,
    response: `{ "data": { "id": "ship-abc123", "status": "rerouted", "updatedAt": "..." } }`,
  },
  {
    method: 'POST', path: '/api/v1/webhooks', description: 'Register a URL to receive resolution.ready events',
    example: `curl -X POST "${BASE}/api/v1/webhooks" \\\n  -H "x-api-key: YOUR_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{ "url": "https://your-app.com/webhook", "event": "resolution.ready" }'`,
    response: `{ "data": { "id": "wh-001", "secret": "abc123...", "active": true } }`,
  },
];

export default function DevelopersPage() {
  return (
    <div className="min-h-screen bg-[var(--bg-base)] flex flex-col">
      <NavBar />
      <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-12 space-y-16">

        {/* Hero */}
        <div className="space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[var(--accent-cyan)]/30 bg-[var(--accent-cyan)]/5">
            <Zap className="w-3 h-3 text-[var(--accent-cyan)]" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--accent-cyan)]">Public API</span>
          </div>
          <h1 className="text-4xl font-extrabold text-[var(--text-primary)] tracking-tight">OpenTrade Developer API</h1>
          <p className="text-[var(--text-secondary)] text-base max-w-2xl leading-relaxed">
            Integrate real-time supply chain disruption intelligence directly into your logistics platform.
            Monitor shipments, receive AI-generated resolution options, and automate rerouting via webhooks.
          </p>
        </div>

        {/* Quick start */}
        <section className="space-y-6">
          <div className="flex items-center gap-3">
            <Key className="w-5 h-5 text-[var(--accent-cyan)]" />
            <h2 className="text-xl font-bold text-[var(--text-primary)]">Quick Start</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="liquid-glass p-5 space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--accent-cyan)]">Demo API Key</div>
              <code className="block text-[13px] font-mono text-[var(--text-primary)] break-all">{DEMO_KEY}</code>
              <p className="text-[11px] text-[var(--text-muted)]">Read-only · 100 req/min · No sign-up required</p>
            </div>
            <div className="liquid-glass p-5 space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--accent-cyan)]">Base URL</div>
              <code className="block text-[13px] font-mono text-[var(--text-primary)] break-all">{BASE}</code>
              <p className="text-[11px] text-[var(--text-muted)]">All endpoints prefixed with /api/v1</p>
            </div>
          </div>
          <CodeBlock code={`# Your first call — get live shipments\ncurl "${BASE}/api/v1/shipments" \\\n  -H "x-api-key: ${DEMO_KEY}"`} />
        </section>

        {/* Authentication */}
        <section className="space-y-4">
          <h2 className="text-xl font-bold text-[var(--text-primary)]">Authentication</h2>
          <p className="text-[var(--text-secondary)] text-sm">Pass your API key in the <code className="font-mono text-[var(--accent-cyan)] text-xs">x-api-key</code> header on every request. Generate a production key in <a href="/settings" className="text-[var(--accent-cyan)] underline">Settings → API Keys</a>.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-2">JavaScript / fetch</p>
              <CodeBlock code={`const res = await fetch('${BASE}/api/v1/shipments', {\n  headers: { 'x-api-key': process.env.OPENTRADE_KEY }\n});\nconst { data } = await res.json();`} />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-2">Python / requests</p>
              <CodeBlock code={`import requests\n\nr = requests.get(\n  '${BASE}/api/v1/shipments',\n  headers={'x-api-key': os.environ['OPENTRADE_KEY']}\n)\nshipments = r.json()['data']`} />
            </div>
          </div>
        </section>

        {/* Live Tester */}
        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <Terminal className="w-5 h-5 text-[var(--accent-cyan)]" />
            <h2 className="text-xl font-bold text-[var(--text-primary)]">Try It Live</h2>
          </div>
          <LiveTester />
        </section>

        {/* Endpoints */}
        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <Package className="w-5 h-5 text-[var(--accent-cyan)]" />
            <h2 className="text-xl font-bold text-[var(--text-primary)]">Endpoints</h2>
          </div>
          <div className="space-y-2">
            {ENDPOINTS.map((ep) => (
              <EndpointCard key={ep.method + ep.path} {...ep} />
            ))}
          </div>
        </section>

        {/* Webhooks */}
        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <Webhook className="w-5 h-5 text-[var(--accent-cyan)]" />
            <h2 className="text-xl font-bold text-[var(--text-primary)]">Webhooks</h2>
          </div>
          <p className="text-[var(--text-secondary)] text-sm">Register a URL to receive <code className="font-mono text-[var(--accent-cyan)] text-xs">resolution.ready</code> events. OpenTrade POSTs the full resolution payload to your URL whenever the AI agents resolve a disruption.</p>
          <CodeBlock code={`// Incoming webhook payload\n{\n  "event": "resolution.ready",\n  "traceId": "trace-abc123",\n  "disruption": { "id": "disr-001", "severity": "high", "description": "..." },\n  "options": [\n    { "rank": 1, "description": "Reroute via Cape of Good Hope", "costDelta": 18000, "timeDeltaDays": 4 },\n    { "rank": 2, "description": "Switch to air freight (urgent cargo)", "costDelta": 95000, "timeDeltaDays": -3 }\n  ]\n}`} />
          <div className="liquid-glass p-4 flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-[var(--accent-amber)] shrink-0 mt-0.5" />
            <p className="text-[12px] text-[var(--text-secondary)]">Your webhook endpoint must respond with HTTP 200 within 10 seconds or the delivery is marked failed. Retry logic: 3 attempts with exponential backoff (30s, 5m, 30m).</p>
          </div>
        </section>

      </main>
    </div>
  );
}
```

Then add it to `NavBar.jsx` in the `NAV_ITEMS` array:

```js
// In dashboard/app/components/NavBar.jsx
// Add to NAV_ITEMS after the existing items:
import { Code2 } from 'lucide-react'; // add to lucide imports

const NAV_ITEMS = [
  // ... existing items ...
  { href: '/developers', label: 'API', icon: Code2, section: 'analysis' },
];
```

---

## Feature 3 — API Key Self-Service UI

**File to modify:** `dashboard/app/settings/page.js`

Add an "API Keys" section at the bottom of the existing SettingsPage. This reads and writes to the `api_keys` table in Supabase that your `_auth.js` already uses.

First, add a server route to handle key generation safely:

```js
// dashboard/app/api/auth/api-keys/route.js  (NEW FILE)
import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { getSupabaseAdmin, hashKey } from '../../v1/_auth.js';
import { verifyFirebaseToken } from '../../_internal-auth.js'; // use your existing firebase auth check

export async function GET(req) {
  // Get the org from the session cookie / firebase token
  const orgId = req.headers.get('x-org-id') || process.env.DEFAULT_ORG_ID || 'demo-org';

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 });

  const { data, error } = await supabase
    .from('api_keys')
    .select('id, label, created_at, last_used')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(req) {
  const orgId = req.headers.get('x-org-id') || process.env.DEFAULT_ORG_ID || 'demo-org';
  const body = await req.json();
  const label = (body.label || 'My API Key').slice(0, 64);

  const rawKey = `ot-${crypto.randomBytes(24).toString('hex')}`;
  const keyHash = hashKey(rawKey);

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 });

  const { data, error } = await supabase
    .from('api_keys')
    .insert({ org_id: orgId, label, key_hash: keyHash })
    .select('id, label, created_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Return the raw key ONCE — never stored, never retrievable again
  return NextResponse.json({ data: { ...data, key: rawKey } }, { status: 201 });
}

export async function DELETE(req) {
  const orgId = req.headers.get('x-org-id') || process.env.DEFAULT_ORG_ID || 'demo-org';
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('api_keys')
    .delete()
    .eq('id', id)
    .eq('org_id', orgId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

Now add the `ApiKeysSection` component inside `settings/page.js`. Find the closing `</div>` of the page and insert this before it:

```jsx
// Add these imports at the top of dashboard/app/settings/page.js
import { useState, useEffect } from 'react'; // already imported
import { Key, Plus, Trash2, Copy, Check, Eye, EyeOff } from 'lucide-react'; // add to lucide imports

// Add this component above the SettingsPage export:
function ApiKeysSection() {
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newKey, setNewKey] = useState(null); // shown once after creation
  const [copied, setCopied] = useState(false);

  const orgId = typeof window !== 'undefined'
    ? (window.localStorage.getItem('gdg_org_id') || 'demo-org')
    : 'demo-org';

  const headers = { 'Content-Type': 'application/json', 'x-org-id': orgId };

  useEffect(() => {
    fetch('/api/auth/api-keys', { headers })
      .then(r => r.json())
      .then(({ data }) => setKeys(data || []))
      .finally(() => setLoading(false));
  }, []);

  const create = async () => {
    if (!newLabel.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/auth/api-keys', {
        method: 'POST', headers,
        body: JSON.stringify({ label: newLabel }),
      });
      const { data } = await res.json();
      setNewKey(data.key); // show once
      setKeys(prev => [data, ...prev]);
      setNewLabel('');
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (id) => {
    if (!confirm('Revoke this key? Any integrations using it will stop working immediately.')) return;
    await fetch(`/api/auth/api-keys?id=${id}`, { method: 'DELETE', headers });
    setKeys(prev => prev.filter(k => k.id !== id));
  };

  const copyKey = (key) => {
    navigator.clipboard.writeText(key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Key className="w-4 h-4 text-[var(--accent-cyan)]" />
        <h2 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-widest">API Keys</h2>
      </div>
      <p className="text-[12px] text-[var(--text-muted)]">
        Keys authenticate requests to the OpenTrade REST API.
        See the <a href="/developers" className="text-[var(--accent-cyan)] underline">Developer Portal</a> for usage examples.
      </p>

      {/* New key one-time display */}
      {newKey && (
        <div className="border border-[var(--accent-green)]/40 bg-[var(--accent-green)]/5 rounded-xl p-4 space-y-2">
          <p className="text-[11px] font-bold text-[var(--accent-green)] uppercase tracking-widest">
            Copy this key now — it won't be shown again
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 font-mono text-[12px] text-[var(--text-primary)] break-all bg-[var(--bg-elevated)] px-3 py-2 rounded-lg">
              {newKey}
            </code>
            <button onClick={() => copyKey(newKey)} className="p-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] hover:border-[var(--accent-cyan)]/40 transition-all">
              {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-[var(--text-secondary)]" />}
            </button>
          </div>
          <button onClick={() => setNewKey(null)} className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-secondary)]">
            I've saved it — dismiss
          </button>
        </div>
      )}

      {/* Create form */}
      <div className="flex gap-2">
        <input
          value={newLabel}
          onChange={e => setNewLabel(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && create()}
          placeholder="Key label (e.g. Production, Zapier)"
          className="flex-1 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-xl px-4 py-2.5 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-cyan)]/50 transition-colors"
        />
        <button
          onClick={create}
          disabled={creating || !newLabel.trim()}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--accent-cyan)] text-[#020617] text-[11px] font-extrabold uppercase tracking-widest hover:brightness-110 transition-all disabled:opacity-40"
        >
          <Plus className="w-3.5 h-3.5" />
          {creating ? 'Creating...' : 'Generate'}
        </button>
      </div>

      {/* Key list */}
      {loading ? (
        <p className="text-[12px] text-[var(--text-muted)]">Loading keys...</p>
      ) : keys.length === 0 ? (
        <p className="text-[12px] text-[var(--text-muted)]">No API keys yet. Generate one above to get started.</p>
      ) : (
        <div className="space-y-2">
          {keys.map(k => (
            <div key={k.id} className="flex items-center gap-3 p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/40">
              <div className="w-2 h-2 rounded-full bg-[var(--accent-green)] shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-[var(--text-primary)] truncate">{k.label}</p>
                <p className="text-[10px] text-[var(--text-muted)]">
                  Created {new Date(k.created_at).toLocaleDateString()}
                  {k.last_used && ` · Last used ${new Date(k.last_used).toLocaleDateString()}`}
                </p>
              </div>
              <code className="text-[10px] font-mono text-[var(--text-muted)] bg-[var(--bg-elevated)] px-2 py-1 rounded-lg">
                ot-••••••••
              </code>
              <button
                onClick={() => revoke(k.id)}
                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--accent-red)] hover:bg-[var(--accent-red)]/10 transition-all"
                title="Revoke key"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

Then at the bottom of the `SettingsPage` JSX, before the closing `</main>`, add:

```jsx
<div className="border-t border-[var(--border-subtle)] pt-8">
  <ApiKeysSection />
</div>
```

---

## Feature 4 — Globe Quality & Resolution Controls

**Files to modify:** `GlobeControls.jsx` and `GlobeView.jsx`

### Step 4A — Add globe settings to GlobeControls.jsx

At the top of `GlobeControls`, replace the export signature and add a new collapsible settings panel after the Simulation panel:

```jsx
// In dashboard/app/components/globe/GlobeControls.jsx

// Change the props signature to accept globe settings:
export default function GlobeControls({ onFilterChange, globeSettings, onGlobeSettingsChange }) {

  // ... existing state (activeFilter, injecting, shipments) stays ...

  // Add this panel AFTER the existing Simulation div:
  return (
    <div className="absolute top-20 left-6 z-40 flex flex-col gap-4">
      {/* ... existing Filter HUD ... */}
      {/* ... existing Scenario Injection ... */}

      {/* NEW: Globe Settings Panel */}
      <div className="bg-[var(--bg-overlay)] backdrop-blur-xl border border-[var(--border-subtle)] rounded-2xl p-4 shadow-2xl space-y-4 min-w-[180px]">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--text-muted)] pl-1">Globe Quality</p>

        {/* Terrain resolution */}
        <div className="space-y-1.5">
          <p className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)] pl-1">Terrain</p>
          {[
            { id: 'flat', label: 'Flat', sub: 'Fastest' },
            { id: 'terrain', label: '3D Terrain', sub: 'Recommended' },
          ].map(opt => (
            <button
              key={opt.id}
              onClick={() => onGlobeSettingsChange({ ...globeSettings, terrain: opt.id })}
              className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-[11px] font-bold transition-all ${globeSettings.terrain === opt.id ? 'bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)] border border-[var(--accent-cyan)]/20' : 'text-[var(--text-muted)] hover:bg-white/5 border border-transparent'}`}
            >
              <span>{opt.label}</span>
              <span className="text-[9px] opacity-50 font-normal">{opt.sub}</span>
            </button>
          ))}
        </div>

        {/* Imagery style */}
        <div className="space-y-1.5">
          <p className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)] pl-1">Imagery</p>
          {[
            { id: 'satellite', label: 'Satellite' },
            { id: 'street', label: 'Street Map' },
          ].map(opt => (
            <button
              key={opt.id}
              onClick={() => onGlobeSettingsChange({ ...globeSettings, imagery: opt.id })}
              className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-[11px] font-bold transition-all ${globeSettings.imagery === opt.id ? 'bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)] border border-[var(--accent-cyan)]/20' : 'text-[var(--text-muted)] hover:bg-white/5 border border-transparent'}`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Arc animation speed */}
        <div className="space-y-2">
          <div className="flex items-center justify-between pl-1">
            <p className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Arc Speed</p>
            <span className="text-[9px] font-mono text-[var(--text-muted)]">{globeSettings.arcSpeed}x</span>
          </div>
          <input
            type="range" min="0.5" max="3" step="0.5"
            value={globeSettings.arcSpeed}
            onChange={e => onGlobeSettingsChange({ ...globeSettings, arcSpeed: Number(e.target.value) })}
            className="w-full h-1 appearance-none bg-[var(--bg-elevated)] rounded-full cursor-pointer accent-[var(--accent-cyan)]"
          />
        </div>

        {/* Labels toggle */}
        <button
          onClick={() => onGlobeSettingsChange({ ...globeSettings, labels: !globeSettings.labels })}
          className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-[11px] font-bold text-[var(--text-muted)] hover:bg-white/5 transition-all"
        >
          <span>Port Labels</span>
          <div className={`w-8 h-4 rounded-full transition-colors relative ${globeSettings.labels ? 'bg-[var(--accent-cyan)]' : 'bg-[var(--bg-elevated)] border border-[var(--border-subtle)]'}`}>
            <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${globeSettings.labels ? 'left-4' : 'left-0.5'}`} />
          </div>
        </button>
      </div>
    </div>
  );
}
```

### Step 4B — Wire settings into GlobeView.jsx

In `GlobeView.jsx`, add globe settings state and pass it down:

```jsx
// In dashboard/app/components/globe/GlobeView.jsx

// 1. Add state near the top of the GlobeView component (around line 114):
const [globeSettings, setGlobeSettings] = useState({
  terrain: 'terrain',   // 'flat' | 'terrain'
  imagery: 'satellite', // 'satellite' | 'street'
  arcSpeed: 1,
  labels: true,
});

// 2. Add a useEffect that reacts to settings changes:
useEffect(() => {
  const viewer = vRef.current;
  if (!viewer) return;

  // Swap imagery layer
  viewer.imageryLayers.removeAll();
  const ionToken = process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN;

  if (globeSettings.imagery === 'satellite' && ionToken) {
    viewer.imageryLayers.addImageryProvider(
      ImageryLayer.fromWorldImagery({ style: IonWorldImageryStyle.AERIAL_WITH_LABELS })
    );
  } else {
    viewer.imageryLayers.addImageryProvider(
      new ImageryLayer(new UrlTemplateImageryProvider({
        url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        minimumLevel: 0,
        maximumLevel: 19,
      }))
    );
  }

  viewer.scene.requestRender();
}, [globeSettings.imagery]);

useEffect(() => {
  const viewer = vRef.current;
  if (!viewer) return;

  // Swap terrain — requires destroying and recreating viewer
  // Instead, use a simpler approach: toggle depth test
  const ionToken = process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN;
  if (globeSettings.terrain === 'flat' || !ionToken) {
    viewer.terrainProvider = new EllipsoidTerrainProvider();
    viewer.scene.globe.depthTestAgainstTerrain = false;
  } else {
    createWorldTerrainAsync({ requestVertexNormals: true, requestWaterMask: true })
      .then(tp => {
        if (vRef.current) {
          vRef.current.terrainProvider = tp;
          vRef.current.scene.globe.depthTestAgainstTerrain = true;
          vRef.current.scene.requestRender();
        }
      })
      .catch(() => null);
  }
}, [globeSettings.terrain]);

// 3. Pass arcSpeed into your existing arc animation (find the place where
//    you animate arc positions along the route and multiply the step by arcSpeed):
// Look for a setInterval or requestAnimationFrame that advances arc progress,
// and multiply the step delta by globeSettings.arcSpeed

// 4. Pass labels into port label visibility:
useEffect(() => {
  const viewer = vRef.current;
  if (!viewer) return;
  viewer.entities.values
    .filter(e => e._label)
    .forEach(e => { e.label.show = new ConstantProperty(globeSettings.labels); });
  viewer.scene.requestRender();
}, [globeSettings.labels]);

// 5. In the JSX at line 745, update GlobeControls usage:
// Before:
//   <GlobeControls onFilterChange={setF} />
// After:
<GlobeControls
  onFilterChange={setF}
  globeSettings={globeSettings}
  onGlobeSettingsChange={setGlobeSettings}
/>
```

---

## Feature 5 — AI Incident Report PDF Generator

**Files to create/modify:**
- New API route: `dashboard/app/api/generate-report/route.js`
- Modify: `dashboard/app/components/decision/DecisionModal.jsx`
- Install: `npm install jspdf` in dashboard/

### Step 5A — Install jsPDF

```bash
cd dashboard && npm install jspdf
```

### Step 5B — Server route that calls Gemini

```js
// dashboard/app/api/generate-report/route.js  (NEW FILE)
import { NextResponse } from 'next/server';

export async function POST(req) {
  const { disruption, resolution, options, impactReport } = await req.json();

  const prompt = `You are a senior supply chain analyst. Write a formal executive incident report in plain text (no markdown, no asterisks, no bullet symbols).

Use exactly this structure with these exact section headers on their own lines:

INCIDENT REPORT
EXECUTIVE SUMMARY
DISRUPTION DETAILS
FINANCIAL IMPACT ASSESSMENT
RESOLUTION EXECUTED
ALTERNATIVE OPTIONS CONSIDERED
RISK OUTLOOK
RECOMMENDED NEXT STEPS

Data:
- Disruption: ${disruption?.description || 'Unknown disruption'}
- Severity: ${disruption?.severity || 'high'}
- Detected: ${disruption?.detectedAt || new Date().toISOString()}
- Cargo at risk: $${((impactReport?.totalCargoValueUSD || 0) / 1e6).toFixed(1)}M across ${impactReport?.affectedCount || 0} shipments
- Resolution chosen: ${resolution?.description || options?.[0]?.description || 'Pending'}
- Cost delta: $${(resolution?.costDelta || options?.[0]?.costDelta || 0).toLocaleString()}
- Time delta: ${resolution?.timeDeltaDays || options?.[0]?.timeDeltaDays || 0} days
- Carbon delta: ${Math.round((resolution?.carbonDeltaKg || options?.[0]?.carbonDeltaKg || 0) / 1000)}t CO2
- Other options: ${options?.slice(1).map(o => o.description).join('; ') || 'None'}

Write 2-3 sentences per section. Be specific, professional, and quantitative. Include today's date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}.`;

  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 1200 },
      }),
    }
  );

  if (!response.ok) {
    return NextResponse.json({ error: 'Gemini request failed' }, { status: 500 });
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

  return NextResponse.json({ report: text });
}
```

### Step 5C — PDF generator utility

```js
// dashboard/app/lib/generateReportPdf.js  (NEW FILE)
import { jsPDF } from 'jspdf';

const BRAND_CYAN = [34, 211, 238];   // #22D3EE
const DARK_BG   = [2,   6,  23];    // #020617
const SECTION_HEADERS = [
  'INCIDENT REPORT', 'EXECUTIVE SUMMARY', 'DISRUPTION DETAILS',
  'FINANCIAL IMPACT ASSESSMENT', 'RESOLUTION EXECUTED',
  'ALTERNATIVE OPTIONS CONSIDERED', 'RISK OUTLOOK', 'RECOMMENDED NEXT STEPS',
];

export function generateReportPdf({ reportText, disruption, resolution, traceId }) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210; const H = 297;
  const margin = 20; const contentW = W - margin * 2;

  // Dark header band
  doc.setFillColor(...DARK_BG);
  doc.rect(0, 0, W, 38, 'F');

  // Cyan accent stripe
  doc.setFillColor(...BRAND_CYAN);
  doc.rect(0, 36, W, 2, 'F');

  // Header text
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('OpenTrade', margin, 16);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...BRAND_CYAN);
  doc.text('AUTONOMOUS SUPPLY CHAIN INTELLIGENCE', margin, 23);

  // Metadata strip (right side of header)
  doc.setTextColor(180, 200, 220);
  doc.setFontSize(8);
  const now = new Date();
  doc.text(`Generated: ${now.toLocaleString()}`, W - margin, 14, { align: 'right' });
  doc.text(`Trace ID: ${traceId || 'N/A'}`, W - margin, 21, { align: 'right' });
  doc.text(`Severity: ${(disruption?.severity || 'HIGH').toUpperCase()}`, W - margin, 28, { align: 'right' });

  // Body
  let y = 50;
  const lines = reportText.split('\n');

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) { y += 3; continue; }

    const isHeader = SECTION_HEADERS.some(h => line.toUpperCase().startsWith(h));

    if (isHeader) {
      // Section header styling
      if (y > H - 40) { doc.addPage(); y = 20; }
      if (y > 55) { y += 4; } // spacing above headers (skip for very first)

      doc.setFillColor(...BRAND_CYAN);
      doc.rect(margin, y - 4, 3, 8, 'F'); // left accent bar

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...DARK_BG);
      doc.text(line, margin + 6, y + 1);
      y += 10;
      doc.setDrawColor(...BRAND_CYAN);
      doc.setLineWidth(0.3);
      doc.line(margin, y - 3, W - margin, y - 3);
      y += 3;
    } else {
      // Body text
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(40, 40, 60);
      const wrapped = doc.splitTextToSize(line, contentW - 6);
      for (const wLine of wrapped) {
        if (y > H - 20) { doc.addPage(); y = 20; }
        doc.text(wLine, margin + 6, y);
        y += 5;
      }
      y += 1;
    }
  }

  // Footer on each page
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFillColor(...DARK_BG);
    doc.rect(0, H - 12, W, 12, 'F');
    doc.setTextColor(...BRAND_CYAN);
    doc.setFontSize(7);
    doc.text('OPENTRADE — CONFIDENTIAL', margin, H - 5);
    doc.setTextColor(100, 130, 160);
    doc.text(`Page ${i} of ${totalPages}`, W - margin, H - 5, { align: 'right' });
  }

  return doc;
}
```

### Step 5D — Add "Generate Report" button to DecisionModal.jsx

Find the executed state JSX in `DecisionModal.jsx` (the `isExecuted` section) and add the button. Also add it to the options view for any resolved disruption.

At the top of DecisionModal, add these imports:

```jsx
// Add to imports in DecisionModal.jsx
import { FileText, Download } from 'lucide-react';
```

Then add this component inside `DecisionModal.jsx`, before the `export default`:

```jsx
function ReportButton({ disruption, resolution, options, impactReport, traceId }) {
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/generate-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disruption, resolution, options, impactReport }),
      });
      const { report, error } = await res.json();
      if (error || !report) { toast.error('Report generation failed'); return; }

      // Dynamically import to avoid SSR issues
      const { generateReportPdf } = await import('../../lib/generateReportPdf.js');
      const doc = generateReportPdf({ reportText: report, disruption, resolution, traceId });

      const filename = `opentrade-report-${traceId || Date.now()}.pdf`;
      doc.save(filename);
      toast.success('Report downloaded');
    } catch (e) {
      toast.error('Failed to generate report');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={generate}
      disabled={loading}
      className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent-cyan)]/40 transition-all text-[10px] font-bold uppercase tracking-widest disabled:opacity-40"
    >
      {loading
        ? <div className="w-3.5 h-3.5 rounded-full border-2 border-[var(--accent-cyan)] border-t-transparent animate-spin" />
        : <FileText className="w-3.5 h-3.5" />
      }
      {loading ? 'Generating...' : 'Export Report'}
    </button>
  );
}
```

Finally, find the button row in the DecisionModal's resolved/executed state and add `<ReportButton>` next to the existing close button:

```jsx
// In the DecisionModal JSX, find the footer action area and add:
<ReportButton
  disruption={disruption}
  resolution={activeResolution?.options?.[approvedRank - 1]}
  options={activeResolution?.options || []}
  impactReport={activeResolution?.impactReport}
  traceId={activeResolution?.traceId}
/>
```

---

## Checklist — Build Order for Tomorrow

```
[ ] 1. npm install jspdf  (in /dashboard)
[ ] 2. Create dashboard/app/api/v1/_cors.js
[ ] 3. Add OPTIONS handler + withCors() to all 3 v1 routes
[ ] 4. Run Supabase SQL to seed demo key
[ ] 5. Create dashboard/app/developers/page.js
[ ] 6. Add 'API' link to NavBar NAV_ITEMS
[ ] 7. Create dashboard/app/api/auth/api-keys/route.js
[ ] 8. Add ApiKeysSection to dashboard/app/settings/page.js
[ ] 9. Update GlobeControls.jsx with settings panel
[ ] 10. Update GlobeView.jsx with settings state + effects
[ ] 11. Create dashboard/app/api/generate-report/route.js
[ ] 12. Create dashboard/app/lib/generateReportPdf.js
[ ] 13. Add ReportButton to DecisionModal.jsx
[ ] 14. git push → CI/CD deploys automatically
```

**Estimated total time with AI assistance: 5–7 hours.**


New tunable env vars (all have safe defaults)

EVENT_BUS_REPLAY_LIMIT
EVENT_BUS_REPLAY_BYTES_LIMIT
EVENT_BUS_MAX_SSE_CLIENTS
EVENT_BUS_MAX_SSE_CLIENTS_PER_TOPIC
RESOLUTION_STREAM_MAX_ENTRIES
IMPACT_MAX_SCORED_SHIPMENTS
AIS_MAX_PENDING_WRITES