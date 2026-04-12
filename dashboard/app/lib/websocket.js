/**
 * Agent status polling - polls each agent's /health endpoint every 3 seconds.
 * Returns a cleanup function. Calls onStatusChange with the active agent name.
 *
 * @param {function(string): void} onStatusChange - Called with agent name: 'idle' | 'monitor' | 'impact' | 'negotiator' | 'resolved'
 * @returns {function} cleanup - call this to stop polling
 */
export function connectAgentStatusPolling(onStatusChange) {
  const AGENT_URLS = {
    monitor: process.env.NEXT_PUBLIC_DISRUPTION_AGENT_URL || 'http://localhost:3001',
    impact: process.env.NEXT_PUBLIC_IMPACT_AGENT_URL || 'http://localhost:3002',
    negotiator: process.env.NEXT_PUBLIC_RESOLUTION_AGENT_URL || 'http://localhost:3003',
  };

  const ACTIVE_THRESHOLD_MS = 6000;
  let stopped = false;

  async function poll() {
    if (stopped) return;

    let detectedActive = 'idle';

    for (const [name, url] of Object.entries(AGENT_URLS)) {
      try {
        const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(2000) });
        if (!res.ok) continue;
        const data = await res.json();
        if (data.lastEventAt) {
          const age = Date.now() - new Date(data.lastEventAt).getTime();
          if (age < ACTIVE_THRESHOLD_MS) detectedActive = name;
        }
      } catch {
        // Agent offline or timed out; skip
      }
    }

    onStatusChange(detectedActive);
  }

  poll();
  const interval = setInterval(poll, 3000);

  return () => {
    stopped = true;
    clearInterval(interval);
  };
}
