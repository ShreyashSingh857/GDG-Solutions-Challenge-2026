const BASE_PREMIUM_RATE = 0.001;

const CORRIDOR_RISK_MULTIPLIER = {
	'Red Sea': 4.5,
	'Suez': 3.0,
	'Black Sea': 8.0,
	'Gulf of Aden': 5.0,
	'Pacific': 1.0,
	'Atlantic': 1.1,
	'Cape': 1.2,
};

export function estimateInsurancePremium(cargoValueUSD, corridorName) {
	const lower = String(corridorName || '').toLowerCase();
	const multiplier = Object.entries(CORRIDOR_RISK_MULTIPLIER)
		.find(([key]) => lower.includes(key.toLowerCase()))?.[1] || 1.0;

	const premiumUSD = Math.round(Number(cargoValueUSD || 0) * BASE_PREMIUM_RATE * multiplier);
	return {
		premiumUSD,
		annualRatePercent: Number((BASE_PREMIUM_RATE * multiplier * 100).toFixed(2)),
		corridorRisk: multiplier > 3 ? 'WAR_RISK' : multiplier > 1.5 ? 'ELEVATED' : 'STANDARD',
	};
}