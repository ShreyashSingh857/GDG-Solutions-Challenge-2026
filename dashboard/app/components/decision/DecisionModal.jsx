'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useAlertStore } from '../../store/alertStore.js';
import OptionCard from './OptionCard.jsx';
import SeverityBadge from '../alerts/SeverityBadge.jsx';

const URL = process.env.NEXT_PUBLIC_RESOLUTION_AGENT_URL || 'http://localhost:3003';

function LoadingSkeleton({ stage, onDismiss }) {
  const renderStageIcon = (idx) => {
    if (idx === 1) {
      if (stage >= 1) return <span className="text-green-400">✓</span>;
      if (stage === 0) return <span className="w-3 h-3 rounded-full border-2 border-white/40 border-t-transparent animate-spin" />;
      return <span className="w-3 h-3 rounded-full bg-white/20" />;
    }
    if (idx === 2) {
      if (stage >= 2) return <span className="text-green-400">✓</span>;
      if (stage === 1) return <span className="w-3 h-3 rounded-full border-2 border-white/40 border-t-transparent animate-spin" />;
      return <span className="w-3 h-3 rounded-full bg-white/20" />;
    }
    if (stage === 3) return <span className="text-green-400">✓</span>;
    if (stage === 2) return <span className="w-3 h-3 rounded-full border-2 border-white/40 border-t-transparent animate-spin" />;
    return <span className="w-3 h-3 rounded-full bg-white/20" />;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl bg-gray-900 rounded-2xl border border-white/10 p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-transparent animate-spin" />
            <h2 className="text-white font-semibold">AI is analyzing disruption...</h2>
          </div>
          <button onClick={onDismiss} className="text-white/40 hover:text-white/70 text-sm">Dismiss</button>
        </div>

        <div className="flex items-center justify-center gap-3 text-sm">
          <div className="flex items-center gap-2 text-white/70">{renderStageIcon(1)}<span>Monitor</span></div>
          <span className="text-white/30">→</span>
          <div className="flex items-center gap-2 text-white/70">{renderStageIcon(2)}<span>Impact</span></div>
          <span className="text-white/30">→</span>
          <div className="flex items-center gap-2 text-white/70">{renderStageIcon(3)}<span>Negotiator</span></div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="h-48 rounded-xl bg-gray-800/40 animate-pulse" />
          <div className="h-48 rounded-xl bg-gray-800/40 animate-pulse" />
          <div className="h-48 rounded-xl bg-gray-800/40 animate-pulse" />
        </div>

        <div className="flex items-center justify-between text-xs text-white/40">
          <span>Typically 30-60 seconds</span>
          <button onClick={onDismiss} className="px-3 py-1.5 rounded-lg border border-white/10 text-white/60 hover:text-white hover:border-white/20">Dismiss</button>
        </div>
      </div>
    </div>
  );
}

export default function DecisionModal() {
  const activeResolution = useAlertStore((s) => s.activeResolution);
  const disruptions = useAlertStore((s) => s.disruptions);
  const activeDisruptionId = useAlertStore((s) => s.activeDisruptionId);
  const clearActiveDisruption = useAlertStore((s) => s.clearActiveDisruption);
  const markResolutionExecuted = useAlertStore((s) => s.markResolutionExecuted);
  const [isApproving, setIsApproving] = useState(false);
  const [approvedRank, setApprovedRank] = useState(null);
  const [agentStage, setAgentStage] = useState(0);
  const prevDisruptionsCountRef = useRef(0);

  useEffect(() => {
    let monitorTimer;
    let impactTimer;

    if (!activeDisruptionId) {
      setAgentStage(0);
      prevDisruptionsCountRef.current = disruptions.length;
      return () => {};
    }

    if (disruptions.length > prevDisruptionsCountRef.current) {
      monitorTimer = setTimeout(() => setAgentStage((s) => Math.max(s, 1)), 2000);
    }
    prevDisruptionsCountRef.current = disruptions.length;

    if (activeResolution && !activeResolution?.options?.length) {
      impactTimer = setTimeout(() => setAgentStage((s) => Math.max(s, 2)), 3000);
    }

    if (activeResolution?.options?.length > 0) {
      setAgentStage(3);
    }

    return () => {
      if (monitorTimer) clearTimeout(monitorTimer);
      if (impactTimer) clearTimeout(impactTimer);
    };
  }, [disruptions.length, activeResolution, activeDisruptionId]);

  if (activeDisruptionId && !activeResolution?.options?.length) {
    return <LoadingSkeleton stage={agentStage} onDismiss={clearActiveDisruption} />;
  }

  if (!activeResolution?.options?.length) return null;

  const traceId = activeResolution.traceId || activeResolution.id;
  const disruption = disruptions.find((d) => d.id === activeResolution.disruptionId || d.traceId === activeResolution.disruptionId);

  async function handleApprove(rank) {
    if (isApproving) return;
    setIsApproving(true);
    try {
      const res = await fetch(`${URL}/execute`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ traceId, rank }) });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || `HTTP ${res.status}`);
      setApprovedRank(rank);
      markResolutionExecuted(rank);
      toast.success(`Option #${rank} executed — shipments are being rerouted`);
      setTimeout(() => clearActiveDisruption(), 3000);
    } catch (err) {
      toast.error(`Execution failed: ${err.message}`);
    } finally {
      setIsApproving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-5xl bg-gray-900 rounded-2xl border border-white/10 flex flex-col max-h-[90vh] overflow-hidden">
        <div className="flex items-start justify-between px-6 py-4 border-b border-white/5">
          <div className="flex flex-col gap-1"><div className="flex items-center gap-3"><h2 className="text-lg font-semibold text-white">Resolution Required</h2>{disruption && <SeverityBadge severity={disruption.severity} />}</div><p className="text-sm text-white/50">{disruption?.location || 'Disruption detected'} — {activeResolution.cascadeRisk} cascade risk</p></div>
          <button onClick={clearActiveDisruption} className="text-white/30 hover:text-white/60 text-xl leading-none">×</button>
        </div>
        {activeResolution.analysisText && <div className="px-6 py-3 bg-red-950/20 border-b border-white/5"><p className="text-xs text-red-300/80 leading-relaxed">{activeResolution.analysisText}</p></div>}
        <div className="flex flex-col md:flex-row gap-4 p-6 overflow-y-auto">
          {activeResolution.options.map((option) => (
            <OptionCard key={option.rank} option={option} onApprove={handleApprove} isApproving={isApproving} isSelected={approvedRank === option.rank} />
          ))}
        </div>
        <div className="px-6 py-3 border-t border-white/5 flex items-center justify-between"><p className="text-xs text-white/20">Trace ID: <span className="font-mono">{traceId}</span></p><p className="text-xs text-white/20">Urgency {activeResolution.urgency}/10</p></div>
      </div>
    </div>
  );
}
