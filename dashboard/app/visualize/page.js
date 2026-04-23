'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
	Activity,
	ArrowDown,
	ArrowRight,
	Clock3,
	LoaderCircle,
	ShieldAlert,
	ShieldCheck,
	TerminalSquare,
} from 'lucide-react';
import NavBar from '../components/NavBar.jsx';

const AGENT_METRICS = [
	{
		id: 'news',
		label: 'News Intel',
		url: process.env.NEXT_PUBLIC_NEWS_AGENT_URL || 'http://localhost:3005',
		nodeColor: '#7dd3fc',
	},
	{
		id: 'monitor',
		label: 'Monitor',
		url: process.env.NEXT_PUBLIC_DISRUPTION_AGENT_URL || 'http://localhost:3001',
		nodeColor: '#f59e0b',
	},
	{
		id: 'impact',
		label: 'Impact',
		url: process.env.NEXT_PUBLIC_IMPACT_AGENT_URL || 'http://localhost:3002',
		nodeColor: '#22c55e',
	},
	{
		id: 'resolution',
		label: 'Resolution',
		url: process.env.NEXT_PUBLIC_RESOLUTION_AGENT_URL || 'http://localhost:3003',
		nodeColor: '#38bdf8',
	},
];

const PIPELINE_NODES = [
	{ id: 'news', label: 'News Intel' },
	{ id: 'monitor', label: 'Monitor' },
	{ id: 'impact', label: 'Impact' },
	{ id: 'resolution', label: 'Resolution' },
	{ id: 'execute', label: 'Execute' },
];

const AGENT_TABS = [
	{ id: 'monitor', label: 'Monitor' },
	{ id: 'impact', label: 'Impact' },
	{ id: 'resolution', label: 'Resolution' },
];

const STATUS_STYLE = {
	idle: {
		chip: 'border-white/15 bg-white/[0.05] text-white/70',
		dot: 'bg-white/35',
		label: 'Idle',
	},
	processing: {
		chip: 'border-amber-300/35 bg-amber-400/10 text-amber-200',
		dot: 'bg-amber-300 shadow-[0_0_12px_rgba(251,191,36,0.9)]',
		label: 'Processing',
	},
	done: {
		chip: 'border-emerald-300/35 bg-emerald-400/10 text-emerald-200',
		dot: 'bg-emerald-300 shadow-[0_0_12px_rgba(74,222,128,0.9)]',
		label: 'Done',
	},
	error: {
		chip: 'border-rose-300/35 bg-rose-400/10 text-rose-200',
		dot: 'bg-rose-300 shadow-[0_0_12px_rgba(251,113,133,0.9)]',
		label: 'Error',
	},
};

const INITIAL_COUNT = {
	news: 0,
	monitor: 0,
	impact: 0,
	resolution: 0,
	execute: 0,
};

const INITIAL_HEARTBEAT = {
	news: [],
	monitor: [],
	impact: [],
	resolution: [],
	execute: [],
};

function formatTime(value) {
	if (!value) return '--';
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) return '--';
	return parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatAgo(value) {
	if (!value) return 'waiting';
	const parsed = new Date(value).getTime();
	if (!Number.isFinite(parsed)) return 'waiting';
	const delta = Math.max(0, Math.floor((Date.now() - parsed) / 1000));
	if (delta < 60) return `${delta}s ago`;
	if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
	return `${Math.floor(delta / 3600)}h ago`;
}

function formatMoney(value) {
	return new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		maximumFractionDigits: 0,
	}).format(Number(value || 0));
}

function prettyJson(value) {
	if (value === undefined || value === null) return '{}';
	if (typeof value !== 'string') return JSON.stringify(value, null, 2);
	try {
		return JSON.stringify(JSON.parse(value), null, 2);
	} catch {
		return value;
	}
}

function statusFromMetric(metric) {
	if (!metric?.ok) return 'error';
	const stamp = metric.eventStamp;
	if (!stamp) return 'idle';
	const ageMs = Date.now() - new Date(stamp).getTime();
	if (!Number.isFinite(ageMs) || ageMs < 0) return 'idle';
	if (ageMs < 15000) return 'processing';
	if (ageMs < 20 * 60_000) return 'done';
	return 'idle';
}

function computeHeartbeat(metric) {
	if (!metric?.ok) return 4;
	const latency = Number(metric.payload?.avgLatencyMs || metric.payload?.averageLatencyMs || 0);
	const isRunning = Boolean(metric.payload?.lastCycle?.isRunning);
	const base = 96 - Math.min(80, Math.max(0, latency / 25));
	return Math.max(12, Math.round(isRunning ? base + 8 : base));
}

function HeartbeatLine({ points, color }) {
	if (!points?.length) {
		return <div className="h-8 rounded-lg border border-white/10 bg-white/[0.03]" />;
	}

	const width = 132;
	const height = 28;
	const max = Math.max(...points, 1);
	const min = Math.min(...points, 0);
	const range = Math.max(1, max - min);

	const path = points
		.map((point, index) => {
			const x = (index / Math.max(1, points.length - 1)) * (width - 2) + 1;
			const normalized = (point - min) / range;
			const y = height - normalized * (height - 6) - 3;
			return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
		})
		.join(' ');

	return (
		<svg viewBox={`0 0 ${width} ${height}`} className="h-8 w-full rounded-lg border border-white/10 bg-white/[0.03] px-1">
			<path d={path} stroke={color} strokeWidth="2" fill="none" strokeLinecap="round" />
		</svg>
	);
}

function PipelineCard({ node, status, lastProcessed, eventsCount, heartbeat }) {
	const style = STATUS_STYLE[status] || STATUS_STYLE.idle;

	return (
		<div className="min-w-[220px] rounded-2xl border border-white/12 bg-[#081224]/85 p-4 shadow-[0_12px_30px_rgba(2,6,23,0.45)] backdrop-blur-xl">
			<div className="flex items-start justify-between gap-3">
				<div>
					<div className="text-[10px] uppercase tracking-[0.24em] text-white/45">Node</div>
					<div className="mt-1 text-sm font-semibold text-white">{node.label}</div>
				</div>
				<span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] ${style.chip}`}>
					<span className={`h-2 w-2 rounded-full ${style.dot}`} />
					{style.label}
				</span>
			</div>

			<div className="mt-4 grid grid-cols-2 gap-2 text-xs">
				<div className="rounded-xl border border-white/10 bg-white/[0.02] px-2.5 py-2">
					<div className="text-[10px] uppercase tracking-[0.18em] text-white/40">Last</div>
					<div className="mt-1 text-white/90">{formatTime(lastProcessed)}</div>
					<div className="text-[10px] text-white/40">{formatAgo(lastProcessed)}</div>
				</div>
				<div className="rounded-xl border border-white/10 bg-white/[0.02] px-2.5 py-2">
					<div className="text-[10px] uppercase tracking-[0.18em] text-white/40">Events</div>
					<div className="mt-1 text-lg font-semibold text-cyan-200">{eventsCount}</div>
				</div>
			</div>

			<div className="mt-3">
				<HeartbeatLine points={heartbeat} color={node.nodeColor || '#38bdf8'} />
			</div>
		</div>
	);
}

function Panel({ title, right, children }) {
	return (
		<div className="rounded-2xl border border-white/10 bg-[#07101e]/90 shadow-[0_12px_30px_rgba(2,6,23,0.4)]">
			<div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
				<div className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">{title}</div>
				{right}
			</div>
			<div className="p-4">{children}</div>
		</div>
	);
}

export default function VisualizePage() {
	const [metricsByNode, setMetricsByNode] = useState({});
	const [timeline, setTimeline] = useState([]);
	const [timelineLoading, setTimelineLoading] = useState(true);
	const [selectedTraceId, setSelectedTraceId] = useState(null);
	const [traceDetails, setTraceDetails] = useState(null);
	const [traceLoading, setTraceLoading] = useState(false);
	const [activeTab, setActiveTab] = useState('resolution');
	const [eventCounts, setEventCounts] = useState(INITIAL_COUNT);
	const [heartbeatByNode, setHeartbeatByNode] = useState(INITIAL_HEARTBEAT);
	const [resolutionStreamText, setResolutionStreamText] = useState('');
	const [displayStreamText, setDisplayStreamText] = useState('');

	const seenEventByNodeRef = useRef({});
	const lastTraceForStreamRef = useRef(null);
	const streamLengthRef = useRef(0);

	const pushHeartbeat = useCallback((nodeId, value) => {
		setHeartbeatByNode((prev) => ({
			...prev,
			[nodeId]: [...(prev[nodeId] || []).slice(-27), value],
		}));
	}, []);

	const pollMetrics = useCallback(async () => {
		const settled = await Promise.allSettled(
			AGENT_METRICS.map(async (agent) => {
				const res = await fetch(`${agent.url}/metrics`, {
					cache: 'no-store',
					signal: AbortSignal.timeout(5000),
				});
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				const payload = await res.json();
				const eventStamp = agent.id === 'news' ? payload?.lastCycle?.runAt || null : payload?.lastEventAt || null;
				return { ...agent, ok: true, payload, eventStamp };
			})
		);

		const nextMetrics = {};
		const increments = {};
		const heartbeatUpdates = [];

		settled.forEach((result, index) => {
			const agent = AGENT_METRICS[index];
			const metric =
				result.status === 'fulfilled'
					? result.value
					: { ...agent, ok: false, payload: {}, eventStamp: null, error: result.reason?.message || 'offline' };

			nextMetrics[agent.id] = metric;
			heartbeatUpdates.push({ id: agent.id, value: computeHeartbeat(metric) });

			if (metric.eventStamp && seenEventByNodeRef.current[agent.id] !== metric.eventStamp) {
				seenEventByNodeRef.current[agent.id] = metric.eventStamp;
				increments[agent.id] = (increments[agent.id] || 0) + 1;
			}
		});

		setMetricsByNode(nextMetrics);
		heartbeatUpdates.forEach((entry) => pushHeartbeat(entry.id, entry.value));

		if (Object.keys(increments).length) {
			setEventCounts((prev) => {
				const next = { ...prev };
				Object.entries(increments).forEach(([key, value]) => {
					next[key] = (next[key] || 0) + value;
				});
				return next;
			});
		}
	}, [pushHeartbeat]);

	const loadTimeline = useCallback(async () => {
		try {
			const res = await fetch('/api/visualize/timeline?limit=18', { cache: 'no-store' });
			const json = await res.json();
			const rows = Array.isArray(json.data) ? json.data : [];
			setTimeline(rows);

			const latestResolved = rows.find((item) => item.resolvedAt)?.resolvedAt || null;
			if (latestResolved && seenEventByNodeRef.current.execute !== latestResolved) {
				seenEventByNodeRef.current.execute = latestResolved;
				setEventCounts((prev) => ({ ...prev, execute: prev.execute + 1 }));
			}

			setSelectedTraceId((prev) => {
				if (!rows.length) return null;
				if (!prev) return rows[0].traceId;
				return rows.some((item) => item.traceId === prev) ? prev : rows[0].traceId;
			});
		} catch {
			setTimeline([]);
		} finally {
			setTimelineLoading(false);
		}
	}, []);

	useEffect(() => {
		pollMetrics().catch(() => {});
		const interval = setInterval(() => pollMetrics().catch(() => {}), 6000);
		return () => clearInterval(interval);
	}, [pollMetrics]);

	useEffect(() => {
		loadTimeline().catch(() => {});
		const interval = setInterval(() => loadTimeline().catch(() => {}), 9000);
		return () => clearInterval(interval);
	}, [loadTimeline]);

	useEffect(() => {
		if (!selectedTraceId) {
			setTraceDetails(null);
			return;
		}

		let cancelled = false;
		const loadTrace = async () => {
			setTraceLoading(true);
			try {
				const res = await fetch(`/api/visualize/trace/${encodeURIComponent(selectedTraceId)}`, { cache: 'no-store' });
				const json = await res.json();
				if (cancelled) return;
				setTraceDetails(json.data || null);
			} catch {
				if (!cancelled) setTraceDetails(null);
			} finally {
				if (!cancelled) setTraceLoading(false);
			}
		};

		loadTrace().catch(() => {});
		const interval = setInterval(() => loadTrace().catch(() => {}), 7000);
		return () => {
			cancelled = true;
			clearInterval(interval);
		};
	}, [selectedTraceId]);

	useEffect(() => {
		const currentTraceId = traceDetails?.traceId;
		if (!currentTraceId) return;
		if (lastTraceForStreamRef.current === currentTraceId) return;
		lastTraceForStreamRef.current = currentTraceId;
		const seed = traceDetails?.tabs?.resolution?.streamOutput || '';
		setResolutionStreamText(seed);
		streamLengthRef.current = seed.length;
	}, [traceDetails]);

	useEffect(() => {
		if (!selectedTraceId || !traceDetails?.resolution) return;
		const createdAtMs = new Date(traceDetails.resolution.createdAt || 0).getTime();
		const isRecent = Number.isFinite(createdAtMs) && Date.now() - createdAtMs < 6 * 60_000;
		const shouldConnect = traceDetails.resolution.status === 'pending' || isRecent;
		if (!shouldConnect) return;

		const es = new EventSource(`/api/stream/${encodeURIComponent(selectedTraceId)}`);
		es.onmessage = (event) => {
			try {
				const payload = JSON.parse(event.data || '{}');
				const chunk = typeof payload.chunk === 'string' ? payload.chunk : '';
				const total = Number(payload.total || 0);

				if (!chunk && !payload.done) return;
				if (total && total <= streamLengthRef.current && !payload.done) return;

				if (chunk) {
					setResolutionStreamText((prev) => {
						const next = `${prev}${chunk}`;
						streamLengthRef.current = next.length;
						return next;
					});
				}

				if (payload.done) {
					es.close();
				}
			} catch {
				// ignore malformed chunks
			}
		};
		es.onerror = () => {
			es.close();
		};

		return () => es.close();
	}, [selectedTraceId, traceDetails]);

	const executeStatus = useMemo(() => {
		if (!selectedTraceId || !traceDetails?.resolution) return 'idle';
		if (traceDetails.resolution.status === 'resolved') return 'done';
		if (traceDetails.resolution.status === 'pending') return 'processing';
		if (traceDetails.resolution.status === 'failed') return 'error';
		return 'idle';
	}, [selectedTraceId, traceDetails]);

	useEffect(() => {
		const heartbeatValue =
			executeStatus === 'done' ? 96 : executeStatus === 'processing' ? 70 : executeStatus === 'error' ? 8 : 30;
		pushHeartbeat('execute', heartbeatValue);
	}, [executeStatus, pushHeartbeat]);

	const activeTabPayload = traceDetails?.tabs?.[activeTab] || null;

	useEffect(() => {
		if (!activeTabPayload) {
			setDisplayStreamText('');
			return;
		}

		if (activeTab === 'resolution') {
			setDisplayStreamText(resolutionStreamText);
			return;
		}

		const sourceText = activeTabPayload.streamOutput || '';
		if (!sourceText) {
			setDisplayStreamText('');
			return;
		}

		let cursor = 0;
		setDisplayStreamText('');
		const interval = setInterval(() => {
			cursor = Math.min(sourceText.length, cursor + 40);
			setDisplayStreamText(sourceText.slice(0, cursor));
			if (cursor >= sourceText.length) {
				clearInterval(interval);
			}
		}, 22);

		return () => clearInterval(interval);
	}, [activeTab, activeTabPayload, resolutionStreamText]);

	const pipelineCards = useMemo(() => {
		return PIPELINE_NODES.map((node) => {
			if (node.id === 'execute') {
				return {
					...node,
					status: executeStatus,
					lastProcessed: traceDetails?.resolution?.resolvedAt || traceDetails?.resolution?.createdAt || null,
					eventsCount: eventCounts.execute,
					heartbeat: heartbeatByNode.execute,
					nodeColor: '#f97316',
				};
			}

			const metric = metricsByNode[node.id] || null;
			return {
				...node,
				status: statusFromMetric(metric),
				lastProcessed: metric?.eventStamp || null,
				eventsCount: eventCounts[node.id] || 0,
				heartbeat: heartbeatByNode[node.id] || [],
				nodeColor: AGENT_METRICS.find((agent) => agent.id === node.id)?.nodeColor || '#38bdf8',
			};
		});
	}, [executeStatus, traceDetails, eventCounts, heartbeatByNode, metricsByNode]);

	const validation = normalizeValidation(activeTabPayload?.validationStatus);
	const finalJsonText = prettyJson(activeTabPayload?.finalJson || {});
	const promptText = activeTabPayload?.systemPrompt || '';
	const inputPayloadText = prettyJson(activeTabPayload?.inputPayload || '{}');

	const selectedTimelineItem = timeline.find((item) => item.traceId === selectedTraceId) || timeline[0] || null;

	return (
		<div className="flex h-screen flex-col bg-[#040812] text-white">
			<NavBar />
			<main className="flex-1 overflow-y-auto bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.12),transparent_42%),radial-gradient(circle_at_top_left,rgba(245,158,11,0.10),transparent_35%),#040812]">
				<div className="mx-auto w-full max-w-[1480px] px-4 pb-8 pt-4 sm:px-6 lg:px-8">
					<section className="sticky top-0 z-20 rounded-3xl border border-white/12 bg-[#060d1c]/90 p-4 shadow-[0_18px_40px_rgba(2,6,23,0.6)] backdrop-blur-xl">
						<div className="mb-4 flex flex-wrap items-center justify-between gap-3">
							<div>
								<div className="text-[10px] uppercase tracking-[0.26em] text-cyan-200/80">Pipeline Flow</div>
								<div className="mt-1 text-lg font-semibold text-white">News Intel to Execute</div>
							</div>
							<div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-cyan-100">
								<Activity className="h-3.5 w-3.5" />
								Live
							</div>
						</div>

						<div className="flex flex-col gap-3 xl:flex-row xl:items-stretch">
							{pipelineCards.map((node, index) => (
								<Fragment key={node.id}>
									<PipelineCard
										node={node}
										status={node.status}
										lastProcessed={node.lastProcessed}
										eventsCount={node.eventsCount}
										heartbeat={node.heartbeat}
									/>
									{index < pipelineCards.length - 1 ? (
										<div className="flex items-center justify-center text-cyan-100/60 xl:px-1">
											<ArrowDown className="h-4 w-4 xl:hidden" />
											<ArrowRight className="hidden h-4 w-4 xl:block" />
										</div>
									) : null}
								</Fragment>
							))}
						</div>
					</section>

					<section className="mt-4 rounded-3xl border border-white/12 bg-[#050c1b]/92 p-4 shadow-[0_18px_44px_rgba(2,6,23,0.55)] backdrop-blur-xl">
						<div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
							<div>
								<div className="text-[10px] uppercase tracking-[0.24em] text-cyan-200/80">Live Reasoning</div>
								<div className="mt-1 text-lg font-semibold text-white">Trace {selectedTraceId ? `#${selectedTraceId.slice(-8)}` : '--'}</div>
							</div>
							<div className="flex flex-wrap gap-2">
								{AGENT_TABS.map((tab) => (
									<button
										key={tab.id}
										onClick={() => setActiveTab(tab.id)}
										className={[
											'rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] transition-colors',
											activeTab === tab.id
												? 'border-cyan-300/40 bg-cyan-300/15 text-cyan-100'
												: 'border-white/15 bg-white/[0.04] text-white/65 hover:text-white/85',
										].join(' ')}
									>
										{tab.label}
									</button>
								))}
							</div>
						</div>

						{traceLoading && !traceDetails ? (
							<div className="flex items-center justify-center py-14 text-sm text-white/60">
								<LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
								Loading trace...
							</div>
						) : traceDetails ? (
							<div className="mt-4 grid gap-4 xl:grid-cols-2">
								<Panel title="System Prompt">
									<pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-[#040914] p-3 font-mono text-[11px] leading-relaxed text-cyan-50/85 custom-scrollbar">
										{promptText || 'No prompt snapshot.'}
									</pre>
								</Panel>

								<Panel title="Input Payload">
									<pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-[#040914] p-3 font-mono text-[11px] leading-relaxed text-white/80 custom-scrollbar">
										{inputPayloadText}
									</pre>
								</Panel>

								<Panel
									title="Live Stream Output"
									right={
										activeTab === 'resolution' && executeStatus === 'processing' ? (
											<span className="inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.18em] text-amber-200">
												<LoaderCircle className="h-3.5 w-3.5 animate-spin" />
												Streaming
											</span>
										) : null
									}
								>
									<pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-[#040914] p-3 font-mono text-[11px] leading-relaxed text-emerald-100/90 custom-scrollbar">
										{displayStreamText || 'No stream output.'}
										{activeTab === 'resolution' && executeStatus === 'processing' ? (
											<span className="ml-1 inline-block h-3 w-1.5 animate-pulse bg-emerald-300/90 align-middle" />
										) : null}
									</pre>
								</Panel>

								<Panel
									title="Final Parsed JSON"
									right={
										validation.valid ? (
											<span className="inline-flex items-center gap-1 rounded-full border border-emerald-300/30 bg-emerald-400/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-200">
												<ShieldCheck className="h-3.5 w-3.5" />
												Pass
											</span>
										) : (
											<span className="inline-flex items-center gap-1 rounded-full border border-rose-300/30 bg-rose-400/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-rose-200">
												<ShieldAlert className="h-3.5 w-3.5" />
												Fail
											</span>
										)
									}
								>
									{!validation.valid && validation.errors.length ? (
										<div className="mb-2 rounded-xl border border-rose-300/25 bg-rose-400/10 px-3 py-2 text-xs text-rose-100">
											{validation.errors[0]}
										</div>
									) : null}
									<pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-[#040914] p-3 font-mono text-[11px] leading-relaxed text-blue-100/90 custom-scrollbar">
										{finalJsonText}
									</pre>
								</Panel>
							</div>
						) : (
							<div className="flex items-center justify-center py-16 text-sm text-white/55">
								<TerminalSquare className="mr-2 h-4 w-4" />
								Select a disruption from the timeline.
							</div>
						)}
					</section>

					<section className="mt-4 rounded-3xl border border-white/12 bg-[#050c1b]/92 p-4 shadow-[0_18px_44px_rgba(2,6,23,0.55)] backdrop-blur-xl">
						<div className="mb-3 flex flex-wrap items-center justify-between gap-3">
							<div>
								<div className="text-[10px] uppercase tracking-[0.24em] text-cyan-200/80">Disruption Timeline</div>
								<div className="mt-1 text-lg font-semibold text-white">Last {timeline.length} traces</div>
							</div>
							{selectedTimelineItem ? (
								<div className="rounded-full border border-white/12 bg-white/[0.03] px-3 py-1 text-xs text-white/75">
									{selectedTimelineItem.disruption?.type || 'UNKNOWN'} - {selectedTimelineItem.disruption?.location || 'Unknown'}
								</div>
							) : null}
						</div>

						{timelineLoading ? (
							<div className="flex items-center justify-center py-10 text-sm text-white/55">
								<LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
								Loading timeline...
							</div>
						) : timeline.length ? (
							<div className="overflow-x-auto custom-scrollbar">
								<div className="flex min-w-max gap-3 pb-2">
									{timeline.map((item) => {
										const isActive = item.traceId === selectedTraceId;
										const severity = Number(item.disruption?.severity || 0);
										const severityTone =
											severity >= 8
												? 'text-rose-200 border-rose-300/30 bg-rose-400/10'
												: severity >= 5
													? 'text-amber-200 border-amber-300/30 bg-amber-400/10'
													: 'text-cyan-200 border-cyan-300/30 bg-cyan-400/10';
										const statusTone = item.status === 'resolved' ? 'text-emerald-200' : 'text-amber-200';

										return (
											<button
												key={item.traceId}
												onClick={() => setSelectedTraceId(item.traceId)}
												className={[
													'w-[260px] rounded-2xl border p-3 text-left transition-all',
													isActive
														? 'border-cyan-300/35 bg-cyan-300/[0.12] shadow-[0_0_0_1px_rgba(125,211,252,0.22)]'
														: 'border-white/12 bg-white/[0.03] hover:border-white/22 hover:bg-white/[0.05]',
												].join(' ')}
											>
												<div className="flex items-start justify-between gap-2">
													<div className="text-xs font-semibold text-white">{item.disruption?.type || 'UNKNOWN'}</div>
													<span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${severityTone}`}>
														S{severity || 0}
													</span>
												</div>
												<div className="mt-2 line-clamp-2 text-sm text-white/80">{item.disruption?.location || 'Unknown location'}</div>
												<div className="mt-3 flex items-center justify-between text-[11px] text-white/55">
													<span>{formatTime(item.createdAt)}</span>
													<span className={statusTone}>{item.status}</span>
												</div>
												<div className="mt-2 text-[11px] text-white/45">
													Cargo at risk: {formatMoney(item.impact?.totalCargoAtRiskUSD || 0)}
												</div>
											</button>
										);
									})}
								</div>
							</div>
						) : (
							<div className="flex items-center justify-center py-12 text-sm text-white/55">
								<Clock3 className="mr-2 h-4 w-4" />
								No disruptions processed yet.
							</div>
						)}
					</section>
				</div>
			</main>
		</div>
	);
}

function normalizeValidation(value) {
	if (value && typeof value === 'object') {
		return {
			valid: Boolean(value.valid),
			errors: Array.isArray(value.errors) ? value.errors : [],
		};
	}
	return { valid: true, errors: [] };
}
