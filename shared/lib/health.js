function toIsoOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function calculateHealthScore({ lastEventAt, pendingQueueDepth }) {
  let score = 100;

  if (Number.isFinite(pendingQueueDepth) && pendingQueueDepth > 0) {
    score -= Math.min(40, pendingQueueDepth * 5);
  }

  if (lastEventAt) {
    const lagMs = Date.now() - new Date(lastEventAt).getTime();
    if (Number.isFinite(lagMs) && lagMs > 0) {
      const lagPenalty = Math.min(20, Math.floor(lagMs / (10 * 60_000)) * 5);
      score -= lagPenalty;
    }
  }

  return Math.max(0, Math.min(100, score));
}

export function buildHealthPayload({ service, agent, startedAt, lastEventAt = null, pendingQueueDepth = 0, extra = {} }) {
  const normalizedLastEventAt = toIsoOrNull(lastEventAt);
  const uptime = Math.floor((Date.now() - startedAt) / 1000);

  return {
    status: 'ok',
    ...(service ? { service } : {}),
    ...(agent ? { agent } : {}),
    healthScore: calculateHealthScore({ lastEventAt: normalizedLastEventAt, pendingQueueDepth }),
    lastEventAt: normalizedLastEventAt,
    pendingQueueDepth,
    version: process.env.npm_package_version || process.env.SERVICE_VERSION || '1.0.0',
    uptime,
    ...extra,
  };
}