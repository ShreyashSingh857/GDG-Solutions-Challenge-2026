'use client';

import { useState } from 'react';
import { RotateCw } from 'lucide-react';
import { useNewsAlerts } from '../../hooks/useNewsAlerts.js';
import { useAlertStore } from '../../store/alertStore.js';

const ICONS = {
  WEATHER: '🌊',
  STRIKE: '✊',
  GEOPOLITICAL: '⚡',
  INFRASTRUCTURE: '🔧',
  OTHER: '🛰️',
};

const CHIP_STYLES = {
  WEATHER: 'bg-sky-500/10 text-sky-200 border-sky-400/20',
  STRIKE: 'bg-orange-500/10 text-orange-200 border-orange-400/20',
  GEOPOLITICAL: 'bg-red-500/10 text-red-200 border-red-400/20',
  INFRASTRUCTURE: 'bg-amber-500/10 text-amber-200 border-amber-400/20',
  OTHER: 'bg-white/5 text-white/60 border-white/10',
};

export default function NewsFeed() {
  useNewsAlerts();
  const newsAlerts = useAlertStore((state) => state.newsAlerts);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState(null);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setRefreshError(null);
    try {
      const newsAgentUrl = process.env.NEXT_PUBLIC_NEWS_AGENT_URL || 'http://localhost:3005';
      const response = await fetch(`${newsAgentUrl}/news/poll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        throw new Error(`Failed to refresh news: HTTP ${response.status}`);
      }

      const result = await response.json();
      if (result.error) {
        throw new Error(result.error);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to refresh news';
      setRefreshError(message);
      setTimeout(() => setRefreshError(null), 3000);
    } finally {
      setIsRefreshing(false);
    }
  };

  if (!newsAlerts.length) {
    return (
      <div
        className="flex h-full flex-col items-center justify-center rounded-2xl border border-white/5 px-4 text-center shadow-[0_24px_70px_rgba(0,0,0,0.35)]"
        style={{ minHeight: 220, background: 'linear-gradient(180deg,rgba(2,6,23,0.88),rgba(15,23,42,0.72))' }}
      >
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-cyan-400/20 bg-cyan-400/10 text-xl text-cyan-200">
          📡
        </div>
        <p className="text-sm font-semibold tracking-wide text-white">Monitoring global news</p>
        <p className="mt-1 text-xs leading-5 text-white/45" style={{ maxWidth: 240 }}>
          Live headlines will appear here when supply-chain relevant events cross the relevance gate.
        </p>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col gap-3 rounded-2xl border border-white/5 p-3 shadow-[0_24px_70px_rgba(0,0,0,0.35)]"
      style={{ background: 'linear-gradient(180deg,rgba(2,6,23,0.95),rgba(8,15,36,0.9))' }}
    >
      <div className="flex items-center justify-between border-b border-white/5 pb-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-300/80">News Intelligence</p>
          <p className="text-xs text-white/40">Auto-classified supply-chain signals</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-medium text-white/50">
            {newsAlerts.length} alerts
          </span>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="rounded-lg border border-white/10 bg-white/5 p-1 text-white/50 hover:border-cyan-400/40 hover:bg-cyan-400/10 hover:text-cyan-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title={isRefreshing ? 'Refreshing news...' : 'Refresh news from GDELT'}
            aria-label="Refresh news alerts"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
          </button>
        </div>
      </div>
      {refreshError && (
        <div className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-xs text-red-300">
          {refreshError}
        </div>
      )}

      <div className="flex max-h-[28vh] flex-col gap-2 overflow-y-auto pr-1 custom-scrollbar">
        {newsAlerts.map((alert) => {
          const pct = Math.round((alert.relevanceScore || 0) * 100);
          const icon = ICONS[alert.disruptionType] || ICONS.OTHER;
          const chipClass = CHIP_STYLES[alert.disruptionType] || CHIP_STYLES.OTHER;
          const corridors = Array.isArray(alert.affectedCorridors) ? alert.affectedCorridors.slice(0, 3) : [];

          return (
            <article
              key={alert.id}
              className="group rounded-xl border border-white/5 bg-white/3 p-3 transition-colors duration-200 hover:border-cyan-400/20 hover:bg-white/5"
            >
              <div className="flex items-start gap-3">
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${chipClass}`}>
                  <span className="text-lg leading-none">{icon}</span>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/55">
                      {alert.disruptionType || 'OTHER'}
                    </span>
                    <span className="text-[11px] text-white/35">Sev {alert.severity}/10</span>
                  </div>

                  <h3 className="mt-2 text-sm font-semibold leading-5 text-white">
                    {alert.headline}
                  </h3>
                  <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-white/55">
                    {alert.summary || alert.location || 'No summary available.'}
                  </p>
                </div>

                <div className={`shrink-0 rounded-lg border px-2 py-1 text-[11px] font-bold ${pct >= 85 ? 'border-red-400/25 bg-red-400/10 text-red-200' : pct >= 70 ? 'border-orange-400/25 bg-orange-400/10 text-orange-200' : 'border-white/10 bg-white/5 text-white/55'}`}>
                  {pct}%
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {corridors.map((corridor) => (
                  <span key={corridor} className="rounded-full border border-white/10 bg-white/4 px-2 py-0.5 text-[10px] text-white/55">
                    {corridor}
                  </span>
                ))}
                <span className="ml-auto text-[10px] uppercase tracking-[0.2em] text-white/30">
                  {alert.source || 'Unknown source'}
                </span>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}