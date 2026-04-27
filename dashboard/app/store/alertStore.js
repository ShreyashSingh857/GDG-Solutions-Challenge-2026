import { create } from 'zustand';

export const useAlertStore = create((set, get) => ({
	// Disruption events list
	disruptions: [],
	activeDisruptionId: null,
	newsAlerts: [],

	// Resolution with options combined
	activeResolution: null,
	resolutionOptions: [],
	reroutedRoutes: new Map(),

	addDisruption: (disruption) =>
		set((state) => ({
			disruptions: [disruption, ...state.disruptions].slice(0, 50),
		})),

	addNewsAlert: (alert) =>
		set((state) => ({
			newsAlerts: [alert, ...state.newsAlerts]
				.filter((item, index, arr) => arr.findIndex((candidate) => candidate.id === item.id) === index)
				.slice(0, 30),
		})),

	setResolutionWithOptions: (resolutionWithOptions) =>
		set({
			activeResolution: {
				...resolutionWithOptions,
				options: resolutionWithOptions.options || [],
			},
			resolutionOptions: resolutionWithOptions.options || [],
		}),

	setResolutionOptions: (options) => set({ resolutionOptions: options }),

	clearActiveDisruption: () => set({ activeDisruptionId: null, activeResolution: null }),

	clearNewsAlerts: () => set({ newsAlerts: [] }),

	setActiveDisruptionId: (id) => set({ activeDisruptionId: id }),

	markResolutionExecuted: (rank) =>
		set((state) => {
			if (!state.activeResolution) return {};
			const selectedOption = state.activeResolution.options.find((o) => o.rank === rank);
			const nextReroutedRoutes = selectedOption?.route
				? (() => {
					const nextMap = new Map(state.reroutedRoutes);
					nextMap.set(state.activeResolution.disruptionId, {
						...selectedOption.route,
						transportMode:
							selectedOption.transportMode || selectedOption.route?.properties?.mode || 'sea-freight',
					});
					return nextMap;
				})()
				: state.reroutedRoutes;
			return {
				activeResolution: {
					...state.activeResolution,
					status: 'resolved',
					selectedRank: rank,
					options: state.activeResolution.options.map((o) =>
						o.rank === rank ? { ...o, selected: true } : o
					),
				},
				reroutedRoutes: nextReroutedRoutes,
			};
		}),

	getActiveDisruption: () => {
		const { disruptions, activeDisruptionId } = get();
		return disruptions.find((d) => (d.id || d.traceId) === activeDisruptionId) || null;
	},
}));
