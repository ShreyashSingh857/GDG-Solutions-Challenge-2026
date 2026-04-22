'use client';

import { useState, useEffect } from 'react';
import { connectAgentStatusPolling } from '../../lib/agentPolling.js';

const STATUS_CONFIG = {
  idle: { label: 'Idle', color: 'bg-slate-400', textColor: 'text-slate-300' },
  monitor: { label: 'Monitor', color: 'bg-yellow-400', textColor: 'text-yellow-300' },
  impact: { label: 'Impact', color: 'bg-orange-400', textColor: 'text-orange-300' },
  negotiator: { label: 'Negotiator', color: 'bg-purple-400', textColor: 'text-purple-300' },
  resolved: { label: 'Resolved', color: 'bg-blue-400', textColor: 'text-blue-300' },
};

/**
 * Floating badge showing which agent is currently active.
 * Polls agent health endpoints every 3 seconds.
 */
export default function AgentStatusBadge() {
  const [status, setStatus] = useState('idle');

  useEffect(() => {
    const cleanup = connectAgentStatusPolling(setStatus);
    return cleanup;
  }, []);

  const config = STATUS_CONFIG[status] || STATUS_CONFIG.idle;
  const isSurgical = status !== 'idle' && status !== 'resolved';

  return (
    <div className="absolute top-18 right-6 z-40 flex items-center gap-3 bg-[var(--bg-overlay)] backdrop-blur-xl border border-[var(--border-subtle)] rounded-2xl px-4 py-2 shadow-2xl transition-all duration-500">
      <div className="relative flex items-center justify-center">
        {isSurgical && (
          <span className={`absolute inset-0 rounded-full animate-ping opacity-30 ${config.color}`} />
        )}
        <span className={`w-2.5 h-2.5 rounded-full ${config.color} shadow-[0_0_10px_rgba(255,255,255,0.3)]`} />
      </div>
      <div>
        <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--text-muted)] leading-none mb-1">System Agency</div>
        <div className={`text-[11px] font-bold tracking-tight uppercase ${config.textColor}`}>
          {config.label} <span className="opacity-50 text-[var(--text-muted)] ml-0.5">Active</span>
        </div>
      </div>
    </div>
  );
}
