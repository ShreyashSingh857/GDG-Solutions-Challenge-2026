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
      const borderColor = newest.severity >= 8 ? '#dc2626' : newest.severity >= 6 ? '#ea580c' : '#ca8a04';

      toast(
        <div className="flex flex-col gap-1 min-w-[260px]">
          <div className="flex items-center gap-2">
            <span className="text-lg">{icon}</span>
            <div>
              <p className="font-semibold text-[var(--text-primary)] text-sm">
                {newest.type} — Severity {newest.severity}/10
              </p>
              <p className="text-[var(--text-secondary)] text-xs">{newest.location}</p>
            </div>
          </div>
          <p className="text-[var(--text-muted)] text-xs">{zones} affected</p>
          <button
            className="mt-1 text-xs bg-[var(--bg-elevated)] hover:bg-[var(--bg-base)] text-[var(--text-primary)] px-3 py-1 rounded-lg border border-[var(--border-default)] transition-colors text-left"
            onClick={() => {
              useAlertStore.getState().setActiveDisruptionId(id);
            }}
          >
            View Options →
          </button>
        </div>,
        {
          duration: 15000,
          style: {
            background: 'var(--bg-surface)',
            border: `1px solid ${borderColor}40`,
            borderLeft: `4px solid ${borderColor}`,
            color: 'var(--text-primary)',
          },
        }
      );
    }
    prevLengthRef.current = disruptions.length;
  }, [disruptions]);

  return null;
}
