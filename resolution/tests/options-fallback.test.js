import test from 'node:test';
import assert from 'node:assert/strict';

import { buildValidatedResolutionOptions } from '../api/options.service.js';

test('buildValidatedResolutionOptions returns safe fallbacks for empty responses', () => {
	const routes = {
		balanced: { title: 'Balanced Sea Route', mode: 'sea-freight', distanceKm: 1200, timeDeltaHours: 36 },
		fastest: { title: 'Fastest Air Route', mode: 'air-freight', distanceKm: 800, timeDeltaHours: 12 },
		cheapest: { title: 'Cheapest Sea Route', mode: 'sea-freight', distanceKm: 1500, timeDeltaHours: 48 },
	};

	const options = buildValidatedResolutionOptions({
		rawResponse: '',
		routes,
		balancedCost: { costDelta: 12500 },
		fastestCost: { costDelta: 28000 },
		cheapestCost: { costDelta: 9000 },
		seaSuppliers: [],
		airSuppliers: [],
		traceId: 'trace-123',
		impactReportId: 'impact-123',
		disruptionId: 'disruption-123',
	});

	assert.equal(options.length, 3);
	assert.deepEqual(options.map((option) => option.rank), [1, 2, 3]);
	assert.ok(options.every((option) => typeof option.supplierName === 'string' && option.supplierName.length > 0));
	assert.ok(options.every((option) => typeof option.supplierId === 'string' && option.supplierId.length > 0));
	assert.ok(options.every((option) => option.traceId === 'trace-123'));
	assert.ok(options.every((option) => option.impactReportId === 'impact-123'));
	assert.ok(options.every((option) => option.disruptionId === 'disruption-123'));
	assert.ok(options.every((option) => option.selected === false));
});