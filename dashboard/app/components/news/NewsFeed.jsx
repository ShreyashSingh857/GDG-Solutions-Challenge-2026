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
    <div className="flex flex-col h-full bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-default)] shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)]/20">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--accent-cyan)]">Intelligence Feed</p>
          <p className="text-[11px] text-[var(--text-muted)] font-medium">Auto-classified global supply signals</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-mono font-bold bg-[var(--bg-elevated)] px-2 py-1 rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)]">
            {newsAlerts.length} SIGNALS
          </span>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:text-[var(--accent-cyan)] hover:border-[var(--accent-cyan)]/40 transition-all disabled:opacity-50"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {refreshError && (
        <div className="m-4 px-4 py-2 bg-[var(--accent-red)]/10 text-[var(--accent-red)] text-[11px] font-bold uppercase tracking-wider rounded-xl border border-[var(--accent-red)]/20">
          Source Error: {refreshError}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
        {!newsAlerts.length ? (
          <div className="h-full flex flex-col items-center justify-center text-center opacity-30 py-20 px-6">
            <div className="w-16 h-16 rounded-3xl bg-[var(--bg-elevated)] flex items-center justify-center mb-6 border border-[var(--border-subtle)]">
              <ShieldCheck className="w-8 h-8" />
            </div>
            <p className="text-sm font-bold uppercase tracking-widest text-[var(--text-primary)]">Scanning Horizons</p>
            <p className="text-[11px] text-[var(--text-secondary)] mt-2 leading-relaxed">
              Waiting for supply chain relevant signals to cross the importance threshold.
            </p>
          </div>
        ) : (
          newsAlerts.map((alert) => {
            const importance = Math.round((alert.relevanceScore || 0) * 100);
            const color = CATEGORY_COLORS[alert.disruptionType] || CATEGORY_COLORS.OTHER;
            const isHighSeverity = alert.severity >= 8;

            return (
              <article
                key={alert.id}
                className={`group relative flex flex-col rounded-2xl border bg-[var(--bg-elevated)]/30 transition-all duration-300 hover:bg-[var(--bg-elevated)]/60 p-5 ${isHighSeverity ? 'border-[var(--accent-red)]/20 shadow-[0_4px_24px_rgba(239,68,68,0.08)]' : 'border-[var(--border-subtle)]'}`}
              >
                {isHighSeverity && (
                  <div className="absolute top-4 right-4 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[var(--accent-red)]/10 text-[var(--accent-red)] text-[9px] font-bold uppercase tracking-wider border border-[var(--accent-red)]/20 animate-pulse">
                    <AlertTriangle className="w-2.5 h-2.5" />
                    Critical
                  </div>
                )}

                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 shrink-0 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] flex items-center justify-center text-2xl shadow-inner group-hover:scale-105 transition-transform duration-300">
                    {ICONS[alert.disruptionType] || ICONS.OTHER}
                  </div>

                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color }}>
                        {alert.disruptionType || 'General'}
                      </span>
                      <span className="text-[10px] font-mono text-[var(--text-secondary)] font-bold">SEV {alert.severity}/10</span>
                      <div className="flex-1" />
                      <div className={`px-2 py-0.5 rounded-lg border text-[10px] font-mono font-bold ${importance >= 85 ? 'bg-[var(--accent-red)]/10 border-[var(--accent-red)]/20 text-[var(--accent-red)]' : 'bg-[var(--bg-elevated)] border-[var(--border-default)] text-[var(--text-primary)]'}`}>
                        {importance}% MATCH
                      </div>
                    </div>

                    <h3 className="text-sm font-bold text-[var(--text-primary)] leading-snug tracking-tight font-display mb-1">
                      {alert.headline}
                    </h3>
                    
                    <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed line-clamp-2 font-medium">
                      {alert.summary || alert.location || 'Synthetic extraction in progress...'}
                    </p>
                  </div>
                </div>

                {/* Source Provenance Bar */}
                <div className="mt-4 pt-4 border-t border-[var(--border-subtle)] flex items-center justify-between">
                  <div className="flex gap-2">
                    {alert.affectedCorridors?.slice(0, 2).map((c) => (
                      <span key={c} className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-secondary)] bg-[var(--bg-elevated)] px-2 py-1 rounded-md border border-[var(--border-default)]">
                        {c}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)] opacity-80 group-hover:opacity-100 transition-opacity">
                    <div className="w-1.5 h-1.5 rounded-full bg-current opacity-40" />
                    {alert.source || 'Intelligence Cache'}
                    <ExternalLink className="w-3 h-3 ml-1" />
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