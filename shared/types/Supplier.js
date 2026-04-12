/**
 * @typedef {object} Supplier
 * @property {string} id - Firestore document ID
 * @property {string} name - Supplier company name
 * @property {string} region - Geographic region (e.g. 'Southeast Asia', 'Europe')
 * @property {string[]} capabilities - What the supplier can do (e.g. ['air-freight', 'refrigerated'])
 * @property {number} reliabilityScore - 0-100 score based on historical performance
 * @property {number} baseCostPerKm - Cost in USD per km
 * @property {string} contactEmail - Primary contact email
 */

/**
 * Validate a Supplier object.
 * Throws if required fields are missing.
 * @param {object} obj
 * @returns {Supplier}
 */
export function validateSupplier(obj) {
	const required = ['id', 'name', 'region', 'capabilities', 'reliabilityScore', 'baseCostPerKm'];
	for (const field of required) {
		if (obj[field] === undefined || obj[field] === null) {
			throw new Error(`Supplier missing required field: ${field}`);
		}
	}
	return obj;
}
