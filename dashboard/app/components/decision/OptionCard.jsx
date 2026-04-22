'use client';

import { Check, Loader2, ShieldAlert } from 'lucide-react';
import { motion } from 'framer-motion';
import CostTimeChart from './CostTimeChart.jsx';
import FeedbackThumb from './FeedbackThumb.jsx';

function formatMoney(value) {
  return `$${Number(value || 0).toLocaleString()}`;
}

function formatCarbon(value) {
  return `${Math.round(Number(value || 0) / 1000).toLocaleString()}t CO2`;
}

const CFG = {
  1: { 
    label: 'Recommended', 
    badge: 'bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)] border-[var(--accent-cyan)]/20', 
    accent: 'var(--accent-cyan)',
    btn: 'bg-[var(--accent-cyan)] hover:brightness-110 text-[#020617]' 
  },
  2: { 
    label: 'Fastest Path', 
    badge: 'bg-[var(--accent-blue)]/10 text-[var(--accent-blue)] border-[var(--accent-blue)]/20', 
    accent: 'var(--accent-blue)',
    btn: 'bg-[var(--accent-blue)] hover:brightness-110 text-white' 
  },
  3: { 
    label: 'Cost Efficient', 
    badge: 'bg-[var(--accent-amber)]/10 text-[var(--accent-amber)] border-[var(--accent-amber)]/20', 
    accent: 'var(--accent-amber)',
    btn: 'bg-[var(--bg-elevated)] hover:bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-subtle)]' 
  },
};

export default function OptionCard({ option, onApprove, isApproving, isSelected, shortcutKey, maxCost = 10000 }) {
  const c = CFG[option.rank] || CFG[3];
  const relativeCost = Math.min((Math.abs(option.costDelta || 0) / maxCost) * 100, 100);

  return (
    <motion.div 
      layout
      className={`relative flex flex-col gap-4 bg-[var(--bg-surface)] rounded-2xl border p-5 flex-1 min-w-0 transition-all duration-500 overflow-hidden ${isSelected ? 'border-[var(--accent-green)]/50 shadow-[0_0_40px_rgba(34,197,94,0.1)]' : 'border-[var(--border-default)]'}`}
      style={{ opacity: !isSelected && isApproving ? 0.3 : 1 }}
    >
      {/* Background sweep animation for selected state */}
      {isSelected && (
        <motion.div 
          initial={{ x: '-100%' }}
          animate={{ x: '0%' }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="absolute inset-0 bg-gradient-to-r from-[var(--accent-green)]/5 via-[var(--accent-green)]/10 to-transparent pointer-events-none"
        />
      )}

      <div className="flex items-center justify-between relative z-10">
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${c.badge}`}>
          {c.label}
        </span>
        <span className="text-[10px] text-[var(--text-muted)] font-mono font-bold tracking-tight">
          {Math.round((option.confidence || 0) * 100)}% RELIABILITY
        </span>
      </div>

      <div className="space-y-1 relative z-10">
        <h3 className="text-sm font-bold text-[var(--text-primary)] leading-tight font-display tracking-tight uppercase">{option.title}</h3>
        <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">{option.description}</p>
      </div>

      {option.sanctionsWarning ? (
        <div className="relative z-10 rounded-xl border border-[var(--accent-amber)]/20 bg-[var(--accent-amber)]/5 px-3 py-2 flex gap-2 items-start">
          <ShieldAlert className="w-3.5 h-3.5 text-[var(--accent-amber)] shrink-0 mt-0.5" />
          <p className="text-[10px] leading-relaxed text-[var(--accent-amber)]">{option.sanctionsWarning}</p>
        </div>
      ) : null}

      <div className="relative z-10 py-1">
        <CostTimeChart costDelta={option.costDelta} timeDelta={option.timeDelta} carbonDeltaKg={option.carbonDeltaKg} />
      </div>

      <div className="grid grid-cols-2 gap-2 relative z-10">
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/40 px-3 py-2">
          <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--text-muted)]">Carbon Offset</div>
          <div className="mt-1 text-[11px] font-bold text-[var(--text-primary)]">{formatCarbon(option.carbonDeltaKg)}</div>
        </div>
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/40 px-3 py-2">
          <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--text-muted)]">Agency Score</div>
          <div className="mt-1 text-[11px] font-bold text-[var(--text-primary)]">{option.corridorRisk || 'Low Risk'}</div>
        </div>
      </div>

      {/* Relative Cost Indicator */}
      <div className="space-y-1.5 relative z-10">
        <div className="flex justify-between text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
          <span>Cost Magnitude</span>
          <span>{formatMoney(option.costDelta)}</span>
        </div>
        <div className="h-1.5 w-full bg-[var(--bg-elevated)] rounded-full overflow-hidden border border-[var(--border-subtle)]">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${relativeCost}%` }}
            transition={{ duration: 1, delay: 0.5 }}
            className="h-full rounded-full"
            style={{ backgroundColor: c.accent }}
          />
        </div>
      </div>

      <div className="mt-auto pt-3 relative z-10">
        {isSelected ? (
          <div className="flex items-center justify-between text-xs font-bold text-[var(--accent-green)] uppercase tracking-widest bg-[var(--accent-green)]/10 p-2 rounded-xl border border-[var(--accent-green)]/20 animate-in fade-in zoom-in duration-300">
            <span className="flex items-center gap-2">
              <Check className="w-4 h-4" />
              Confirmation Executed
            </span>
            <FeedbackThumb traceId={option.traceId} rank={option.rank} />
          </div>
        ) : (
          <div className="space-y-3">
             <button 
              onClick={() => onApprove(option.rank)} 
              disabled={isApproving} 
              className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold uppercase tracking-widest transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2 ${c.btn}`}
            >
              {isApproving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {isApproving ? 'Executing Protocol...' : 'Confirm Strategy'}
            </button>
            <div className="flex items-center justify-center gap-2">
              <span className="text-[10px] text-[var(--text-muted)] font-medium">Auto-execute available</span>
              <kbd className="inline-flex items-center justify-center w-5 h-5 rounded border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-[10px] font-mono text-[var(--text-primary)] font-bold shadow-[inset_0_-1px_0_rgba(0,0,0,0.3)]">
                {shortcutKey}
              </kbd>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
