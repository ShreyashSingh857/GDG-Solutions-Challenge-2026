'use client';

import { useMemo, useState } from 'react';
import { Copy, Check, Terminal, Zap, Key, Webhook, Package, AlertTriangle } from 'lucide-react';
import NavBar from '../components/NavBar.jsx';

const FALLBACK_BASE = 'https://your-deployed-url.vercel.app';
const DEMO_KEY = 'opentrade-demo-key-2026';

function CodeBlock({ code }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="relative group">
      <pre className="bg-[#020617] border border-[var(--border-subtle)] rounded-xl p-4 text-[12px] text-[var(--text-secondary)] overflow-x-auto font-mono leading-relaxed">
        <code>{code}</code>
      </pre>
      <button
        onClick={copy}
        className="absolute top-3 right-3 p-1.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all opacity-0 group-hover:opacity-100"
        aria-label="Copy code"
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
        onClick={() => setOpen((value) => !value)}
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
              <CodeBlock code={response} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LiveTester({ baseUrl }) {
  const [endpoint, setEndpoint] = useState('/api/v1/shipments');
  const [apiKey, setApiKey] = useState(DEMO_KEY);
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    setResponse('');
    try {
      const target = baseUrl ? `${baseUrl}${endpoint}` : endpoint;
      const res = await fetch(target, {
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
            onChange={(e) => setEndpoint(e.target.value)}
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
          onChange={(e) => setApiKey(e.target.value)}
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

export default function DevelopersPage() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || FALLBACK_BASE;

  const ENDPOINTS = useMemo(() => ([
    {
      method: 'GET', path: '/api/v1/shipments', description: 'List all shipments for your org (paginated)',
      example: `curl "${baseUrl}/api/v1/shipments?pageSize=10" \\\n  -H "x-api-key: ${DEMO_KEY}"`,
      response: `{
  "data": [
    {
      "id": "ship-abc123",
      "origin": "Shanghai",
      "destination": "Rotterdam",
      "status": "active",
      "cargoValueUSD": 1200000,
      "eta": "2026-05-12T10:00:00Z",
      "corridor": "Asia-Europe"
    }
  ],
  "pagination": { "pageSize": 10, "nextCursor": "2026-04-01T..." }
}`,
    },
    {
      method: 'POST', path: '/api/v1/shipments', description: 'Create a new shipment and start monitoring it',
      example: `curl -X POST "${baseUrl}/api/v1/shipments" \\\n  -H "x-api-key: YOUR_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{
    "origin": "Singapore",
    "destination": "Los Angeles",
    "originLat": 1.3521,
    "originLng": 103.8198,
    "destLat": 34.0522,
    "destLng": -118.2437,
    "carrier": "COSCO",
    "cargoValueUSD": 850000
  }'`,
      response: `{ "data": { "id": "ship-xyz789", "status": "active" } }`,
    },
    {
      method: 'GET', path: '/api/v1/disruptions', description: 'List all detected disruptions with severity scores',
      example: `curl "${baseUrl}/api/v1/disruptions" \\\n  -H "x-api-key: ${DEMO_KEY}"`,
      response: `{
  "data": [
    {
      "id": "disr-001",
      "description": "Suez Canal closure...",
      "severity": "high",
      "affectedCargo": 3200000,
      "detectedAt": "2026-04-26T08:14:00Z"
    }
  ]
}`,
    },
    {
      method: 'GET', path: '/api/v1/disruptions/:id', description: 'Get a disruption with its full resolution options',
      example: `curl "${baseUrl}/api/v1/disruptions/disr-001" \\\n  -H "x-api-key: ${DEMO_KEY}"`,
      response: `{ "data": { "id": "disr-001", "options": [ { "rank": 1, "description": "...", "costDelta": 12000, "timeDeltaDays": 3 } ] } }`,
    },
    {
      method: 'PATCH', path: '/api/v1/shipments/:id/status', description: 'Update a shipment status after executing a resolution',
      example: `curl -X PATCH "${baseUrl}/api/v1/shipments/ship-abc123/status" \\\n  -H "x-api-key: YOUR_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{ "status": "rerouted" }'`,
      response: `{ "data": { "id": "ship-abc123", "status": "rerouted", "updatedAt": "..." } }`,
    },
    {
      method: 'POST', path: '/api/v1/webhooks', description: 'Register a URL to receive resolution.ready events',
      example: `curl -X POST "${baseUrl}/api/v1/webhooks" \\\n  -H "x-api-key: YOUR_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{ "url": "https://your-app.com/webhook", "event": "resolution.ready" }'`,
      response: `{ "data": { "id": "wh-001", "secret": "abc123...", "active": true } }`,
    },
  ]), [baseUrl]);

  return (
    <div className="min-h-screen bg-[var(--bg-base)] flex flex-col">
      <NavBar />
      <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-12 space-y-16">
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
              <code className="block text-[13px] font-mono text-[var(--text-primary)] break-all">{baseUrl}</code>
              <p className="text-[11px] text-[var(--text-muted)]">All endpoints prefixed with /api/v1</p>
            </div>
          </div>
          <CodeBlock code={`# Your first call — get live shipments\ncurl "${baseUrl}/api/v1/shipments" \\\n  -H "x-api-key: ${DEMO_KEY}"`} />
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-bold text-[var(--text-primary)]">Authentication</h2>
          <p className="text-[var(--text-secondary)] text-sm">Pass your API key in the <span className="font-mono text-[var(--accent-cyan)] text-xs">x-api-key</span> header on every request. Generate a production key in <a href="/settings" className="text-[var(--accent-cyan)] underline">Settings → API Keys</a>.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-2">JavaScript / fetch</p>
              <CodeBlock code={`const res = await fetch('${baseUrl}/api/v1/shipments', {\n  headers: { 'x-api-key': process.env.OPENTRADE_KEY }\n});\nconst { data } = await res.json();`} />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-2">Python / requests</p>
              <CodeBlock code={`import os\nimport requests\n\nr = requests.get(\n  '${baseUrl}/api/v1/shipments',\n  headers={'x-api-key': os.environ['OPENTRADE_KEY']}\n)\nshipments = r.json()['data']`} />
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <Terminal className="w-5 h-5 text-[var(--accent-cyan)]" />
            <h2 className="text-xl font-bold text-[var(--text-primary)]">Try It Live</h2>
          </div>
          <LiveTester baseUrl={baseUrl} />
        </section>

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

        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <Webhook className="w-5 h-5 text-[var(--accent-cyan)]" />
            <h2 className="text-xl font-bold text-[var(--text-primary)]">Webhooks</h2>
          </div>
          <p className="text-[var(--text-secondary)] text-sm">Register a URL to receive <span className="font-mono text-[var(--accent-cyan)] text-xs">resolution.ready</span> events. OpenTrade POSTs the full resolution payload to your URL whenever AI agents resolve a disruption.</p>
          <CodeBlock code={`// Incoming webhook payload\n{\n  "event": "resolution.ready",\n  "traceId": "trace-abc123",\n  "disruption": { "id": "disr-001", "severity": "high", "description": "..." },\n  "options": [\n    { "rank": 1, "description": "Reroute via Cape of Good Hope", "costDelta": 18000, "timeDeltaDays": 4 },\n    { "rank": 2, "description": "Switch to air freight (urgent cargo)", "costDelta": 95000, "timeDeltaDays": -3 }\n  ]\n}`} />
          <div className="liquid-glass p-4 flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-[var(--accent-amber)] shrink-0 mt-0.5" />
            <p className="text-[12px] text-[var(--text-secondary)]">Your webhook endpoint must respond with HTTP 200 within 10 seconds or delivery is marked failed. Retry logic uses exponential backoff.</p>
          </div>
        </section>
      </main>
    </div>
  );
}
