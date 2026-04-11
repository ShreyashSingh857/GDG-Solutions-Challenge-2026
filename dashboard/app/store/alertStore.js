import { create } from 'zustand';

export const useAlertStore = create((set, get) => ({
	disruptions: [],
	activeDisruptionId: null,
	resolutionOptions: [],

	addDisruption: (disruption) =>
		set((state) => ({
			disruptions: [disruption, ...state.disruptions].slice(0, 50), // keep last 50
			activeDisruptionId: disruption.id || disruption.traceId,
		})),

	setResolutionOptions: (options) => set({ resolutionOptions: options }),

	clearActiveDisruption: () => set({ activeDisruptionId: null, resolutionOptions: [] }),

	getActiveDisruption: () => {
		const { disruptions, activeDisruptionId } = get();
		return disruptions.find((d) => (d.id || d.traceId) === activeDisruptionId) || null;
	},
}));
