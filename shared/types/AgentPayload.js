import crypto from 'node:crypto';

/**
 * @typedef {object} AgentPayload
 * @property {string} agentId - Which agent sent this (e.g. 'monitor', 'impact', 'resolution')
 * @property {string} traceId - UUID used to correlate this event across all hops
 * @property {string} timestamp - ISO 8601 timestamp of when the payload was created
 * @property {object} payload - The actual data being passed (DisruptionEvent, ImpactReport, etc.)
 */

/**
 * Create a new AgentPayload envelope.
 * All messages published to the event bus must use this wrapper.
 * @param {string} agentId
 * @param {object} payload
 * @param {string} [traceId] - Provide to continue an existing trace chain; omit to start a new one
 * @returns {AgentPayload}
 */
export function createAgentPayload(agentId, payload, traceId = null) {
	return {
		agentId,
		traceId: traceId || crypto.randomUUID(),
		timestamp: new Date().toISOString(),
		payload,
	};
}

/**
 * Validate an AgentPayload object.
 * Throws if required fields are missing.
 * @param {object} obj
 * @returns {AgentPayload}
 */
export function validateAgentPayload(obj) {
	const required = ['agentId', 'traceId', 'timestamp', 'payload'];
	for (const field of required) {
		if (!obj[field]) throw new Error(`AgentPayload missing required field: ${field}`);
	}
	return obj;
}
