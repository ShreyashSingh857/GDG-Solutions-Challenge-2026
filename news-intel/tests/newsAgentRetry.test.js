import test from 'node:test';
import assert from 'node:assert/strict';

import { injectToDisruptionAgent } from '../agent/agent.js';

const originalFetch = globalThis.fetch;

test('injectToDisruptionAgent retries until the disruption agent accepts the event', async () => {
	let attempts = 0;
	globalThis.fetch = async () => {
		attempts += 1;
		if (attempts < 3) {
			return new Response(JSON.stringify({ error: 'temporarily unavailable' }), {
				status: 503,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		return new Response(JSON.stringify({ ok: true }), {
			status: 200,
			headers: { 'Content-Type': 'application/json' },
		});
	};

	try {
		const response = await injectToDisruptionAgent('Port strike alert', 'trace-123', 3, 0);
		assert.equal(attempts, 3);
		assert.equal(response.ok, true);
	} finally {
		globalThis.fetch = originalFetch;
	}
});
