const SANCTIONED_CORRIDORS = [
	'iran',
	'north korea',
	'russia',
	'crimea',
	'belarus',
	'myanmar',
	'cuba',
	'venezuela',
];

export function isSanctionedCorridor(corridorName) {
	const lower = String(corridorName || '').toLowerCase();
	return SANCTIONED_CORRIDORS.some((term) => lower.includes(term));
}

export function buildSanctionsWarning(...segments) {
	const corridorText = segments.filter(Boolean).join(' ');
	const match = SANCTIONED_CORRIDORS.find((term) => corridorText.toLowerCase().includes(term));
	if (!match) return null;
	return `Compliance review required: route references the sanctioned corridor term "${match}".`;
}