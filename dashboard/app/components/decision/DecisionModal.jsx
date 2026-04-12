'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useAlertStore } from '../../store/alertStore.js';
import OptionCard from './OptionCard.jsx';
import SeverityBadge from '../alerts/SeverityBadge.jsx';

const URL = process.env.NEXT_PUBLIC_RESOLUTION_AGENT_URL || 'http://localhost:3003';

export default function DecisionModal() {
  const activeResolution = useAlertStore((s) => s.activeResolution);
  const disruptions = useAlertStore((s) => s.disruptions);
  const clearActiveDisruption = useAlertStore((s) => s.clearActiveDisruption);
  const markResolutionExecuted = useAlertStore((s) => s.markResolutionExecuted);
  const [isApproving, setIsApproving] = useState(false);
  const [approvedRank, setApprovedRank] = useState(null);

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
