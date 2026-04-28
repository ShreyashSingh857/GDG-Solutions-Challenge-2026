'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import { collection, limit, onSnapshot, query, where } from 'firebase/firestore';
import { X, ShieldAlert, Cpu, ShieldCheck, FileText } from 'lucide-react';
import { useAlertStore } from '../../store/alertStore.js';
import { db, isFirebaseConfigured } from '../../lib/firebase.js';
import OptionCard from './OptionCard.jsx';
import RiskMatrix from './RiskMatrix.jsx';
import SeverityBadge from '../alerts/SeverityBadge.jsx';

function LoadingSkeleton({ stage, onDismiss }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-overlay)] backdrop-blur-xl p-4">
      <motion.div initial={{ scale: 0.95, opacity: 0, y: 12 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 8 }} className="w-full max-w-2xl bg-[var(--bg-surface)] rounded-3xl border border-[var(--border-default)] p-8 shadow-2xl space-y-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-2xl bg-[var(--accent-cyan)]/10 flex items-center justify-center">
              <Cpu className="w-5 h-5 text-[var(--accent-cyan)] animate-pulse" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[var(--text-primary)] font-display tracking-tight uppercase">AI Collective Synthesis</h2>
              <p className="text-[11px] text-[var(--text-muted)] font-medium">Formulating resolution strategies across global transport nodes...</p>
            </div>
          </div>
          <button onClick={onDismiss} className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"><X className="w-5 h-5" /></button>
        </div>

        <div className="relative h-1 bg-[var(--bg-elevated)] rounded-full overflow-hidden">
          <motion.div 
            initial={{ width: 0 }} 
            animate={{ width: `${(stage / 3) * 100}%` }} 
            className="absolute inset-y-0 left-0 bg-[var(--accent-cyan)] shadow-[0_0_10px_var(--accent-cyan)]" 
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className={`p-4 rounded-2xl border transition-all duration-500 ${stage >= i ? 'border-[var(--accent-cyan)]/30 bg-[var(--accent-cyan)]/5' : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)]/30 opacity-40'}`}>
              <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--text-muted)] mb-2">Stage 0{i}</div>
              <div className="text-xs font-bold text-[var(--text-primary)] uppercase">{i === 1 ? 'Monitor' : i === 2 ? 'Impact' : 'Strategy'}</div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between py-2">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-cyan)] animate-ping" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Live synthesis active</span>
          </div>
          <button onClick={onDismiss} className="px-5 py-2 rounded-xl border border-[var(--border-subtle)] text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-all">Abort Simulation</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function ReportButton({ disruption, resolution, options, impactReport, traceId }) {
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/generate-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disruption, resolution, options, impactReport }),
      });

      const payload = await res.json();
      if (!res.ok || payload.error || !payload.report) {
        toast.error(payload.error || 'Report generation failed');
        return;
      }

      const { generateReportPdf } = await import('../../lib/generateReportPdf.js');
      const doc = generateReportPdf({ reportText: payload.report, disruption, traceId });
      const filename = `opentrade-report-${traceId || Date.now()}.pdf`;
      doc.save(filename);
      toast.success('Report downloaded');
    } catch {
      toast.error('Failed to generate report');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={generate}
      disabled={loading}
      className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent-cyan)]/40 transition-all text-[10px] font-bold uppercase tracking-widest disabled:opacity-40"
    >
      {loading
        ? <div className="w-3.5 h-3.5 rounded-full border-2 border-[var(--accent-cyan)] border-t-transparent animate-spin" />
        : <FileText className="w-3.5 h-3.5" />}
      {loading ? 'Generating...' : 'Export Report'}
    </button>
  );
}

export default function DecisionModal() {
  const activeResolution = useAlertStore((s) => s.activeResolution);
  const disruptions = useAlertStore((s) => s.disruptions);
  const activeDisruptionId = useAlertStore((s) => s.activeDisruptionId);
  const clearActiveDisruption = useAlertStore((s) => s.clearActiveDisruption);
  const markResolutionExecuted = useAlertStore((s) => s.markResolutionExecuted);
  const [isApproving, setIsApproving] = useState(false);
  const [isExecuted, setIsExecuted] = useState(false);
  const [approvedRank, setApprovedRank] = useState(null);
  const approveRef = useRef(null);
  const modalRef = useRef(null);

  // Derive agentStage from store state instead of local useState to stay in sync
  const agentStage = !activeDisruptionId ? 0
    : !activeResolution ? 1
    : activeResolution.options?.length === 0 ? 2
    : 3;

  // Focus Trap
  useEffect(() => {
    if (!activeDisruptionId || !modalRef.current) return;

    const focusableElements = modalRef.current.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    const handleTab = (e) => {
      if (e.key !== 'Tab') return;
      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          lastElement.focus();
          e.preventDefault();
        }
      } else {
        if (document.activeElement === lastElement) {
          firstElement.focus();
          e.preventDefault();
        }
      }
    };

    if (firstElement) firstElement.focus();
    document.addEventListener('keydown', handleTab);
    return () => document.removeEventListener('keydown', handleTab);
  }, [activeDisruptionId, activeResolution?.options?.length, isExecuted]);

  useEffect(() => {
    if (!activeDisruptionId) {
      setTimeout(() => {
        setIsExecuted(false);
        setApprovedRank(null);
      }, 0);
      return;
    }

    // agentStage is now derived from store state, no need for listeners
    return () => {};
  }, [activeDisruptionId]);

  const traceId = activeResolution?.traceId || activeResolution?.id;
  const disruption = disruptions.find((d) => d.id === activeResolution?.disruptionId || d.traceId === activeResolution?.disruptionId);

  async function handleApprove(rank) {
    if (isApproving || !traceId || approvedRank || isExecuted) return;
    setIsApproving(true);
    try {
      const res = await fetch('/api/execute', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ traceId, rank }) });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || `HTTP ${res.status}`);
      setApprovedRank(rank);
      markResolutionExecuted(rank);
      setIsExecuted(true);
      toast.success(`Protocol ${rank} deployed successfully`);
      setTimeout(() => clearActiveDisruption(), 4500);
    } catch (err) {
      toast.error(`Operation failed: ${err.message}`);
      setIsApproving(false);
    }
  }

  useEffect(() => {
    approveRef.current = handleApprove;
  });

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        clearActiveDisruption();
        return;
      }
      if (!isApproving && ['1', '2', '3'].includes(event.key)) {
        approveRef.current?.(Number(event.key));
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isApproving, clearActiveDisruption]);

  const maxCostFound = Math.max(...(activeResolution?.options?.map(o => Math.abs(o.costDelta)) || [10000]));

  return (
    <AnimatePresence>
      {activeDisruptionId && !activeResolution?.options?.length ? (
        <LoadingSkeleton stage={agentStage} onDismiss={clearActiveDisruption} />
      ) : null}
      
      {activeResolution?.options?.length ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-overlay)] backdrop-blur-xl p-4">
          <motion.div 
            ref={modalRef}
            initial={{ scale: 0.95, opacity: 0, y: 24 }} 
            animate={{ scale: 1, opacity: 1, y: 0 }} 
            exit={{ scale: 0.95, opacity: 0, y: 12 }} 
            transition={{ type: 'spring', stiffness: 300, damping: 30 }} 
            className="w-full max-w-6xl glass-modal flex flex-col max-h-[92vh] overflow-hidden !shadow-[0_32px_120px_rgba(0,0,0,0.6)]"
          >
            <div className="flex items-start justify-between px-8 py-6 border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)]/20">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-4">
                  <h2 className="text-xl font-bold text-[var(--text-primary)] font-display tracking-tight uppercase">Strategic Resolution Dashboard</h2>
                  {disruption && <SeverityBadge severity={disruption.severity} />}
                </div>
                <div className="flex items-center gap-3 text-[11px] text-[var(--text-secondary)] font-medium">
                  <span className="flex items-center gap-1.5"><ShieldAlert className="w-3.5 h-3.5" /> High Cascade Risk Detected</span>
                  <span className="opacity-20">|</span>
                  <span>Origin: {disruption?.location || 'Unknown Node'}</span>
                </div>
              </div>
              <button 
                title="Esc" 
                onClick={clearActiveDisruption} 
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all p-2 rounded-xl hover:bg-[var(--bg-elevated)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-cyan)]/50"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="flex flex-col lg:grid lg:grid-cols-[1.4fr_0.6fr] gap-0 flex-1 overflow-hidden">
              {isExecuted ? (
                <div className="col-span-2 flex flex-col items-center justify-center p-12 text-center space-y-6 bg-black/5">
                  <div className="w-20 h-20 rounded-full bg-[var(--accent-green)]/10 flex items-center justify-center border border-[var(--accent-green)]/20 shadow-[0_0_40px_var(--accent-green)]/10">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', damping: 12, stiffness: 200 }}
                    >
                      <ShieldCheck className="w-10 h-10 text-[var(--accent-green)]" />
                    </motion.div>
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-2xl font-bold text-[var(--text-primary)] font-display uppercase tracking-tight">Execution Confirmed</h3>
                    <p className="text-sm text-[var(--text-secondary)] max-w-md mx-auto leading-relaxed">
                      Protocol rank {approvedRank} has been successfully deployed. Autonomous rerouting and carrier negotiations are now active.
                    </p>
                  </div>
                  <div className="pt-4 flex gap-4">
                    <ReportButton
                      disruption={disruption}
                      resolution={activeResolution?.options?.[approvedRank - 1] || activeResolution?.options?.[0]}
                      options={activeResolution?.options || []}
                      impactReport={activeResolution?.impactReport}
                      traceId={activeResolution?.traceId}
                    />
                    <button 
                      onClick={clearActiveDisruption}
                      className="px-8 py-3 rounded-xl bg-[var(--accent-cyan)] text-[#020617] text-xs font-bold uppercase tracking-widest hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-cyan-500/10"
                    >
                      Close Dashboard
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="p-8 overflow-y-auto custom-scrollbar space-y-8 bg-black/5">
                    <div className="flex flex-col md:flex-row gap-6">
                      {activeResolution.options.map((option) => (
                        <OptionCard 
                          key={option.rank} 
                          option={option} 
                          onApprove={handleApprove} 
                          isApproving={isApproving} 
                          isSelected={approvedRank === option.rank} 
                          shortcutKey={option.rank}
                          maxCost={maxCostFound}
                        />
                      ))}
                    </div>
                    
                    {activeResolution.analysisText && (
                      <div className="p-5 rounded-2xl border border-[var(--accent-red)]/20 bg-[var(--accent-red)]/5 flex gap-4">
                        <div className="w-8 h-8 rounded-full bg-[var(--accent-red)]/10 flex items-center justify-center shrink-0">
                          <ShieldAlert className="w-4 h-4 text-[var(--accent-red)]" />
                        </div>
                        <div className="space-y-1">
                          <p className="text-[10px] font-bold text-[var(--accent-red)] uppercase tracking-widest">Surgical Analysis</p>
                          <p className="text-[11px] text-[var(--text-primary)] leading-relaxed font-medium">{activeResolution.analysisText}</p>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="p-8 border-l border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-y-auto custom-scrollbar flex flex-col gap-8">
                    <RiskMatrix options={activeResolution.options} />
                    
                    <div className="space-y-4">
                      <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--text-muted)]">Operational Constraints</div>
                      <div className="space-y-3">
                        <div className="p-4 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
                          <div className="flex justify-between mb-1">
                            <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase">Impact Breadth</span>
                            <span className="text-[10px] font-mono font-bold text-[var(--accent-cyan)]">{activeResolution.urgency}/10</span>
                          </div>
                          <div className="h-1 bg-black/20 rounded-full overflow-hidden">
                            <div className="h-full bg-[var(--accent-cyan)]" style={{ width: `${activeResolution.urgency * 10}%` }} />
                          </div>
                        </div>
                        <div className="p-4 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
                          <div className="flex justify-between mb-1">
                            <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase">Complexity Index</span>
                            <span className="text-[10px] font-mono font-bold text-[var(--accent-amber)]">Medium</span>
                          </div>
                          <div className="h-1 bg-black/20 rounded-full overflow-hidden">
                            <div className="h-full bg-[var(--accent-amber)]" style={{ width: '65%' }} />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-auto p-4 rounded-2xl bg-[var(--bg-elevated)]/30 border border-dashed border-[var(--border-subtle)]">
                      <p className="text-[10px] text-[var(--text-muted)] leading-relaxed font-medium italic">
                        Strategy synthesis derived from real-time maritime tracking and predictive weather modeling. Trace: <span className="font-mono opacity-60">{traceId}</span>
                      </p>
                    </div>

                    <ReportButton
                      disruption={disruption}
                      resolution={activeResolution?.options?.[0]}
                      options={activeResolution?.options || []}
                      impactReport={activeResolution?.impactReport}
                      traceId={activeResolution?.traceId}
                    />
                  </div>
                </>
              )}
            </div>
            
            <div className="px-8 py-3 bg-[var(--bg-elevated)]/40 border-t border-[var(--border-subtle)] flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Collective Intelligence Version 4.2-Stable</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-[10px] font-mono text-[var(--text-muted)]">SYSTEM_MODE: SYNTHETIC_DECISION_READY</span>
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
