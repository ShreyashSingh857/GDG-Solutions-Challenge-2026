'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

const AGENTS = [
	{ name: 'Event Bus', url: process.env.NEXT_PUBLIC_EVENT_BUS_URL || 'http://localhost:4000', accent: '#22d3ee' },
	{ name: 'Disruption', url: process.env.NEXT_PUBLIC_DISRUPTION_AGENT_URL || 'http://localhost:3001', accent: '#f59e0b' },
	{ name: 'Impact', url: process.env.NEXT_PUBLIC_IMPACT_AGENT_URL || 'http://localhost:3002', accent: '#a78bfa' },
	{ name: 'Resolution', url: process.env.NEXT_PUBLIC_RESOLUTION_AGENT_URL || 'http://localhost:3003', accent: '#34d399' },
	{ name: 'News Intel', url: process.env.NEXT_PUBLIC_NEWS_AGENT_URL || 'http://localhost:3005', accent: '#fb7185' },
];

function readMetric(source, keys, fallback = 0) {
	for (const key of keys) {
		const value = source?.[key];
		if (Number.isFinite(Number(value))) return Number(value);
	}
	return fallback;
}

function formatNumber(value) {
	return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Number(value) || 0);
}

function MetricChip({ label, value, tone = 'slate' }) {
	const colorClasses = {
		cyan: 'border-[var(--accent-cyan)]/20 bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)]',
		amber: 'border-[var(--accent-amber)]/20 bg-[var(--accent-amber)]/10 text-[var(--accent-amber)]',
		rose: 'border-[var(--accent-red)]/20 bg-[var(--accent-red)]/10 text-[var(--accent-red)]',
		slate: 'border-[var(--border-default)] bg-[var(--bg-elevated)]/40 text-[var(--text-primary)]',
	};

	return (
		<div className={`rounded-xl border px-3 py-2 backdrop-blur ${colorClasses[tone] || colorClasses.slate}`}>
			<div className="text-[10px] uppercase tracking-[0.24em] text-[var(--text-secondary)] font-bold">{label}</div>
			<div className="mt-1 text-lg font-semibold leading-none text-[var(--text-primary)]">{value}</div>
		</div>
	);
}

export default function AgentHealthPanel({ floating = true }) {
	const [metrics, setMetrics] = useState([]);
	const [lastUpdated, setLastUpdated] = useState(null);
	const [loadState, setLoadState] = useState('loading');
	const [waking, setWaking] = useState({});

	useEffect(() => {
		AGENTS.forEach((agent) => {
			fetch(`${agent.url}/health`, { signal: AbortSignal.timeout(2500) }).catch(() => {});
		});
	}, []);

	useEffect(() => {
		let cancelled = false;

		async function poll() {
			const settled = await Promise.allSettled(
				AGENTS.map(async (agent) => {
					const response = await fetch(`${agent.url}/metrics`, { signal: AbortSignal.timeout(5000) });
					if (!response.ok) {
						throw new Error(`HTTP ${response.status}`);
					}
					const payload = await response.json();
					return { ...agent, payload, ok: true };
				})
			);

			if (cancelled) return;

			const nextMetrics = settled.map((result, index) => {
				if (result.status === 'fulfilled') {
					setWaking((prev) => ({ ...prev, [AGENTS[index].name]: false }));
					return result.value;
				}
				setWaking((prev) => ({ ...prev, [AGENTS[index].name]: true }));
				return { ...AGENTS[index], ok: false, error: result.reason?.message || 'unreachable', payload: {} };
			});

			setMetrics(nextMetrics);
			setLoadState(nextMetrics.some((item) => item.ok) ? 'ready' : 'offline');
			setLastUpdated(new Date());
		}

		poll().catch(() => {});
		const interval = setInterval(() => poll().catch(() => {}), 30_000);

		return () => {
			cancelled = true;
			clearInterval(interval);
		};
	}, []);

	const onlineCount = metrics.filter((item) => item.ok).length;
	const degradedCount = metrics.filter((item) => !item.ok).length;
	const totalErrors = metrics.reduce((sum, item) => sum + readMetric(item.payload, ['errors', 'errorCount', 'failures'], item.ok ? 0 : 1), 0);
	const meanLatency = metrics.length
		? Math.round(metrics.reduce((sum, item) => sum + readMetric(item.payload, ['avgLatencyMs', 'averageLatencyMs', 'latencyMs'], item.ok ? 0 : 5000), 0) / metrics.length)
		: 0;

	const containerClasses = floating 
		? "absolute top-5 left-5 right-5 z-20 pointer-events-none" 
		: "relative w-full";

	return (
		<AnimatePresence>
			<motion.section
				initial={{ opacity: 0, y: -14, scale: 0.98 }}
				animate={{ opacity: 1, y: 0, scale: 1 }}
				exit={{ opacity: 0, y: -10, scale: 0.98 }}
				transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
				className={containerClasses}
			>
				<div className={`mx-auto w-full max-w-6xl ${floating ? 'pointer-events-auto' : ''}`}>
					<div className="glass-panel glass-edge rounded-[30px] transition-all duration-500 shadow-2xl">
						<div className="relative px-5 py-4 sm:px-6 sm:py-5">
							<div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
								<div className="space-y-2">
									<div className="inline-flex items-center gap-2 rounded-full border border-[var(--accent-cyan)]/20 bg-[var(--accent-cyan)]/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.3em] text-[var(--accent-cyan)]">
										<span className={`h-2 w-2 rounded-full ${loadState === 'ready' ? 'bg-[var(--accent-green)] shadow-[0_0_14px_rgba(34,197,94,0.6)]' : 'bg-[var(--accent-amber)] shadow-[0_0_14px_rgba(245,158,11,0.6)]'}`} />
										Live telemetry
									</div>
									<div>
										<h2 className="text-xl font-bold tracking-[0.18em] text-[var(--text-primary)] sm:text-2xl font-display">
											Mission Control
										</h2>
										<p className="mt-1 max-w-2xl text-sm text-[var(--text-secondary)] font-medium">
											Rolling health from every service. Watch the stack breathe, degrade, and recover in real time.
										</p>
									</div>
								</div>

								<div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-muted)] font-bold">
									<div className="rounded-full border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-1.5 uppercase tracking-[0.22em]">
										{onlineCount}/{metrics.length || AGENTS.length} online
									</div>
									<div className="rounded-full border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-1.5 uppercase tracking-[0.22em]">
										{degradedCount} degraded
									</div>
									<div className="rounded-full border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-1.5 uppercase tracking-[0.22em]">
										{formatNumber(totalErrors)} errors
									</div>
									<div className="rounded-full border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-1.5 uppercase tracking-[0.22em]">
										{formatNumber(meanLatency)}ms avg latency
									</div>
									<div className="rounded-full border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-1.5 uppercase tracking-[0.22em]">
										{lastUpdated ? lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'waiting...'}
									</div>
								</div>
							</div>

							<div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
								{metrics.map((agent, index) => {
									const requestCount = readMetric(agent.payload, ['requests', 'requestCount', 'totalRequests'], agent.ok ? 1 : 0);
									const avgLatency = readMetric(agent.payload, ['avgLatencyMs', 'averageLatencyMs', 'latencyMs'], agent.ok ? 0 : 5000);
									const errorCount = readMetric(agent.payload, ['errors', 'errorCount', 'failures'], agent.ok ? 0 : 1);
									const uptime = readMetric(agent.payload, ['uptime', 'uptimeSeconds'], 0);
									const healthTone = agent.ok ? (errorCount > 0 ? 'amber' : 'cyan') : 'rose';

									return (
										<motion.div
											key={agent.name}
											initial={{ opacity: 0, y: 8 }}
											animate={{ opacity: 1, y: 0 }}
											transition={{ delay: index * 0.06, duration: 0.24 }}
											className="group rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)]/60 p-3 transition-all hover:border-[var(--accent-cyan)]/30 hover:bg-[var(--bg-elevated)] hover:shadow-lg"
										>
											<div className="flex items-start justify-between gap-3">
												<div>
													<div className="text-[10px] uppercase tracking-[0.28em] text-[var(--text-muted)] font-bold">Service</div>
													<div className="mt-1 text-sm font-bold text-[var(--text-primary)]">{agent.name}</div>
												</div>
												<div className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.22em] ${agent.ok ? 'border-[var(--accent-green)]/20 bg-[var(--accent-green)]/10 text-[var(--accent-green)]' : 'border-[var(--accent-red)]/20 bg-[var(--accent-red)]/10 text-[var(--accent-red)]'}`}>
													{agent.ok ? (errorCount > 0 ? 'Degraded' : 'Live') : 'Down'}
												</div>
											</div>

											<div className="mt-3 space-y-3">
												<div className="flex items-center justify-between text-[11px] text-[var(--text-muted)] font-medium">
													<span className="truncate max-w-[120px]">{agent.url.replace(/^https?:\/\//, '')}</span>
													<span className={`h-2 w-2 rounded-full ${agent.ok ? (errorCount > 0 ? 'bg-[var(--accent-amber)] shadow-[0_0_8px_var(--accent-amber)]' : 'bg-[var(--accent-green)] shadow-[0_0_8px_var(--accent-green)]') : 'bg-[var(--accent-red)] shadow-[0_0_8px_var(--accent-red)]'}`} />
												</div>

												{waking[agent.name] ? (
													<div className="rounded-lg border border-[var(--accent-amber)]/20 bg-[var(--accent-amber)]/10 px-3 py-2 text-[10px] font-bold text-[var(--accent-amber)] uppercase tracking-wider animate-pulse">
														Waking agent...
													</div>
												) : null}

												<div className="grid grid-cols-2 gap-2">
													<MetricChip label="Requests" value={formatNumber(requestCount)} tone={healthTone} />
													<MetricChip label="Latency" value={`${formatNumber(avgLatency)}ms`} tone={healthTone} />
													<MetricChip label="Errors" value={formatNumber(errorCount)} tone={healthTone} />
													<MetricChip label="Uptime" value={`${formatNumber(uptime)}s`} tone={healthTone} />
												</div>

												<div className="h-1.5 overflow-hidden rounded-full bg-[var(--bg-elevated)]">
													<div
														className="h-full rounded-full transition-all duration-1000"
														style={{
															width: agent.ok ? '100%' : '28%',
															background: agent.ok
																? `linear-gradient(90deg, ${agent.accent}, var(--text-primary))`
																: 'linear-gradient(90deg, var(--accent-red), rgba(244,63,94,0.28))',
															boxShadow: agent.ok ? `0 0 18px ${agent.accent}66` : '0 0 18px rgba(244,63,94,0.45)',
														}}
													/>
												</div>
											</div>
										</motion.div>
									);
								})}
							</div>
						</div>
					</div>
				</div>
			</motion.section>
		</AnimatePresence>
	);
}