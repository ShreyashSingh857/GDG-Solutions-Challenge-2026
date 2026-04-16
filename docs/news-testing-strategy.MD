# Testing Strategy

## 9.1 Manual Integration Tests (No Framework Needed)

```bash
# 1. Start all services (including news-intel)
cd news-intel && npm run dev

# 2. Health check
curl http://localhost:3005/health | jq
# Expected: { "status": "ok", "lastCycle": { "published": 0 } }

# 3. Trigger a manual poll cycle
curl -X POST http://localhost:3005/news/poll | jq
# Expected: { "data": { "fetched": N, "classified": M, "published": P } }

# 4. Verify alerts were persisted
curl http://localhost:3005/news | jq .count

# 5. Confirm pipeline was triggered on the Disruption Agent
curl http://localhost:3001/events | jq .
# Look for events where rawDescription starts with "[NEWS ALERT]"
```

## 9.2 Fixture-Based CI Testing

Inject a GDELT fixture via environment variable to make tests repeatable without live API calls. The gdeltFetcher checks GDELT_MOCK_FIXTURE before making a network call.

```js
// Add to the top of fetchGdeltArticles() in gdeltFetcher.js:
if (process.env.GDELT_MOCK_FIXTURE) {
  return JSON.parse(fs.readFileSync(process.env.GDELT_MOCK_FIXTURE, 'utf-8'));
}
```

```json
// news-intel/tests/fixtures/typhoon.json
[
  {
    "url": "https://example.com/typhoon-taiwan",
    "headline": "Typhoon Haikui forces closure of Kaohsiung Port",
    "source": "Reuters",
    "publishedAt": "2024-09-01T06:00:00Z",
    "lat": 22.6,
    "lng": 120.3,
    "apiSource": "gdelt"
  }
]
```

```bash
# Run the cycle with fixture + a real Gemini key
GDELT_MOCK_FIXTURE=./tests/fixtures/typhoon.json node -e
  "import('./agent/agent.js').then(m=>m.runPollCycle()).then(console.log)"
```

## 9.3 Observability Checklist

- [Logs] Every module uses a consistent [BracketedPrefix] in all console.log calls. Use grep "[NewsAgent]" to filter across all logs.
- [Health] GET /health on :3005 exposes lastCycle stats (fetched, classified, published, runAt). Wire this into your uptime monitor.
- [Firestore] Two new collections: news_alerts (readable by dashboard) and news_processed_urls (internal dedup, never exposed). Monitor their document counts in the Firebase console.
- [Pipeline Trace] Disruptions injected by the news agent have rawDescription starting with [NEWS ALERT]. This makes it trivial to query only news-triggered disruptions vs. CLI-injected ones.
- [Dedup Hit Rate] On a healthy 15-minute cycle, expect 0-5 novel articles after dedup. A spike to 50+ novel articles usually means the dedup store was reset (service restart) or a new time window opened.
