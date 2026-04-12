import 'dotenv/config';

const DISRUPTION_AGENT_URL = process.env.DISRUPTION_AGENT_URL || 'http://localhost:3001';
const SCENARIOS = ['pacific_storm', 'port_strike', 'suez_closure'];

async function main() {
	const scenarioName = process.argv[2];
	if (!scenarioName || !SCENARIOS.includes(scenarioName)) {
		console.error('Usage: node inject.js <scenario>');
		console.error(`Available scenarios: ${SCENARIOS.join(', ')}`);
		process.exit(1);
	}

	const module = await import(`./${scenarioName}.js`);
	const scenario = module[scenarioName];
	if (!scenario?.description) {
		console.error(`Scenario '${scenarioName}' does not export a valid { description } object`);
		process.exit(1);
	}

	const res = await fetch(`${DISRUPTION_AGENT_URL}/events`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ description: scenario.description }),
	});
	const result = await res.json();
	if (!res.ok) {
		console.error(`[Inject] ❌ Failed (HTTP ${res.status}):`, result.error);
		process.exit(1);
	}

	console.log('[Inject] ✅ Event injected successfully');
	console.log(`[Inject] Disruption ID: ${result.data?.id}`);
	console.log(`[Inject] TraceId: ${result.traceId}`);
	console.log(`[Inject] Published to event bus: ${result.published}`);
}

main();
