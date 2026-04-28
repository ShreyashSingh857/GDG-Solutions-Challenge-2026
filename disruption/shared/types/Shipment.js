/**
 * @typedef {object} Shipment
 */
export const Shipment = {
	example: {
		id: 'ship-uuid',
		origin: 'Shanghai',
		destination: 'Los Angeles',
		originLat: 31.2304,
		originLng: 121.4737,
		destLat: 33.7405,
		destLng: -118.2719,
		currentLat: 34.2,
		currentLng: 162.5,
		status: 'active',
		mode: 'sea-freight',
		carrier: 'Maersk',
		cargoValueUSD: 1850000,
		paymentAmountUSD: 640000,
		paymentStatus: 'partial',
		importExport: 'export',
		departureDate: '2026-04-08T10:30:00.000Z',
		trackingNumber: 'MAEU-839201',
		eta: '2026-04-28T16:00:00.000Z',
		corridor: 'Pacific',
	},
};
