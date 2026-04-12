export function calculateCostDelta({ distanceKm, mode, baseCostUSD, cargoWeightTons = 10 }) {
	const RATES = { 'sea-freight': 0.15, 'air-freight': 2.50, rail: 0.45 };
	const FUEL_SURCHARGES = { 'sea-freight': 1.12, 'air-freight': 1.25, rail: 1.08 };
	const HANDLING_FEES = { 'sea-freight': 2500, 'air-freight': 8000, rail: 1500 };
	const ratePerKm = RATES[mode] || RATES['sea-freight']; const fuelMultiplier = FUEL_SURCHARGES[mode] || 1.1; const handlingFee = HANDLING_FEES[mode] || 2500;
	const weightSurcharge = mode === 'air-freight' ? Math.max(0, (cargoWeightTons - 5) * 500) : 0;
	const totalCostUSD = distanceKm * ratePerKm * fuelMultiplier + handlingFee + weightSurcharge;
	return { totalCostUSD: Math.round(totalCostUSD), costDelta: Math.round(totalCostUSD - baseCostUSD), breakdown: { distanceCost: Math.round(distanceKm * ratePerKm), fuelSurcharge: Math.round(distanceKm * ratePerKm * (fuelMultiplier - 1)), handlingFee, weightSurcharge } };
}
