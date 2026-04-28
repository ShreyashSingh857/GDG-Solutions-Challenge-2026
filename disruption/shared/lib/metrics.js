export function createMetrics(service) {
  const state = {
    service,
    requests: 0,
    errors: 0,
    processed: 0,
    avgLatencyMs: 0,
    lastRequestAt: null,
    lastProcessedAt: null,
  };

  function recordRequest(latencyMs, statusCode) {
    state.requests += 1;
    if (statusCode >= 500) state.errors += 1;
    state.lastRequestAt = new Date().toISOString();
    state.avgLatencyMs = Math.round(
      ((state.avgLatencyMs * (state.requests - 1)) + latencyMs) / state.requests
    );
  }

  function recordProcessed() {
    state.processed += 1;
    state.lastProcessedAt = new Date().toISOString();
  }

  function snapshot(extra = {}) {
    return { ...state, ...extra };
  }

  return { recordRequest, recordProcessed, snapshot };
}
