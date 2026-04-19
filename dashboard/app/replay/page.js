'use client';

import { useEffect, useMemo, useState } from 'react';
import NavBar from '../components/NavBar.jsx';

const WINDOW_PRESETS = [
	{ label: '7D', days: 7 },
	{ label: '14D', days: 14 },
	{ label: '30D', days: 30 },
];

function formatRelativeDate(value) {
	if (!value) return 'Unknown';
	return new Intl.DateTimeFormat('en-US', {
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	}).format(new Date(value));
}

function severityLabel(severity) {
	if (severity >= 8) return 'Critical';
	if (severity >= 6) return 'High';
	if (severity >= 4) return 'Elevated';
	return 'Watch';
}

export default function ReplayPage() {
	const [daysBack, setDaysBack] = useState(14);
	const [events, setEvents] = useState([]);
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState(null);

	useEffect(() => {
		let cancelled = false;

		async function loadHistory() {
			setIsLoading(true);
			setError(null);

			const to = new Date();
			const from = new Date(to.getTime() - daysBack * 24 * 60 * 60 * 1000);
			const params = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });

			try {
				const response = await fetch(`/api/disruptions/history?${params.toString()}`, { cache: 'no-store' });
				const json = await response.json();
				if (!response.ok) throw new Error(json.error || `HTTP ${response.status}`);
				if (cancelled) return;
				const nextEvents = Array.isArray(json.data) ? json.data : [];
				setEvents(nextEvents);
				setSelectedIndex((current) => Math.min(current, Math.max(nextEvents.length - 1, 0)));
			} catch (err) {
				if (!cancelled) {
					setEvents([]);
					setSelectedIndex(0);
					setError(err.message);
				}
			} finally {
				if (!cancelled) setIsLoading(false);
			}
		}

		loadHistory();
		return () => {
			cancelled = true;
		};
	}, [daysBack]);

	const selected = events[selectedIndex] || null;
	const stats = useMemo(() => {
		const totalSeverity = events.reduce((sum, event) => sum + Number(event.severity || 0), 0);
		const criticalCount = events.filter((event) => Number(event.severity || 0) >= 8).length;
		const averageSeverity = events.length ? (totalSeverity / events.length).toFixed(1) : '0.0';
		return { totalSeverity, criticalCount, averageSeverity };
	}, [events]);

	return (
		<div className="flex flex-col h-screen bg-[#020617] text-white overflow-hidden">
			<NavBar />
			<div className="flex-1 overflow-y-auto custom-scrollbar">
				<div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
					<div className="relative overflow-hidden rounded-4xl border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.12),transparent_28%),radial-gradient(circle_at_top_right,rgba(251,191,36,0.08),transparent_24%),linear-gradient(180deg,rgba(15,23,42,0.98),rgba(2,6,23,0.98))] shadow-[0_24px_90px_rgba(2,6,23,0.65)]">
						<div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-cyan-300/70 to-transparent" />
						<div className="absolute inset-y-0 left-0 w-px bg-linear-to-b from-cyan-300/0 via-cyan-300/40 to-cyan-300/0" />
						<div className="relative p-5 sm:p-6 lg:p-8 space-y-6">
							<div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
								<div className="space-y-3 max-w-3xl">
									<div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.3em] text-cyan-100">
										<span className="h-2 w-2 rounded-full bg-cyan-300 shadow-[0_0_14px_rgba(34,211,238,0.9)]" />
										Replay Studio
									</div>
									<div>
										<h1 className="text-3xl font-semibold tracking-[0.18em] text-white sm:text-4xl">Historical Disruption Replay</h1>
										<p className="mt-2 max-w-2xl text-sm text-white/58 leading-relaxed">
											Scrub through recent events, inspect the severity arc, and revisit the raw disruption feed as it unfolded.
										</p>
									</div>
								</div>

								<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
									<div className="rounded-2xl border border-white/10 bg-white/4 px-4 py-3">
										<div className="text-[10px] uppercase tracking-[0.24em] text-white/35">Events</div>
										<div className="mt-1 text-2xl font-semibold text-white">{events.length}</div>
									</div>
									<div className="rounded-2xl border border-white/10 bg-white/4 px-4 py-3">
										<div className="text-[10px] uppercase tracking-[0.24em] text-white/35">Critical</div>
										<div className="mt-1 text-2xl font-semibold text-white">{stats.criticalCount}</div>
									</div>
									<div className="rounded-2xl border border-white/10 bg-white/4 px-4 py-3">
										<div className="text-[10px] uppercase tracking-[0.24em] text-white/35">Avg Severity</div>
										<div className="mt-1 text-2xl font-semibold text-white">{stats.averageSeverity}</div>
									</div>
									<div className="rounded-2xl border border-white/10 bg-white/4 px-4 py-3">
										<div className="text-[10px] uppercase tracking-[0.24em] text-white/35">Window</div>
										<div className="mt-1 text-2xl font-semibold text-white">{daysBack}d</div>
									</div>
								</div>
							</div>

							<div className="flex flex-wrap items-center gap-2">
								{WINDOW_PRESETS.map((preset) => (
									<button
										key={preset.days}
										onClick={() => setDaysBack(preset.days)}
										className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${daysBack === preset.days ? 'border-cyan-300/30 bg-cyan-300/15 text-cyan-100' : 'border-white/10 bg-white/5 text-white/55 hover:bg-white/10 hover:text-white'}`}
									>
										{preset.label}
									</button>
								))}
							</div>

							<div className="rounded-[28px] border border-white/10 bg-black/25 p-4 sm:p-5">
								<div className="flex items-center justify-between gap-4">
									<div>
										<div className="text-[10px] uppercase tracking-[0.26em] text-white/35">Timeline Scrub</div>
										<div className="mt-1 text-sm text-white/55">Use the slider to inspect each disruption in chronological order.</div>
									</div>
									<div className="text-xs text-white/45">
										{events.length ? `${selectedIndex + 1} / ${events.length}` : 'No events loaded'}
									</div>
								</div>
								<input
									type="range"
									min="0"
									max={Math.max(events.length - 1, 0)}
									value={selectedIndex}
									onChange={(event) => setSelectedIndex(Number(event.target.value))}
									disabled={!events.length || isLoading}
									className="mt-4 w-full accent-cyan-400"
								/>

								<div className="mt-4 flex gap-2 overflow-x-auto pb-1">
									{events.map((event, index) => (
										<button
											key={event.id}
											onClick={() => setSelectedIndex(index)}
												className={`min-w-42.5 rounded-2xl border px-4 py-3 text-left transition-all ${selectedIndex === index ? 'border-cyan-300/30 bg-cyan-300/12 shadow-[0_0_0_1px_rgba(34,211,238,0.12)]' : 'border-white/10 bg-white/3 hover:bg-white/6'}`}
										>
											<div className="text-[10px] uppercase tracking-[0.24em] text-white/35">{formatRelativeDate(event.detectedAt)}</div>
											<div className="mt-1 text-sm font-medium text-white">{event.location}</div>
											<div className="mt-2 text-xs text-white/45">{event.type} · Severity {event.severity}</div>
										</button>
									))}
								</div>
							</div>

							{error ? (
								<div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
									{error}
								</div>
							) : null}

							<div className="grid gap-4 lg:grid-cols-[1.4fr_0.9fr]">
								<div className="rounded-[28px] border border-white/10 bg-white/[0.035] p-5">
									{selected ? (
										<div className="space-y-5">
											<div className="flex flex-wrap items-start justify-between gap-4">
												<div>
													<div className="text-[10px] uppercase tracking-[0.24em] text-white/35">Selected Event</div>
													<h2 className="mt-2 text-2xl font-semibold text-white">{selected.location}</h2>
													<p className="mt-2 max-w-2xl text-sm text-white/60 leading-relaxed">{selected.rawDescription || 'No raw description available.'}</p>
												</div>
												<div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-right">
													<div className="text-[10px] uppercase tracking-[0.24em] text-white/35">Status</div>
													<div className="mt-1 text-lg font-semibold text-white">{severityLabel(selected.severity)}</div>
													<div className="mt-1 text-xs text-white/45">Confidence {Math.round((selected.confidence || 0) * 100)}%</div>
												</div>
											</div>

											<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
												<div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
													<div className="text-[10px] uppercase tracking-[0.24em] text-white/35">Type</div>
													<div className="mt-1 text-sm font-medium text-white">{selected.type}</div>
												</div>
												<div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
													<div className="text-[10px] uppercase tracking-[0.24em] text-white/35">Severity</div>
													<div className="mt-1 text-sm font-medium text-white">{selected.severity}</div>
												</div>
												<div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
													<div className="text-[10px] uppercase tracking-[0.24em] text-white/35">Detected</div>
													<div className="mt-1 text-sm font-medium text-white">{formatRelativeDate(selected.detectedAt)}</div>
												</div>
												<div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
													<div className="text-[10px] uppercase tracking-[0.24em] text-white/35">Coordinates</div>
													<div className="mt-1 text-sm font-medium text-white">{selected.epicenterLat ?? '—'}, {selected.epicenterLng ?? '—'}</div>
												</div>
											</div>

											<div className="rounded-2xl border border-white/10 bg-white/3 px-4 py-3">
												<div className="text-[10px] uppercase tracking-[0.24em] text-white/35">Affected Zones</div>
												<div className="mt-3 flex flex-wrap gap-2">
													{(selected.affectedZones || []).length ? (
														selected.affectedZones.map((zone) => (
															<span key={zone} className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs text-white/70">{zone}</span>
														))
													) : (
														<span className="text-sm text-white/40">No zones reported</span>
													)}
												</div>
											</div>
										</div>
									) : (
										<div className="flex min-h-80 items-center justify-center rounded-3xl border border-dashed border-white/10 bg-black/20 text-sm text-white/35">
											{isLoading ? 'Loading replay window...' : 'No disruptions found in the selected range.'}
										</div>
									)}
								</div>

								<div className="rounded-[28px] border border-white/10 bg-white/[0.035] p-5 space-y-4">
									<div>
										<div className="text-[10px] uppercase tracking-[0.24em] text-white/35">Replay Notes</div>
										<p className="mt-2 text-sm text-white/55 leading-relaxed">
											This view is optimized for quick incident review: select a disruption, inspect the severity context, and use the slider to step through the sequence.
										</p>
									</div>
									<div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/60 leading-relaxed">
										<p className="font-medium text-white">Selected event snapshot</p>
											<p className="mt-2">{selected ? `${selected.type} | ${selected.location} | ${selected.severity} severity` : 'Choose an event to reveal the snapshot.'}</p>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}