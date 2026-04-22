import assert from 'node:assert/strict';
import test from 'node:test';

const RUN_INTEGRATION = process.env.RUN_INTEGRATION_TESTS === '1';
const DISRUPTION_URL = process.env.DISRUPTION_AGENT_URL || 'http://localhost:3001';
const EVENT_BUS_URL = process.env.EVENT_BUS_URL || 'http://localhost:4000';
const DASHBOARD_URL = process.env.DASHBOARD_URL || 'http://localhost:3000';

async function waitFor(fn, { timeoutMs = 60_000, intervalMs = 2_000 } = {}) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const result = await fn();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return null;
}

async function isHealthy(baseUrl) {
  try {
    const response = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(5_000) });
    return response.ok;
  } catch {
    return false;
  }
}

test('critical pipeline: disruption -> impact -> resolution -> dashboard APIs', { timeout: 180_000 }, async (t) => {
  if (!RUN_INTEGRATION) {
    t.skip('Set RUN_INTEGRATION_TESTS=1 to run integration tests.');
    return;
  }

  const [disruptionHealthy, eventBusHealthy] = await Promise.all([
    isHealthy(DISRUPTION_URL),
    isHealthy(EVENT_BUS_URL),
  ]);

  if (!disruptionHealthy || !eventBusHealthy) {
    t.skip('Required services are not healthy.');
    return;
  }

  const traceId = `it-${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
  const injectResponse = await fetch(`${DISRUPTION_URL}/events`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.INTERNAL_TOKEN ? { Authorization: `Bearer ${process.env.INTERNAL_TOKEN}` } : {}),
    },
    body: JSON.stringify({
      traceId,
      description: 'Integration test disruption event near Suez canal with severe weather and shipping delays.',
    }),
    signal: AbortSignal.timeout(15_000),
  });

  assert.equal(injectResponse.status, 201, 'Disruption injection should return 201');

  const impactEvent = await waitFor(async () => {
    const response = await fetch(`${EVENT_BUS_URL}/replay/impact-reports`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;
    const payload = await response.json();
    const events = Array.isArray(payload?.events) ? payload.events : [];
    return events.find((entry) => entry?.payload?.traceId === traceId) || null;
  });

  assert.ok(impactEvent, 'Expected impact report event for injected traceId');

  const resolutionReady = await waitFor(async () => {
    const response = await fetch(`${DASHBOARD_URL}/api/resolutions?disruptionId=${encodeURIComponent(traceId)}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;
    const payload = await response.json();
    return payload?.data?.id ? payload.data : null;
  });

  assert.ok(resolutionReady, 'Expected resolution to appear in dashboard API');

  const disruptionsResponse = await fetch(`${DASHBOARD_URL}/api/disruptions`, {
    signal: AbortSignal.timeout(10_000),
  });
  assert.equal(disruptionsResponse.status, 200, 'Disruptions API should respond successfully');
  const disruptionsPayload = await disruptionsResponse.json();
  const disruptions = Array.isArray(disruptionsPayload?.data) ? disruptionsPayload.data : [];
  assert.ok(disruptions.some((item) => item?.id === traceId || item?.traceId === traceId), 'Injected disruption should be visible in dashboard disruptions API');

  const analyticsResponse = await fetch(`${DASHBOARD_URL}/api/analytics`, {
    signal: AbortSignal.timeout(10_000),
  });
  assert.equal(analyticsResponse.status, 200, 'Analytics API should respond successfully');
  const analyticsPayload = await analyticsResponse.json();
  assert.ok(analyticsPayload?.data, 'Analytics API should include data object');
  assert.ok(Array.isArray(analyticsPayload.data.disruptionsByDay), 'Analytics response should include disruptionsByDay series');
});