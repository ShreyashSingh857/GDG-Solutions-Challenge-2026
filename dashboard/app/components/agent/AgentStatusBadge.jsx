'use client';

import { useState, useEffect } from 'react';
import { connectAgentStatusPolling } from '../../lib/agentPolling.js';

const STATUS_CONFIG = {
  idle: { label: 'Idle', color: 'bg-[var(--text-muted)]/40', textColor: 'text-[var(--text-muted)]' },
  monitor: { label: 'Monitor', color: 'bg-[var(--accent-amber)]', textColor: 'text-[var(--accent-amber)]' },
  impact: { label: 'Impact', color: 'bg-[var(--accent-red)]', textColor: 'text-[var(--accent-red)]' },
  negotiator: { label: 'Negotiator', color: 'bg-purple-400', textColor: 'text-purple-300' },
  resolved: { label: 'Resolved', color: 'bg-[var(--accent-blue)]', textColor: 'text-[var(--accent-blue)]' },
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
    <div className="absolute top-18 right-6 z-40 flex items-center gap-3 glass-panel px-4 py-2 shadow-2xl transition-all duration-500">
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
