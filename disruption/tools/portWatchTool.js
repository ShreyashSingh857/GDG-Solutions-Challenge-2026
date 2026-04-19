const PORTWATCH_BASE = 'https://portwatch.imf.org/api';
const portCache = new Map();
const PORT_CACHE_TTL = 55 * 60_000;

export function resetPortCongestionCache() {
	portCache.clear();
}

export async function fetchPortCongestion(locode) {
	const cached = portCache.get(locode);
	if (cached && Date.now() < cached.expiresAt) {
		return cached.data;
	}

  const url = `${PORTWATCH_BASE}/port?portCode=${encodeURIComponent(locode)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`PortWatch HTTP ${res.status}`);
  const data = await res.json();

	const result = {
    locode,
    portName: data.portName || locode,
    congestionScore: Number(data.congestionIndex ?? 0),
    avgWaitHours: Number(data.averageWaitingTime ?? 0),
    vesselCount: Number(data.vesselCount ?? 0),
    throughput7d: Number(data.throughput7d ?? 0),
    updatedAt: data.lastUpdated || new Date().toISOString(),
  };
	portCache.set(locode, { data: result, expiresAt: Date.now() + PORT_CACHE_TTL });
	return result;
}

export async function detectPortCongestionEvents(locodes, thresholdHours = 48) {
  const results = await Promise.allSettled(locodes.map(fetchPortCongestion));
  return results
    .filter((r) => r.status === 'fulfilled')
    .map((r) => r.value)
    .filter((item) => item.avgWaitHours > thresholdHours);
}
