'use client';

import { useMemo } from 'react';
import { useAlertStore } from '../../store/alertStore.js';
import { useShipmentStore } from '../../store/shipmentStore.js';

const ICON_BY_TYPE = {
  WEATHER: '🌊',
  STRIKE: '✊',
  GEOPOLITICAL: '⚠️',
  INFRASTRUCTURE: '🛠️',
  OTHER: '📡',
};

export default function MobileView() {
  const shipments = useShipmentStore((s) => s.shipments);
  const disruptions = useAlertStore((s) => s.disruptions);

  const delayed = useMemo(
    () => shipments.filter((s) => (s.status || '').toLowerCase() === 'delayed').slice(0, 12),
    [shipments]
  );

  return (
    <section className="h-full overflow-y-auto p-4 space-y-4">
      <header className="rounded-xl border border-white/10 bg-white/5 p-3">
        <p className="text-[11px] uppercase tracking-[0.25em] text-cyan-300/75">Mobile Operations Feed</p>
        <p className="mt-1 text-xs text-white/55">Optimized fallback while desktop globe remains available.</p>
      </header>

      <div className="space-y-3">
        {disruptions.slice(0, 4).map((d) => (
          <article key={d.id} className="rounded-xl border border-red-500/30 bg-red-500/10 p-3">
            <div className="flex items-start gap-2">
              <span className="text-lg leading-none">{ICON_BY_TYPE[d.type] || ICON_BY_TYPE.OTHER}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white truncate">{d.type || 'DISRUPTION'} - {d.location || 'Unknown'}</p>
                <p className="text-xs text-white/60">Severity {Number(d.severity || 0)}/10</p>
              </div>
            </div>
          </article>
        ))}
      </div>

      <div>
        <p className="mb-2 text-[11px] uppercase tracking-[0.24em] text-white/45">Delayed Shipments ({delayed.length})</p>
        <div className="space-y-2">
          {delayed.map((s) => (
            <article key={s.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="text-sm text-white truncate">{s.origin} -&gt; {s.destination}</p>
              <p className="text-xs text-white/50">{s.carrier || 'Carrier unknown'} - ${((Number(s.cargoValueUSD || 0)) / 1e6).toFixed(1)}M</p>
            </article>
          ))}
          {!delayed.length ? (
            <p className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-white/45">No delayed shipments right now.</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
