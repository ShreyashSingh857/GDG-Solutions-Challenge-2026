'use client';

import { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Plane,
  Ship,
  Train,
  Truck,
} from 'lucide-react';
import StatusPill from './StatusPill.jsx';

const MODE_ICONS = {
  'sea-freight': Ship,
  'air-freight': Plane,
  rail: Train,
  road: Truck,
};

const PAY_COLORS = {
  paid: 'bg-green-500/15 text-green-300 border-green-400/20',
  pending: 'bg-yellow-500/15 text-yellow-300 border-yellow-400/20',
  overdue: 'bg-red-500/15 text-red-300 border-red-400/20',
  partial: 'bg-orange-500/15 text-orange-300 border-orange-400/20',
};

/**
 * @param {{ shipments:any[], isLoading:boolean, onEdit:(shipment:any)=>void }} props
 */
export default function ShipmentsTab({ shipments, isLoading, onEdit }) {
  const [sortKey, setSortKey] = useState('createdAt');
  const [sortDir, setSortDir] = useState('desc');
  const [search, setSearch] = useState('');

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir('asc');
  };

  const displayed = useMemo(() => {
    let rows = [...shipments];

    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter((s) =>
        String(s.origin ?? '').toLowerCase().includes(q) ||
        String(s.destination ?? '').toLowerCase().includes(q) ||
        String(s.carrier ?? '').toLowerCase().includes(q) ||
        String(s.trackingNumber ?? '').toLowerCase().includes(q)
      );
    }

    rows.sort((a, b) => {
      const va = a[sortKey] ?? '';
      const vb = b[sortKey] ?? '';
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return rows;
  }, [shipments, sortKey, sortDir, search]);

  const renderSortIcon = (key) => {
    if (sortKey !== key) return null;
    return sortDir === 'asc'
      ? <ArrowUp className="ml-1 inline w-3 h-3" aria-hidden="true" />
      : <ArrowDown className="ml-1 inline w-3 h-3" aria-hidden="true" />;
  };

  const renderHeader = (key, label) => (
    <th
      onClick={() => toggleSort(key)}
      className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-white/40 cursor-pointer hover:text-white/70 select-none whitespace-nowrap"
    >
      {label}
      {renderSortIcon(key)}
    </th>
  );

  const fmt = (n) =>
    n != null
      ? new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          notation: 'compact',
        }).format(n)
      : '—';

  const fmtDate = (iso) =>
    iso
      ? new Date(iso).toLocaleDateString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        })
      : '—';

  if (isLoading) return <div className="p-8 text-white/40 text-sm">Loading...</div>;

  return (
    <div className="p-4 flex flex-col gap-3">
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by origin, destination, carrier, or tracking..."
        className="w-full max-w-md bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-blue-400/50 focus:bg-white/8 transition-colors"
      />

      <div className="rounded-xl border border-white/5 overflow-auto">
        <table className="w-full min-w-225 text-sm border-collapse">
          <thead className="bg-white/3 border-b border-white/5">
            <tr>
              {renderHeader('importExport', 'Type')}
              {renderHeader('origin', 'Route')}
              {renderHeader('mode', 'Mode')}
              {renderHeader('carrier', 'Carrier')}
              {renderHeader('cargoValueUSD', 'Cargo Value')}
              {renderHeader('paymentStatus', 'Payment')}
              {renderHeader('status', 'Status')}
              {renderHeader('eta', 'ETA')}
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-white/40">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/3">
            {displayed.map((s) => (
              <tr
                key={s.id}
                onClick={() => onEdit(s)}
                className="border-b border-white/5 hover:bg-white/3 cursor-pointer transition-colors group"
              >
                <td className="px-4 py-3">
                  <span
                    className={`text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border ${
                      s.importExport === 'export'
                        ? 'bg-amber-500/10 text-amber-300 border-amber-400/20'
                        : s.importExport === 'import'
                          ? 'bg-cyan-500/10 text-cyan-300 border-cyan-400/20'
                          : 'bg-white/5 text-white/40 border-white/10'
                    }`}
                  >
                    {s.importExport ?? '—'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-white">{s.origin}</span>
                    <svg viewBox="0 0 16 8" className="w-4 h-3 text-white/30" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                      <path d="M1 4h14M11 1l3 3-3 3" />
                    </svg>
                    <span className="text-white/70">{s.destination}</span>
                  </div>
                  {s.trackingNumber && <p className="text-[10px] text-white/30 font-mono mt-0.5">{s.trackingNumber}</p>}
                </td>
                <td className="px-4 py-3 text-white/70">
                  {(() => {
                    const ModeIcon = MODE_ICONS[s.mode ?? 'sea-freight'] ?? Ship;
                    return (
                      <span className="inline-flex items-center gap-1.5">
                        <ModeIcon className="w-4 h-4 text-white/60" aria-hidden="true" />
                        <span className="capitalize">{String(s.mode ?? 'sea-freight').replace('-', ' ')}</span>
                      </span>
                    );
                  })()}
                </td>
                <td className="px-4 py-3 text-white/70">{s.carrier}</td>
                <td className="px-4 py-3 font-mono text-white/70">{fmt(s.cargoValueUSD)}</td>
                <td className="px-4 py-3">
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded border capitalize ${PAY_COLORS[s.paymentStatus] ?? 'bg-white/5 text-white/40 border-white/10'}`}>
                    {s.paymentStatus ?? 'unknown'}
                  </span>
                </td>
                <td className="px-4 py-3"><StatusPill status={s.status} /></td>
                <td className="px-4 py-3 text-white/50 text-xs">{fmtDate(s.eta)}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      onEdit(s);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-xs px-2.5 py-1 rounded-lg border border-white/10 text-white/60 hover:border-blue-400/40 hover:text-blue-300 transition-all"
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {displayed.length === 0 && (
          <div className="py-12 text-center text-white/30 text-sm">No shipments match your search.</div>
        )}
      </div>
      <p className="text-xs text-white/25 pl-1">{displayed.length} of {shipments.length} shipments</p>
    </div>
  );
}
