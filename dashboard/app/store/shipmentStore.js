import { create } from 'zustand';

export const useShipmentStore = create((set, get) => ({
	shipments: [],
	isLoading: true,

	setShipments: (shipments) => set({ shipments, isLoading: false }),

	updateShipment: (updatedShipment) =>
		set((state) => ({
			shipments: state.shipments.map((s) =>
				s.id === updatedShipment.id ? { ...s, ...updatedShipment } : s
			),
		})),

	getShipmentById: (id) => get().shipments.find((s) => s.id === id) || null,

	getShipmentsByStatus: (status) => get().shipments.filter((s) => s.status === status),

	getShipmentsByCorridor: (corridor) => get().shipments.filter((s) => s.corridor === corridor),
}));
