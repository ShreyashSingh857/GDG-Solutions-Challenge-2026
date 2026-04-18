const PORTWATCH_BASE = 'https://portwatch.imf.org/api';

export async function fetchPortCongestion(locode) {
  const url = `${PORTWATCH_BASE}/port?portCode=${encodeURIComponent(locode)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`PortWatch HTTP ${res.status}`);
  const data = await res.json();

  return {
    locode,
    portName: data.portName || locode,
    congestionScore: Number(data.congestionIndex ?? 0),
    avgWaitHours: Number(data.averageWaitingTime ?? 0),
    vesselCount: Number(data.vesselCount ?? 0),
    throughput7d: Number(data.throughput7d ?? 0),
    updatedAt: data.lastUpdated || new Date().toISOString(),
  };
}

export async function detectPortCongestionEvents(locodes, thresholdHours = 48) {
  const results = await Promise.allSettled(locodes.map(fetchPortCongestion));
  return results
    .filter((r) => r.status === 'fulfilled')
    .map((r) => r.value)
    .filter((item) => item.avgWaitHours > thresholdHours);
}
