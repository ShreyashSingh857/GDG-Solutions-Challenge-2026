export function normalizeDisruption(raw) {
  return {
    id: raw.id,
    type: raw.type || raw.disruptionType || 'OTHER',
    severity: Number(raw.severity ?? raw.severityScore ?? 0),
    detectedAt: raw.detected_at || raw.detectedAt || raw.receivedAt,
    cascadeRisk: raw.cascade_risk || raw.cascadeRisk,
    totalCargoAtRiskUSD: raw.total_cargo_at_risk_usd ?? raw.totalCargoAtRiskUSD ?? 0,
  };
}