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
  const prevLengthRef = useRef(0);

  useEffect(() => {
    if (disruptions.length > prevLengthRef.current) {
      const newest = disruptions[0];
      if (!newest) return;

      const icon = TYPE_ICONS[newest.type] || '📡';
      const zones = (newest.affectedZones || []).slice(0, 3).join(', ') || 'Multiple zones';
      const borderColor = newest.severity >= 8 ? '#dc2626' : newest.severity >= 6 ? '#ea580c' : '#ca8a04';

      toast(
        <div className="flex flex-col gap-1 min-w-[260px]">
          <div className="flex items-center gap-2">
            <span className="text-lg">{icon}</span>
            <div>
              <p className="font-semibold text-white text-sm">
                {newest.type} — Severity {newest.severity}/10
              </p>
              <p className="text-white/70 text-xs">{newest.location}</p>
            </div>
          </div>
          <p className="text-white/50 text-xs">{zones} affected</p>
          <button
            className="mt-1 text-xs bg-white/10 hover:bg-white/20 text-white px-3 py-1 rounded-lg transition-colors text-left"
            onClick={() => {
              useAlertStore.getState().addDisruption(newest);
            }}
          >
            View Options →
          </button>
        </div>,
        {
          duration: 15000,
          style: {
            background: '#111827',
            border: `1px solid ${borderColor}40`,
            borderLeft: `4px solid ${borderColor}`,
            color: '#f9fafb',
          },
        }
      );
    }
    prevLengthRef.current = disruptions.length;
  }, [disruptions]);

  return null;
}
