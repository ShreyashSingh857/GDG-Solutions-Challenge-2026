import test from 'node:test';
import assert from 'node:assert/strict';

import { fetchPortCongestion, resetPortCongestionCache } from '../tools/portWatchTool.js';

test('fetchPortCongestion caches results for repeated locode lookups', async () => {
	resetPortCongestionCache();
	const originalFetch = globalThis.fetch;
	let callCount = 0;

	globalThis.fetch = async () => {
		callCount += 1;
		return new Response(JSON.stringify({
			portName: 'Shanghai',
			congestionIndex: 91,
			averageWaitingTime: 72,
			vesselCount: 118,
			throughput7d: 900,
			lastUpdated: '2026-04-19T00:00:00Z',
		}), {
			status: 200,
			headers: { 'Content-Type': 'application/json' },
		});
	};

	try {
		const first = await fetchPortCongestion('CNSHA');
		const second = await fetchPortCongestion('CNSHA');

		assert.equal(callCount, 1);
		assert.deepEqual(first, second);
		assert.equal(first.locode, 'CNSHA');
		assert.equal(first.congestionScore, 91);
		assert.equal(first.avgWaitHours, 72);
	} finally {
		globalThis.fetch = originalFetch;
		resetPortCongestionCache();
	}
});
