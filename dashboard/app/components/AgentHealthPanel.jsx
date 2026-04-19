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
		cyan: 'border-cyan-400/20 bg-cyan-400/10 text-cyan-100',
		amber: 'border-amber-400/20 bg-amber-400/10 text-amber-100',
		rose: 'border-rose-400/20 bg-rose-400/10 text-rose-100',
		slate: 'border-white/10 bg-white/5 text-white/80',
	};

	return (
		<div className={`rounded-xl border px-3 py-2 backdrop-blur ${colorClasses[tone] || colorClasses.slate}`}>
			<div className="text-[10px] uppercase tracking-[0.24em] opacity-70">{label}</div>
			<div className="mt-1 text-lg font-semibold leading-none">{value}</div>
		</div>
	);
}

export default function AgentHealthPanel() {
	const [metrics, setMetrics] = useState([]);
	const [lastUpdated, setLastUpdated] = useState(null);
	const [loadState, setLoadState] = useState('loading');

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
				if (result.status === 'fulfilled') return result.value;
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

	return (
		<AnimatePresence>
			<motion.section
				initial={{ opacity: 0, y: -14, scale: 0.98 }}
				animate={{ opacity: 1, y: 0, scale: 1 }}
				exit={{ opacity: 0, y: -10, scale: 0.98 }}
				transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
				className="absolute top-5 left-5 right-5 z-20 pointer-events-none"
			>
				<div className="mx-auto w-full max-w-6xl pointer-events-auto">
					<div className="relative overflow-hidden rounded-[30px] border border-white/10 bg-slate-950/88 shadow-[0_24px_90px_rgba(2,6,23,0.6)] backdrop-blur-2xl">
						<div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.14),transparent_28%),radial-gradient(circle_at_top_right,rgba(245,158,11,0.12),transparent_25%),linear-gradient(180deg,rgba(255,255,255,0.04),transparent_40%)]" />
						<div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-cyan-300/70 to-transparent" />
						<div className="absolute inset-y-0 left-0 w-px bg-linear-to-b from-cyan-300/0 via-cyan-300/45 to-cyan-300/0" />
						<div className="relative px-5 py-4 sm:px-6 sm:py-5">
							<div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
								<div className="space-y-2">
									<div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.3em] text-cyan-100">
										<span className={`h-2 w-2 rounded-full ${loadState === 'ready' ? 'bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.8)]' : 'bg-amber-400 shadow-[0_0_14px_rgba(251,191,36,0.75)]'}`} />
										Live telemetry
									</div>
									<div>
										<h2 className="text-xl font-semibold tracking-[0.18em] text-white sm:text-2xl">
											Mission Control
										</h2>
										<p className="mt-1 max-w-2xl text-sm text-white/58">
											Rolling health from every service. Watch the stack breathe, degrade, and recover in real time.
										</p>
									</div>
								</div>

								<div className="flex flex-wrap items-center gap-2 text-[11px] text-white/55">
									<div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 uppercase tracking-[0.22em]">
										{onlineCount}/{metrics.length || AGENTS.length} online
									</div>
									<div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 uppercase tracking-[0.22em]">
										{degradedCount} degraded
									</div>
									<div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 uppercase tracking-[0.22em]">
										{formatNumber(totalErrors)} errors
									</div>
									<div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 uppercase tracking-[0.22em]">
										{formatNumber(meanLatency)}ms avg latency
									</div>
									<div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 uppercase tracking-[0.22em]">
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
											className="group rounded-2xl border border-white/10 bg-white/[0.035] p-3 transition-colors hover:border-white/18 hover:bg-white/5.5"
										>
											<div className="flex items-start justify-between gap-3">
												<div>
													<div className="text-[10px] uppercase tracking-[0.28em] text-white/38">Service</div>
													<div className="mt-1 text-sm font-medium text-white">{agent.name}</div>
												</div>
												<div className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.22em] ${agent.ok ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100' : 'border-rose-400/20 bg-rose-400/10 text-rose-100'}`}>
													{agent.ok ? (errorCount > 0 ? 'Degraded' : 'Live') : 'Down'}
												</div>
											</div>

											<div className="mt-3 space-y-3">
												<div className="flex items-center justify-between text-[11px] text-white/50">
													<span>{agent.url.replace(/^https?:\/\//, '')}</span>
													<span className={`h-2 w-2 rounded-full ${agent.ok ? (errorCount > 0 ? 'bg-amber-400' : 'bg-emerald-400') : 'bg-rose-400'}`} />
												</div>

												<div className="grid grid-cols-2 gap-2">
													<MetricChip label="Requests" value={formatNumber(requestCount)} tone={healthTone} />
													<MetricChip label="Latency" value={`${formatNumber(avgLatency)}ms`} tone={healthTone} />
													<MetricChip label="Errors" value={formatNumber(errorCount)} tone={healthTone} />
													<MetricChip label="Uptime" value={`${formatNumber(uptime)}s`} tone={healthTone} />
												</div>

												<div className="h-1.5 overflow-hidden rounded-full bg-white/8">
													<div
														className="h-full rounded-full"
														style={{
															width: agent.ok ? '100%' : '28%',
															background: agent.ok
																? `linear-gradient(90deg, ${agent.accent}, rgba(255,255,255,0.88))`
																: 'linear-gradient(90deg, rgba(244,63,94,0.9), rgba(244,63,94,0.28))',
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