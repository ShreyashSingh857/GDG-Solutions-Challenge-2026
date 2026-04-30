'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  collection,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../lib/firebase.js';
import { watchDisruptionSupabase, watchImpactSupabase, watchResolutionSupabase } from '../lib/supabaseWatcher.js';
import NavBar from '../components/NavBar.jsx';

const SCENARIOS = [
  {
    id: 'pacific_storm',
    label: 'Super Typhoon Mawar',
    region: 'Western Pacific',
    severity: 9,
    icon: '🌀',
    tag: 'CAT 5 STORM',
    tagColor: 'var(--accent-red)',
    preview: 'Shanghai → LA corridor at risk. Manila, Kaohsiung, HK vessel advisories active.',
  },
  {
    id: 'suez_closure',
    label: 'Suez Canal Emergency',
    region: 'Red Sea / Egypt',
    severity: 10,
    icon: '⚓',
    tag: 'CANAL BLOCKED',
    tagColor: 'var(--accent-amber)',
    preview: "$12B daily trade halted. 43 vessels held. Lloyd's suspended war-risk coverage.",
  },
  {
    id: 'port_strike',
    label: 'Mumbai JNPT Strike',
    region: 'South Asia',
    severity: 7,
    icon: '🏗',
    tag: 'PORT STRIKE',
    tagColor: 'var(--accent-blue)',
    preview: '4,800 dockworkers AWOL. 5M TEU/yr port offline. Mundra at 85% capacity.',
  },
];

const STAGES = [
  { id: 'idle',       label: 'Ready',             icon: '◎',  color: 'var(--text-muted)' },
  { id: 'injected',   label: 'Disruption Injected',icon: '⚡',  color: 'var(--accent-amber)' },
  { id: 'monitoring',label: 'Monitor Agent',      icon: '📡', color: 'var(--accent-blue)' },
  { id: 'impact',    label: 'Impact Analysis',    icon: '📊', color: 'var(--accent-red)' },
  { id: 'resolution',label: 'AI Resolution',    icon: '🤖', color: 'var(--accent-cyan)' },
  { id: 'decision',  label: 'Human Decision',    icon: '⚖️', color: 'var(--accent-amber)' },
  { id: 'applied',  label: 'Protocol Applied',   icon: '✓',  color: 'var(--accent-green)' },
  { id: 'report',   label: 'Report Ready',      icon: '📄', color: 'var(--accent-cyan)' },
];

const STAGE_INDEX = Object.fromEntries(STAGES.map((s, i) => [s.id, i]));

const OPTION_CFG = {
  1: { label: 'Recommended',   accent: 'var(--accent-cyan)',  border: 'rgba(34,211,238,0.35)' },
  2: { label: 'Fastest Path',  accent: 'var(--accent-blue)',  border: 'rgba(59,130,246,0.35)' },
  3: { label: 'Cost Efficient',accent: 'var(--accent-amber)', border: 'rgba(245,158,11,0.35)' },
};

function fmt$(v)  { return `$${Number(v || 0).toLocaleString()}`; }
function fmtD(v)  { return v >= 0 ? `+${v}d` : `${v}d`; }
function fmtCO2(v){ return `${Math.round(Number(v || 0) / 1000)}t CO₂`; }

function Pulse({ color = 'var(--accent-cyan)' }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: color,
        boxShadow: `0 0 8px ${color}`,
        animation: 'pulse 1.4s ease-in-out infinite',
      }}
    />
  );
}

function StageNode({ stage, index, currentIndex }) {
  const done    = index < currentIndex;
  const active  = index === currentIndex;
  const pending = index > currentIndex;
  const color   = active ? stage.color : done ? 'var(--accent-green)' : 'var(--text-muted)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1, minWidth: 0 }}>
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          background: active
            ? `${stage.color}18`
            : done
            ? 'rgba(34,197,94,0.12)'
            : 'rgba(255,255,255,0.03)',
          border: `1.5px solid ${color}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 16,
          boxShadow: active ? `0 0 16px ${stage.color}44` : 'none',
          transition: 'all 0.4s ease',
          flexShrink: 0,
        }}
      >
        {done ? '✓' : stage.icon}
      </div>
      <span
        style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color,
          textAlign: 'center',
          lineHeight: 1.3,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: '100%',
          opacity: pending ? 0.4 : 1,
          transition: 'all 0.3s ease',
        }}
      >
        {stage.label}
      </span>
    </div>
  );
}

function PipelineBar({ currentStage }) {
  const currentIndex = STAGE_INDEX[currentStage] ?? 0;
  const pct = currentIndex > 0 ? ((currentIndex) / (STAGES.length - 1)) * 100 : 0;

  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 16,
        padding: '20px 24px',
        marginBottom: 24,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0, position: 'relative' }}>
        <div
          style={{
            position: 'absolute',
            top: 17,
            left: '5%',
            right: '5%',
            height: 1,
            background: 'var(--border-subtle)',
            zIndex: 0,
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: 17,
            left: '5%',
            width: `${pct * 0.9}%`,
            height: 1,
            background: 'var(--accent-cyan)',
            boxShadow: '0 0 8px var(--accent-cyan)',
            zIndex: 1,
            transition: 'width 0.6s ease',
          }}
        />
        {STAGES.map((stage, i) => (
          <div key={stage.id} style={{ flex: 1, zIndex: 2 }}>
            <StageNode stage={stage} index={i} currentIndex={currentIndex} />
          </div>
        ))}
      </div>
    </div>
  );
}

function LogLine({ line }) {
  const colors = {
    info:    'var(--accent-cyan)',
    success: 'var(--accent-green)',
    warn:    'var(--accent-amber)',
    error:   'var(--accent-red)',
  };
  return (
    <div style={{ display: 'flex', gap: 8, fontSize: 11, fontFamily: 'monospace', lineHeight: 1.5 }}>
      <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{line.ts}</span>
      <span style={{ color: colors[line.type] || 'var(--text-secondary)', flexShrink: 0 }}>[{line.type.toUpperCase()}]</span>
      <span style={{ color: 'var(--text-secondary)' }}>{line.msg}</span>
    </div>
  );
}

function SeverityBar({ value }) {
  const pct = (value / 10) * 100;
  const color = value >= 8 ? 'var(--accent-red)' : value >= 5 ? 'var(--accent-amber)' : 'var(--accent-green)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 4, background: 'var(--bg-elevated)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2, boxShadow: `0 0 8px ${color}` }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color, minWidth: 20 }}>{value}/10</span>
    </div>
  );
}

function Chip({ label, value, accent }) {
  return (
    <div
      style={{
        padding: '6px 12px',
        borderRadius: 8,
        background: `${accent}10`,
        border: `1px solid ${accent}30`,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        flex: 1,
      }}
    >
      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
        {label}
      </span>
      <span style={{ fontSize: 13, fontWeight: 700, color: accent }}>{value}</span>
    </div>
  );
}

function OptionCardInline({ option, onApprove, isApproving, approvedRank }) {
  const cfg = OPTION_CFG[option.rank] || OPTION_CFG[3];
  const disabled = isApproving || approvedRank !== null;
  const selected = option.rank === approvedRank;

  return (
    <div
      style={{
        background: selected ? 'rgba(34,197,94,0.04)' : 'var(--bg-surface)',
        border: `1.5px solid ${selected ? 'rgba(34,197,94,0.45)' : cfg.border}`,
        borderRadius: 16,
        padding: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        flex: 1,
        minWidth: 220,
        boxShadow: selected ? '0 0 24px rgba(34,197,94,0.12)' : 'none',
        transition: 'all 0.4s ease',
        opacity: !selected && approvedRank !== null ? 0.4 : 1,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span
          style={{
            fontSize: 9,
            fontWeight: 800,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: cfg.accent,
            background: `${cfg.accent}14`,
            border: `1px solid ${cfg.accent}30`,
            padding: '3px 8px',
            borderRadius: 6,
          }}
        >
          {cfg.label}
        </span>
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '0.12em',
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
          }}
        >
          Option {option.rank}
        </span>
      </div>

      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
          {option.title || option.name || `Resolution Strategy ${option.rank}`}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          {option.description || option.summary || '—'}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <Chip label="Cost Δ"   value={fmt$(option.costDelta)}          accent={cfg.accent} />
        <Chip label="Time Δ"   value={fmtD(option.timeDelta ?? 0)}      accent={cfg.accent} />
        <Chip label="CO₂ Δ"    value={fmtCO2(option.carbonDeltaKg)}    accent={cfg.accent} />
      </div>

      {option.confidence != null && (
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>
            AI Confidence
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, height: 3, background: 'var(--bg-elevated)', borderRadius: 2, overflow: 'hidden' }}>
              <div
                style={{
                  width: `${option.confidence}%`,
                  height: '100%',
                  background: cfg.accent,
                  borderRadius: 2,
                }}
              />
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: cfg.accent }}>{option.confidence}%</span>
          </div>
        </div>
      )}

      {selected ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '10px 0',
            fontSize: 11,
            fontWeight: 700,
            color: 'var(--accent-green)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          <span>✓</span> Protocol Deployed
        </div>
      ) : (
        <button
          onClick={() => !disabled && onApprove(option.rank)}
          disabled={disabled}
          style={{
            marginTop: 4,
            padding: '10px 0',
            borderRadius: 10,
            background: cfg.accent,
            color: option.rank === 1 ? '#020617' : '#fff',
            fontWeight: 800,
            fontSize: 11,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            border: 'none',
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.5 : 1,
            transition: 'all 0.2s ease',
          }}
        >
          {isApproving ? 'Deploying…' : `Deploy Protocol ${option.rank}`}
        </button>
      )}
    </div>
  );
}

export default function DemoPage() {
  const [selectedScenario, setSelectedScenario] = useState(null);
  const searchParams = useSearchParams();

  // Auto-select and launch scenario from URL param (?scenario=pacific_storm)
  useEffect(() => {
    const scenarioParam = searchParams?.get('scenario');
    if (!scenarioParam) return;
    const match = SCENARIOS.find((s) => s.id === scenarioParam);
    if (match) setSelectedScenario(match.id);
  }, [searchParams]);

  // Auto-launch once scenario is pre-selected from URL
  useEffect(() => {
    const scenarioParam = searchParams?.get('scenario');
    if (!scenarioParam || !selectedScenario) return;
    if (selectedScenario === scenarioParam) {
      // Small delay to let UI render before launch
      const t = setTimeout(() => handleLaunch(), 300);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedScenario]);
  const [stage, setStage]         = useState('idle');
  const [disruptionId, setDisruptionId] = useState(null);
  const [traceId, setTraceId]     = useState(null);
  const [disruption, setDisruption]   = useState(null);
  const [impactReport, setImpactReport] = useState(null);
  const [resolution, setResolution]   = useState(null);
  const [options, setOptions]     = useState([]);
  const [approvedRank, setApprovedRank] = useState(null);
  const [isApproving, setIsApproving]  = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [reportReady, setReportReady] = useState(false);
  const [reportData, setReportData]   = useState(null);
  const [logs, setLogs]           = useState([]);
  const [launching, setLaunching] = useState(false);
  const [error, setError]         = useState(null);
  const unsubsRef = useRef([]);
  const logEndRef = useRef(null);

  const log = useCallback((msg, type = 'info') => {
    const ts = new Date().toLocaleTimeString('en-US', { hour12: false });
    setLogs((prev) => [...prev.slice(-60), { ts, msg, type }]);
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  useEffect(() => {
    return () => unsubsRef.current.forEach((u) => u?.());
  }, []);

  const watchResolutionRef = useRef(null);
  const watchImpactRef = useRef(null);

  const watchResolution = useCallback(
    (dId) => {
      log('Impact complete — AI resolution agent active…', 'info');
      const unsub = watchResolutionSupabase(dId, ({ resolution: res, options: opts }) => {
        setResolution(res);
        setOptions(opts);
        setStage('resolution');
        log(`✓ AI generated ${opts.length} resolution strategies`, 'success');
        setTimeout(() => setStage('decision'), 1200);
      });
      unsubsRef.current.push(unsub);
    },
    [log]
  );

  const watchImpact = useCallback(
    (dId) => {
      log('Monitor agent processing… watching impact_reports…', 'info');
      const unsub = watchImpactSupabase(dId, (data) => {
        setImpactReport(data);
        setStage('impact');
        log(
          `✓ Impact scored: $${Number(data.totalCargoAtRiskUSD || 0).toLocaleString()} at risk across ${(data.affectedShipments || []).length} shipments`,
          'success'
        );
        if (watchResolutionRef.current) watchResolutionRef.current(dId);
      });
      unsubsRef.current.push(unsub);
    },
    [log]
  );

  useEffect(() => {
    watchResolutionRef.current = watchResolution;
    watchImpactRef.current = watchImpact;
  }, [watchResolution, watchImpact]);

  const watchDisruption = useCallback(
    (dId) => {
      log(`Listening for disruption ${dId} in Supabase…`, 'info');
      const unsub = watchDisruptionSupabase(dId, (data) => {
        setDisruption(data);
        setStage('monitoring');
        log(`✓ Disruption confirmed: ${data.title || data.type || dId}`, 'success');
        if (watchImpactRef.current) watchImpactRef.current(dId);
      });
      unsubsRef.current.push(unsub);
    },
    [log]
  );

  const handleLaunch = async () => {
    if (!selectedScenario) return;
    setError(null);
    setLaunching(true);
    setLogs([]);
    setDisruption(null);
    setImpactReport(null);
    setResolution(null);
    setOptions([]);
    setApprovedRank(null);
    setReportReady(false);
    setReportData(null);
    unsubsRef.current.forEach((u) => u?.());
    unsubsRef.current = [];

    log(`Injecting scenario: ${selectedScenario}…`, 'info');
    setStage('injected');

    try {
      const res = await fetch('/api/demo/inject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario: selectedScenario }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const dId = data.disruptionId;
      const tId = data.traceId;
      setDisruptionId(dId);
      setTraceId(tId);

      log(`✓ Disruption published — ID: ${dId}`, 'success');
      log(`  TraceId: ${tId}`, 'info');
      log('Event bus fan-out complete. Agent pipeline starting…', 'info');

      watchDisruption(dId);
    } catch (err) {
      setError(err.message);
      setStage('idle');
      log(`✗ Injection failed: ${err.message}`, 'error');
    } finally {
      setLaunching(false);
    }
  };

  const handleApprove = async (rank) => {
    if (!resolution || !options.length) return;
    setIsApproving(true);
    setStage('applied');

    const selected = options.find((o) => o.rank === rank);
    log(`Deploying protocol: Option ${rank} — ${selected?.title || ''}`, 'info');

    try {
      const res = await fetch('/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          traceId: resolution.id,
          rank,
          disruptionId,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        log(`Execute warning (${res.status}): ${data.error || 'Non-fatal'}`, 'warn');
      } else {
        log(`✓ Protocol ${rank} deployed — shipments rerouting`, 'success');
      }
    } catch (err) {
      log(`Execute error: ${err.message}`, 'warn');
    }

    setApprovedRank(rank);
    setIsApproving(false);
    log('Generating executive incident report…', 'info');

    setIsGeneratingReport(true);
    try {
      const reportRes = await fetch('/api/generate-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          disruption,
          resolution,
          options,
          impactReport,
        }),
      });
      const payload = await reportRes.json();
      if (payload.report) {
        setReportData(payload.report);
        setReportReady(true);
        setStage('report');
        log('✓ Executive report ready — click Download to save PDF', 'success');
      } else {
        log(`Report gen warning: ${payload.error || 'No report text'}`, 'warn');
        setStage('report');
      }
    } catch (err) {
      log(`Report error: ${err.message}`, 'warn');
      setStage('report');
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const handleDownload = async () => {
    if (!reportData) return;
    try {
      const { generateReportPdf } = await import('../lib/generateReportPdf.js');
      const doc = generateReportPdf({ reportText: reportData, disruption, traceId });
      doc.save(`opentrade-incident-${traceId || Date.now()}.pdf`);
      log('✓ PDF downloaded', 'success');
    } catch (err) {
      log(`PDF error: ${err.message}`, 'error');
    }
  };

  const handleReset = () => {
    unsubsRef.current.forEach((u) => u?.());
    unsubsRef.current = [];
    setStage('idle');
    setSelectedScenario(null);
    setDisruptionId(null);
    setTraceId(null);
    setDisruption(null);
    setImpactReport(null);
    setResolution(null);
    setOptions([]);
    setApprovedRank(null);
    setReportReady(false);
    setReportData(null);
    setLogs([]);
    setError(null);
  };

  const currentStageIndex = STAGE_INDEX[stage] ?? 0;
  const activeScenario = SCENARIOS.find((s) => s.id === selectedScenario);

  return (
    <>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.5; transform: scale(1.2); }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes shimmer {
          0%   { background-position: -400px 0; }
          100% { background-position: 400px 0; }
        }
        .anim-fadeinup { animation: fadeInUp 0.45s ease both; }
        .skeleton {
          background: linear-gradient(90deg, var(--bg-elevated) 25%, var(--bg-surface) 50%, var(--bg-elevated) 75%);
          background-size: 400px 100%;
          animation: shimmer 1.4s infinite;
          border-radius: 6px;
        }
      `}</style>

      <div className="flex h-screen flex-col overflow-hidden bg-(--bg-base) text-(--text-primary)">
        <NavBar />

        <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden custom-scrollbar px-4 py-6 sm:px-6 lg:px-8">
          <div style={{ maxWidth: 1200, margin: '0 auto' }}>

            <div style={{ marginBottom: 32 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    color: 'var(--accent-cyan)',
                    background: 'rgba(34,211,238,0.08)',
                    border: '1px solid rgba(34,211,238,0.2)',
                    padding: '3px 10px',
                    borderRadius: 20,
                  }}
                >
                  Live Pipeline Demo
                </span>
                {stage !== 'idle' && stage !== 'injected' && <Pulse />}
              </div>
              <h1
                style={{
                  fontSize: 28,
                  fontWeight: 800,
                  color: 'var(--text-primary)',
                  letterSpacing: '-0.02em',
                  margin: 0,
                }}
              >
                OpenTrade Command Demo
              </h1>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '6px 0 0' }}>
                End-to-end pipeline: Disruption Injection → AI resolution → Human Decision → Protocol Deployment → PDF Report
              </p>
            </div>

            <PipelineBar currentStage={stage} />

            {error && (
              <div
                style={{
                  background: 'rgba(239,68,68,0.08)',
                  border: '1px solid rgba(239,68,68,0.25)',
                  borderRadius: 12,
                  padding: '12px 16px',
                  marginBottom: 20,
                  fontSize: 12,
                  color: 'var(--accent-red)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span>⚠</span>
                <strong>Error:</strong> {error} — Check that all agents are running and env vars are set.
              </div>
            )}

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>

              {stage === 'idle' && (
                <div className="anim-fadeinup">
                  <div
                    style={{
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 16,
                      padding: 24,
                      marginBottom: 16,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 800,
                        letterSpacing: '0.14em',
                        textTransform: 'uppercase',
                        color: 'var(--text-muted)',
                        marginBottom: 16,
                      }}
                    >
                      Choose Scenario
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
                      {SCENARIOS.map((sc) => (
                        <button
                          key={sc.id}
                          onClick={() => setSelectedScenario(sc.id)}
                          style={{
                            background:
                              selectedScenario === sc.id
                                ? `${sc.tagColor}10`
                                : 'var(--bg-elevated)',
                            border: `1.5px solid ${
                              selectedScenario === sc.id ? sc.tagColor : 'var(--border-subtle)'
                            }`,
                            borderRadius: 12,
                            padding: 16,
                            textAlign: 'left',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            boxShadow:
                              selectedScenario === sc.id
                                ? `0 0 16px ${sc.tagColor}22`
                                : 'none',
                          }}
                        >
                          <div style={{ fontSize: 22, marginBottom: 8 }}>{sc.icon}</div>
                          <div
                            style={{
                              fontSize: 9,
                              fontWeight: 800,
                              letterSpacing: '0.12em',
                              textTransform: 'uppercase',
                              color: sc.tagColor,
                              marginBottom: 4,
                            }}
                          >
                            {sc.tag}
                          </div>
                          <div
                            style={{
                              fontSize: 12,
                              fontWeight: 700,
                              color: 'var(--text-primary)',
                              marginBottom: 6,
                              lineHeight: 1.3,
                            }}
                          >
                            {sc.label}
                          </div>
                          <div
                            style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.5 }}
                          >
                            {sc.preview}
                          </div>
                          <div style={{ marginTop: 10 }}>
                            <SeverityBar value={sc.severity} />
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={handleLaunch}
                    disabled={!selectedScenario || launching}
                    style={{
                      width: '100%',
                      padding: '14px 0',
                      borderRadius: 12,
                      background: selectedScenario ? 'var(--accent-cyan)' : 'var(--bg-elevated)',
                      color: selectedScenario ? '#020617' : 'var(--text-muted)',
                      fontWeight: 800,
                      fontSize: 13,
                      letterSpacing: '0.1em',
                      textTransform: 'uppercase',
                      border: 'none',
                      cursor: selectedScenario && !launching ? 'pointer' : 'not-allowed',
                      transition: 'all 0.2s ease',
                      boxShadow: selectedScenario ? '0 0 24px rgba(34,211,238,0.3)' : 'none',
                    }}
                  >
                    {launching ? '⚡ Injecting…' : '⚡ Launch Demo Pipeline'}
                  </button>
                </div>
              )}

              {stage === 'injected' && (
                <div
                  className="anim-fadeinup"
                  style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 16,
                    padding: 28,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 16,
                    alignItems: 'center',
                    textAlign: 'center',
                  }}
                >
                  <Pulse color="var(--accent-amber)" />
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                    Disruption published to Event Bus
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    Waiting for Monitor Agent to confirm detection…
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
                    <div className="skeleton" style={{ height: 14, width: '70%', margin: '0 auto' }} />
                    <div className="skeleton" style={{ height: 14, width: '50%', margin: '0 auto' }} />
                  </div>
                </div>
              )}

              {stage === 'monitoring' && disruption && (
                <div
                  className="anim-fadeinup"
                  style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid rgba(59,130,246,0.25)',
                    borderRadius: 16,
                    padding: 24,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Pulse color="var(--accent-blue)" />
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 800,
                        letterSpacing: '0.14em',
                        textTransform: 'uppercase',
                        color: 'var(--accent-blue)',
                      }}
                    >
                      Monitor Agent — Disruption Confirmed
                    </div>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                    {disruption.title || activeScenario?.label || 'Disruption Detected'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                    {disruption.summary || disruption.description || '—'}
                  </div>
                  {disruption.severity != null && (
                    <div>
                      <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
                        Severity Score
                      </div>
                      <SeverityBar value={disruption.severity} />
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    Running impact analysis across all active shipments…
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div className="skeleton" style={{ height: 10, width: '90%' }} />
                    <div className="skeleton" style={{ height: 10, width: '70%' }} />
                  </div>
                </div>
              )}

              {stage === 'impact' && impactReport && (
                <div className="anim-fadeinup" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div
                    style={{
                      background: 'var(--bg-surface)',
                      border: '1px solid rgba(239,68,68,0.25)',
                      borderRadius: 16,
                      padding: 24,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 16,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Pulse color="var(--accent-red)" />
                      <div
                        style={{
                          fontSize: 10,
                          fontWeight: 800,
                          letterSpacing: '0.14em',
                          textTransform: 'uppercase',
                          color: 'var(--accent-red)',
                        }}
                      >
                        Impact Analysis Complete
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <Chip
                        label="Cargo at Risk"
                        value={fmt$(impactReport.totalCargoAtRiskUSD)}
                        accent="var(--accent-red)"
                      />
                      <Chip
                        label="Shipments Affected"
                        value={(impactReport.affectedShipments || []).length}
                        accent="var(--accent-amber)"
                      />
                      <Chip
                        label="Cascade Risk"
                        value={`${Math.round((impactReport.cascadeRisk || 0) * 100)}%`}
                        accent="var(--accent-red)"
                      />
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      Resolution agent generating strategic options…
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div className="skeleton" style={{ height: 10, width: '80%' }} />
                      <div className="skeleton" style={{ height: 10, width: '55%' }} />
                    </div>
                  </div>
                </div>
              )}

              {(stage === 'resolution' || stage === 'decision' || stage === 'applied' || stage === 'report') && options.length > 0 && (
                <div className="anim-fadeinup" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {stage === 'decision' && <Pulse color="var(--accent-amber)" />}
                    {stage === 'resolution' && <Pulse color="var(--accent-cyan)" />}
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 800,
                        letterSpacing: '0.14em',
                        textTransform: 'uppercase',
                        color:
                          stage === 'report' ? 'var(--accent-green)'
                          : stage === 'applied' ? 'var(--accent-green)'
                          : stage === 'decision' ? 'var(--accent-amber)'
                          : 'var(--accent-cyan)',
                      }}
                    >
                      {stage === 'report'
                        ? '✓ Protocol Applied — Report Ready'
                        : stage === 'applied'
                        ? '⚡ Executing Protocol…'
                        : stage === 'decision'
                        ? 'Human Decision Required'
                        : 'AI Generated 3 Resolution Strategies'}
                    </div>
                  </div>

                  {impactReport && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <Chip label="Cargo at Risk"   value={fmt$(impactReport.totalCargoAtRiskUSD)} accent="var(--accent-red)" />
                      <Chip label="Shipments"        value={(impactReport.affectedShipments || []).length} accent="var(--accent-amber)" />
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    {options.map((opt) => (
                      <OptionCardInline
                        key={opt.rank}
                        option={opt}
                        onApprove={handleApprove}
                        isApproving={isApproving}
                        approvedRank={approvedRank}
                      />
                    ))}
                  </div>

                  {stage === 'decision' && approvedRank === null && (
                    <div
                      style={{
                        fontSize: 11,
                        color: 'var(--text-muted)',
                        textAlign: 'center',
                        padding: '8px 0',
                      }}
                    >
                      ↑ Select a protocol to deploy. Keyboard shortcuts: press{' '}
                      <kbd
                        style={{
                          background: 'var(--bg-elevated)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: 4,
                          padding: '1px 5px',
                          fontSize: 10,
                        }}
                      >
                        1
                      </kbd>{' '}
                      <kbd
                        style={{
                          background: 'var(--bg-elevated)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: 4,
                          padding: '1px 5px',
                          fontSize: 10,
                        }}
                      >
                        2
                      </kbd>{' '}
                      <kbd
                        style={{
                          background: 'var(--bg-elevated)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: 4,
                          padding: '1px 5px',
                          fontSize: 10,
                        }}
                      >
                        3
                      </kbd>
                    </div>
                  )}
                </div>
              )}

              {stage === 'report' && (
                <div
                  className="anim-fadeinup"
                  style={{
                    background: 'rgba(34,197,94,0.04)',
                    border: '1.5px solid rgba(34,197,94,0.3)',
                    borderRadius: 16,
                    padding: 24,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 16,
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: 'var(--accent-green)',
                        marginBottom: 4,
                      }}
                    >
                      ✓ Pipeline Complete
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      Executive incident report generated. Download the PDF or run another scenario.
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
                    {reportReady && (
                      <button
                        onClick={handleDownload}
                        style={{
                          padding: '10px 20px',
                          borderRadius: 10,
                          background: 'var(--accent-cyan)',
                          color: '#020617',
                          fontWeight: 800,
                          fontSize: 11,
                          letterSpacing: '0.08em',
                          textTransform: 'uppercase',
                          border: 'none',
                          cursor: 'pointer',
                        }}
                      >
                        📄 Download PDF
                      </button>
                    )}
                    <button
                      onClick={handleReset}
                      style={{
                        padding: '10px 20px',
                        borderRadius: 10,
                        background: 'var(--bg-elevated)',
                        color: 'var(--text-secondary)',
                        fontWeight: 700,
                        fontSize: 11,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        border: '1px solid var(--border-subtle)',
                        cursor: 'pointer',
                      }}
                    >
                      ↺ New Demo
                    </button>
                  </div>
                </div>
              )}
            </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>

              {(disruptionId || stage !== 'idle') && (
                <div
                  style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 14,
                    padding: 16,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}
                >
                  <div
                    style={{
                      fontSize: 9,
                      fontWeight: 800,
                      letterSpacing: '0.14em',
                      textTransform: 'uppercase',
                      color: 'var(--text-muted)',
                    }}
                  >
                    Session
                  </div>
                  {activeScenario && (
                    <div>
                      <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 2 }}>Scenario</div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' }}>
                        {activeScenario.icon} {activeScenario.label}
                      </div>
                    </div>
                  )}
                  {disruptionId && (
                    <div>
                      <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 2 }}>Disruption ID</div>
                      <div style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--accent-cyan)', wordBreak: 'break-all' }}>
                        {disruptionId}
                      </div>
                    </div>
                  )}
                  {traceId && (
                    <div>
                      <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 2 }}>Trace ID</div>
                      <div style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
                        {traceId}
                      </div>
                    </div>
                  )}
                  <div>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 2 }}>Stage</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: STAGES[currentStageIndex]?.color }}>
                      {STAGES[currentStageIndex]?.icon} {STAGES[currentStageIndex]?.label}
                    </div>
                  </div>
                </div>
              )}

              <div
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 14,
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  flex: 1,
                  minHeight: 260,
                  maxHeight: 420,
                }}
              >
                <div
                  style={{
                    padding: '10px 14px',
                    borderBottom: '1px solid var(--border-subtle)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                    Agent Console
                  </span>
                  {stage !== 'idle' && stage !== 'report' && <Pulse color="var(--accent-green)" />}
                </div>
                <div
                  style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '10px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                  }}
                >
                  {logs.length === 0 ? (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                      Awaiting launch…
                    </div>
                  ) : (
                    logs.map((line, i) => <LogLine key={i} line={line} />)
                  )}
                  <div ref={logEndRef} />
                </div>
              </div>

              {stage !== 'idle' && stage !== 'report' && (
                <button
                  onClick={handleReset}
                  style={{
                    padding: '8px 0',
                    borderRadius: 10,
                    background: 'var(--bg-elevated)',
                    color: 'var(--text-muted)',
                    fontWeight: 700,
                    fontSize: 10,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    border: '1px solid var(--border-subtle)',
                    cursor: 'pointer',
                  }}
                >
                  ✕ Abort & Reset
                </button>
              )}
            </div>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}