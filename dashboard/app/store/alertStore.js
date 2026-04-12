import { create } from 'zustand';

export const useAlertStore = create((set, get) => ({
	// Disruption events list
	disruptions: [],
	activeDisruptionId: null,

	// Resolution with options combined
	activeResolution: null,
	resolutionOptions: [],

	addDisruption: (disruption) =>
		set((state) => ({
			disruptions: [disruption, ...state.disruptions].slice(0, 50),
			activeDisruptionId: disruption.id || disruption.traceId,
		})),

	setResolutionWithOptions: (resolutionWithOptions) =>
		set({
			activeResolution: resolutionWithOptions,
			resolutionOptions: [resolutionWithOptions],
		}),

	setResolutionOptions: (options) => set({ resolutionOptions: options }),

	clearActiveDisruption: () => set({ activeDisruptionId: null, activeResolution: null }),

	setActiveDisruptionId: (id) => set({ activeDisruptionId: id }),

	markResolutionExecuted: (rank) =>
		set((state) => {
			if (!state.activeResolution) return {};
			return {
				activeResolution: {
					...state.activeResolution,
					status: 'resolved',
					selectedRank: rank,
					options: state.activeResolution.options.map((o) =>
						o.rank === rank ? { ...o, selected: true } : o
					),
				},
			};
		}),

	getActiveDisruption: () => {
		const { disruptions, activeDisruptionId } = get();
		return disruptions.find((d) => (d.id || d.traceId) === activeDisruptionId) || null;
	},
}));
