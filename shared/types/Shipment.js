/**
 * @typedef {object} Shipment
 * @property {string} id - Firestore document ID (also used as traceId for idempotency)
 * @property {string} origin - Origin port name (e.g. 'Shanghai')
 * @property {string} destination - Destination port name (e.g. 'Los Angeles')
 * @property {number} originLat - Origin latitude
 * @property {number} originLng - Origin longitude
 * @property {number} destLat - Destination latitude
 * @property {number} destLng - Destination longitude
 * @property {number} currentLat - Current position latitude
 * @property {number} currentLng - Current position longitude
 * @property {'active'|'delayed'|'rerouted'|'disrupted'} status
 * @property {'sea'|'air'|'rail'|'road'} mode - Transport mode
 * @property {string} carrier - Carrier name
 * @property {number} cargoValueUSD - Cargo value in USD
 * @property {number} paymentAmountUSD - Payment amount in USD
 * @property {'pending'|'paid'|'failed'|'refunded'} paymentStatus - Payment settlement status
 * @property {'import'|'export'} importExport - Shipment direction
 * @property {string} departureDate - ISO 8601 departure timestamp
 * @property {string} trackingNumber - Carrier tracking identifier
 * @property {string} eta - ISO 8601 estimated time of arrival
 * @property {string} corridor - Shipping corridor (e.g. 'Pacific', 'Suez', 'Atlantic')
 */

/**
 * Validate a Shipment object.
 * Throws if required fields are missing.
 * @param {object} obj
 * @returns {Shipment}
 */
export function validateShipment(obj) {
	const required = ['id', 'origin', 'destination', 'originLat', 'originLng', 'destLat', 'destLng', 'currentLat', 'currentLng', 'status', 'mode', 'carrier', 'cargoValueUSD', 'paymentAmountUSD', 'paymentStatus', 'importExport', 'departureDate', 'trackingNumber', 'eta', 'corridor'];
	for (const field of required) {
		if (obj[field] === undefined || obj[field] === null) {
			throw new Error(`Shipment missing required field: ${field}`);
		}
	}
	return obj;
}
