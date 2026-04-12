'use client';

import { useState, useEffect } from 'react';
import { connectAgentStatusPolling } from '../../lib/websocket.js';

const STATUS_CONFIG = {
  idle: { label: 'Idle', color: 'bg-gray-400', textColor: 'text-gray-300' },
  monitor: { label: 'Monitor', color: 'bg-yellow-400 animate-pulse', textColor: 'text-yellow-300' },
  impact: { label: 'Impact', color: 'bg-orange-400 animate-pulse', textColor: 'text-orange-300' },
  negotiator: { label: 'Negotiator', color: 'bg-purple-400 animate-pulse', textColor: 'text-purple-300' },
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

  return (
    <div className="absolute top-4 right-4 z-20 flex items-center gap-2 bg-black/60 backdrop-blur-sm border border-white/10 rounded-full px-3 py-1.5">
      <span className={`w-2 h-2 rounded-full ${config.color}`} />
      <span className={`text-xs font-medium ${config.textColor}`}>
        {config.label} Agent
      </span>
    </div>
  );
}
