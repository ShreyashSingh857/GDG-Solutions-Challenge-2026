import { v4 as uuidv4 } from 'uuid';

export function createImpactReport(fields) {
	return {
		id: `impact-${uuidv4()}`,
		createdAt: new Date().toISOString(),
		affectedShipments: [],
		cascadeRisk: 'LOW',
		urgency: 1,
		totalCargoAtRiskUSD: 0,
		analysisText: '',
		disruptionType: 'OTHER',
		disruptionLocation: 'Unknown',
		affectedZones: [],
		...fields,
	};
}

export function validateImpactReport(obj) {
	const required = ['id','disruptionId','traceId','affectedShipments','cascadeRisk','urgency','totalCargoAtRiskUSD','analysisText'];
	for (const field of required) if (obj[field] === undefined || obj[field] === null) throw new Error(`ImpactReport missing required field: ${field}`);
	const validRisks = ['LOW','MEDIUM','HIGH','CRITICAL'];
	if (!validRisks.includes(obj.cascadeRisk)) throw new Error(`cascadeRisk must be one of: ${validRisks.join(', ')}`);
	return obj;
}
