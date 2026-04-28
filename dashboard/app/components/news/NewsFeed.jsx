'use client';

import { useState } from 'react';
import { RotateCw, ExternalLink, ShieldCheck, AlertTriangle } from 'lucide-react';
import { useAlertStore } from '../../store/alertStore.js';

const ICONS = {
  WEATHER: '🌊',
  STRIKE: '✊',
  GEOPOLITICAL: '⚡',
  INFRASTRUCTURE: '🔧',
  OTHER: '🛰️',
};

const CATEGORY_COLORS = {
  WEATHER: 'var(--accent-blue)',
  STRIKE: 'var(--accent-amber)',
  GEOPOLITICAL: 'var(--accent-red)',
  INFRASTRUCTURE: 'var(--accent-cyan)',
  OTHER: 'var(--text-muted)',
};

export default function NewsFeed() {
  const newsAlerts = useAlertStore((state) => state.newsAlerts);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState(null);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setRefreshError(null);
    try {
      const response = await fetch('/api/news-poll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    } catch (err) {
      setRefreshError(err.message);
      setTimeout(() => setRefreshError(null), 3000);
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-transparent">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)] glass-panel !rounded-none !border-t-0 !border-x-0 !border-b shadow-none flex-shrink-0">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--accent-cyan)] mb-0.5">Intelligence Feed</p>
          <p className="text-[10px] text-[var(--text-primary)] font-bold tracking-tight truncate">Real-time Global Supply Signals</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          <span className="text-[9px] font-bold tracking-[0.1em] bg-[var(--accent-cyan)]/10 px-2 py-1 rounded-md border border-[var(--accent-cyan)]/20 text-[var(--accent-cyan)] whitespace-nowrap">
            {newsAlerts.length} SIGNALS
          </span>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50 text-[var(--text-secondary)] hover:text-[var(--accent-cyan)] hover:border-[var(--accent-cyan)]/40 transition-all disabled:opacity-50 shadow-sm flex-shrink-0"
          >
            <RotateCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {refreshError && (
        <div className="mx-2 mt-2 px-3 py-2 bg-[var(--accent-red)]/10 text-[var(--accent-red)] text-[9px] font-bold uppercase tracking-wider rounded-lg border border-[var(--accent-red)]/20 flex-shrink-0">
          Error: {refreshError}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3 min-h-0">
        {!newsAlerts.length ? (
          <div className="h-full flex flex-col items-center justify-center text-center py-8 px-3">
            <div className="w-12 h-12 rounded-lg bg-[var(--bg-elevated)]/50 flex items-center justify-center mb-3 border border-[var(--border-subtle)]">
              <ShieldCheck className="w-6 h-6 text-[var(--text-muted)]" />
            </div>
            <div className="space-y-1.5 mb-3">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--text-primary)]">Scanning Horizons</h3>
              <p className="text-[9px] text-[var(--text-secondary)] max-w-[160px] leading-snug">
                No critical disruptions detected. Scanning active.
              </p>
            </div>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="px-3 py-1.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[9px] font-bold uppercase tracking-[0.15em] text-[var(--text-primary)] hover:border-[var(--accent-cyan)]/40 hover:text-[var(--accent-cyan)] transition-all disabled:opacity-50"
            >
              {isRefreshing ? 'Syncing...' : 'Refresh'}
            </button>
          </div>
        ) : (
          newsAlerts.map((alert) => {
            const importance = Math.round((alert.relevanceScore || 0) * 100);
            const color = CATEGORY_COLORS[alert.disruptionType] || CATEGORY_COLORS.OTHER;
            const isHighSeverity = alert.severity >= 8;

            return (
              <article
                key={alert.id}
                className={`group relative flex flex-col glass-panel !bg-[var(--glass-bg)]/30 hover:!bg-[var(--glass-bg-elevated)]/50 transition-all duration-500 p-5 ${isHighSeverity ? '!border-[var(--accent-red)]/40 shadow-[0_8px_32px_rgba(239,68,68,0.12)]' : 'hover:!border-[var(--accent-cyan)]/30 hover:shadow-xl hover:shadow-cyan-500/5'}`}
              >
                {isHighSeverity && (
                  <div className="absolute top-4 right-4 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--accent-red)]/10 text-[var(--accent-red)] text-[9px] font-bold uppercase tracking-[0.15em] border border-[var(--accent-red)]/20 animate-pulse z-10">
                    <AlertTriangle className="w-3 h-3" />
                    Critical
                  </div>
                )}

                <div className="flex items-start gap-5 relative z-10">
                  <div className="w-14 h-14 shrink-0 rounded-[20px] bg-[var(--bg-elevated)]/80 border border-[var(--border-subtle)] flex items-center justify-center text-3xl shadow-inner group-hover:scale-110 transition-all duration-500 group-hover:rotate-3 group-hover:border-[var(--accent-cyan)]/30">
                    {ICONS[alert.disruptionType] || ICONS.OTHER}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-[10px] font-bold uppercase tracking-[0.15em]" style={{ color }}>
                        {alert.disruptionType || 'General'}
                      </span>
                      <span className="w-1 h-1 rounded-full bg-[var(--border-strong)] opacity-50" />
                      <span className="text-[10px] font-mono text-[var(--text-muted)] font-bold">LVL {alert.severity}/10</span>
                      <div className="flex-1" />
                      <div className={`px-2.5 py-1 rounded-lg border text-[9px] font-mono font-bold tracking-tighter ${importance >= 85 ? 'bg-[var(--accent-red)]/10 border-[var(--accent-red)]/30 text-[var(--accent-red)] shadow-[0_0_12px_rgba(239,68,68,0.1)]' : 'bg-[var(--bg-elevated)] border-[var(--border-subtle)] text-[var(--text-primary)]'}`}>
                        {importance}% MATCH
                      </div>
                    </div>

                    <h3 className="text-sm font-bold text-[var(--text-primary)] leading-snug tracking-tight mb-2 group-hover:text-[var(--accent-cyan)] transition-colors duration-300">
                      {alert.headline}
                    </h3>
                    
                    <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed line-clamp-2 font-medium">
                      {alert.summary || alert.location || 'Synthetic intelligence extraction in progress...'}
                    </p>
                  </div>
                </div>

                {/* Source Provenance Bar */}
                <div className="mt-5 pt-4 border-t border-[var(--border-subtle)] flex items-center justify-between relative z-10">
                  <div className="flex gap-2">
                    {alert.affectedCorridors?.slice(0, 2).map((c) => (
                      <span key={c} className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)] bg-[var(--bg-elevated)]/60 px-2.5 py-1 rounded-md border border-[var(--border-subtle)] shadow-sm">
                        {c}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)] group-hover:text-[var(--text-primary)] transition-all cursor-pointer">
                    <div className="w-1.5 h-1.5 rounded-full bg-current opacity-40 group-hover:bg-[var(--accent-cyan)]" />
                    {alert.source || 'Intelligence Cache'}
                    <ExternalLink className="w-3 h-3 ml-1 opacity-50 group-hover:opacity-100" />
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}