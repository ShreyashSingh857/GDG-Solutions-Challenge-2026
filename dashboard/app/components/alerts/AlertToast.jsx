'use client';

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useAlertStore } from '../../store/alertStore.js';

const TYPE_ICONS = {
  WEATHER: '🌊',
  STRIKE: '✊',
  GEOPOLITICAL: '⚠️',
  INFRASTRUCTURE: '🔧',
  OTHER: '📡',
};

/**
 * Watches the alert store for new disruptions and fires a toast notification.
 * Renders nothing — place <Toaster> in page.js or layout.js.
 */
export default function AlertToastController() {
  const disruptions = useAlertStore((s) => s.disruptions);
  const prevLengthRef = useRef(null);
  const seenIdsRef = useRef(new Set());

  useEffect(() => {
    // Record initial snapshot as baseline so existing disruptions do not trigger toasts.
    if (prevLengthRef.current === null) {
      prevLengthRef.current = disruptions.length;
      disruptions.forEach((d) => seenIdsRef.current.add(d.id || d.traceId));
      return;
    }

    if (disruptions.length > prevLengthRef.current) {
      const newest = disruptions[0];
      if (!newest) return;

      const id = newest.id || newest.traceId;
      if (seenIdsRef.current.has(id)) {
        prevLengthRef.current = disruptions.length;
        return;
      }
      seenIdsRef.current.add(id);

      const icon = TYPE_ICONS[newest.type] || '📡';
      const zones = (newest.affectedZones || []).slice(0, 3).join(', ') || 'Multiple zones';
      const borderColor = newest.severity >= 8 ? 'var(--accent-red)' : newest.severity >= 6 ? 'var(--accent-amber)' : 'var(--accent-cyan)';

      toast(
        <div className="flex flex-col gap-1 min-w-[260px]">
          <div className="flex items-center gap-2">
            <span className="text-lg">{icon}</span>
            <div>
              <p className="font-bold text-[var(--text-primary)] text-sm uppercase tracking-tight">
                {newest.type} — {newest.severity}/10
              </p>
              <p className="text-[var(--text-secondary)] text-[11px] font-medium">{newest.location}</p>
            </div>
          </div>
          <p className="text-[var(--text-muted)] text-[10px] font-bold uppercase tracking-widest mt-1 opacity-70">{zones} affected</p>
          <button
            className="mt-2 text-[10px] font-bold uppercase tracking-widest bg-[var(--bg-elevated)] hover:bg-[var(--bg-overlay)] text-[var(--text-primary)] px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] transition-all text-center active:scale-95"
            onClick={() => {
              useAlertStore.getState().setActiveDisruptionId(id);
            }}
          >
            Protocol Analysis →
          </button>
        </div>,
        {
          duration: 15000,
          style: {
            background: 'var(--glass-bg-elevated)',
            backdropFilter: 'blur(16px)',
            border: `1px solid ${borderColor}`,
            borderLeft: `6px solid ${borderColor}`,
            borderRadius: '16px',
            color: 'var(--text-primary)',
            boxShadow: '0 20px 40px -12px rgba(0,0,0,0.5)',
          },
        }
      );
    }
    prevLengthRef.current = disruptions.length;
  }, [disruptions]);

  return null;
}
