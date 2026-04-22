'use client';

import { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Plane,
  Ship,
  Train,
  Truck,
  Search,
  ChevronRight,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import StatusPill from './StatusPill.jsx';
import { CARD_ITEM } from '../../lib/motion.js';

const MODE_ICONS = {
  'sea-freight': Ship,
  'air-freight': Plane,
  rail: Train,
  road: Truck,
};

const PAY_COLORS = {
  paid: 'text-[var(--accent-green)]',
  pending: 'text-[var(--accent-amber)]',
  overdue: 'text-[var(--accent-red)]',
  partial: 'text-orange-400',
};

function formatCargo(usd) {
  if (!usd) return '—';
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`;
  if (usd >= 1_000) return `$${(usd / 1_000).toFixed(0)}K`;
  return `$${usd}`;
}

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
      ? <ArrowUp className="ml-1 inline w-3 h-3" />
      : <ArrowDown className="ml-1 inline w-3 h-3" />;
  };

  const renderHeader = (key, label) => (
    <th
      onClick={() => toggleSort(key)}
      className="sticky top-0 z-20 px-4 py-4 text-left text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--text-muted)] cursor-pointer hover:text-[var(--text-secondary)] select-none whitespace-nowrap bg-[var(--bg-surface)] backdrop-blur-md transition-colors"
    >
      <div className="flex items-center">
        {label}
        {renderSortIcon(key)}
      </div>
    </th>
  );

  const fmtDate = (iso) =>
    iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—';

  if (isLoading) return <div className="p-8 text-[var(--text-muted)] text-sm">Loading shipments...</div>;

  return (
    <div className="p-6 flex flex-col gap-6">
      <div className="relative max-w-md group">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)] group-focus-within:text-[var(--accent-cyan)] transition-colors" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter by origin, destination, or tracking..."
          className="w-full bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl pl-10 pr-4 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-cyan)]/50 focus:ring-4 focus:ring-[var(--accent-cyan)]/5 transition-all shadow-sm"
        />
      </div>

      <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-[var(--shadow-card)] overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full min-w-[1000px] text-sm border-collapse">
            <thead>
              <tr className="border-b border-[var(--border-subtle)]">
                {renderHeader('importExport', 'Type')}
                {renderHeader('origin', 'Route')}
                {renderHeader('mode', 'Mode')}
                {renderHeader('carrier', 'Carrier')}
                {renderHeader('cargoValueUSD', 'Value')}
                {renderHeader('paymentStatus', 'Payment')}
                {renderHeader('status', 'Status')}
                {renderHeader('eta', 'ETA')}
                <th className="sticky top-0 z-20 px-4 py-4 bg-[var(--bg-surface)] text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              <AnimatePresence mode="popLayout">
                {displayed.map((s) => (
                  <motion.tr
                    key={s.id}
                    layout
                    variants={CARD_ITEM}
                    onClick={() => onEdit(s)}
                    className="group hover:bg-[var(--bg-elevated)]/50 cursor-pointer transition-colors relative"
                  >
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${
                        s.importExport === 'export'
                          ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                          : 'bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)] border-[var(--accent-cyan)]/20'
                      }`}>
                        {s.importExport ?? 'Ship'}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[var(--text-primary)]">{s.origin}</span>
                        <ChevronRight className="w-3 h-3 text-[var(--text-muted)]" />
                        <span className="text-[var(--text-secondary)]">{s.destination}</span>
                      </div>
                      <div className="mt-1 font-mono text-[10px] text-[var(--text-muted)] tracking-tight">
                        ID: {s.trackingNumber || s.id.slice(0, 8)}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      {(() => {
                        const ModeIcon = MODE_ICONS[s.mode] || Ship;
                        return (
                          <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                            <ModeIcon className="w-4 h-4 opacity-70" />
                            <span className="capitalize">{s.mode?.replace('-', ' ')}</span>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-4 text-[var(--text-secondary)] font-medium">
                      {s.carrier}
                    </td>
                    <td className="px-4 py-4 font-mono text-[var(--text-primary)] font-medium">
                      {formatCargo(s.cargoValueUSD)}
                    </td>
                    <td className="px-4 py-4">
                      <span className={`text-[11px] font-semibold flex items-center gap-1.5 capitalize ${PAY_COLORS[s.paymentStatus] || 'text-[var(--text-muted)]'}`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-current opacity-40" />
                        {s.paymentStatus || 'pending'}
                      </span>
                    </td>
                    <td className="px-4 py-4"><StatusPill status={s.status} /></td>
                    <td className="px-4 py-4 text-[var(--text-secondary)] font-medium">{fmtDate(s.eta)}</td>
                    <td className="px-4 py-4 text-right">
                      <div className="flex justify-end">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all opacity-0 group-hover:opacity-100">
                          <ChevronRight className="w-4 h-4" />
                        </div>
                      </div>
                    </td>
                    {/* Hover indicator */}
                    <td className="absolute left-0 inset-y-0 w-1 bg-[var(--accent-blue)] opacity-0 group-hover:opacity-100 transition-opacity" />
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>

        {displayed.length === 0 && (
          <div className="py-20 text-center space-y-3 bg-[var(--bg-elevated)]/20">
            <Search className="w-10 h-10 text-[var(--text-muted)] mx-auto opacity-20" />
            <p className="text-[var(--text-muted)] text-sm">No shipments found matching your search</p>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between px-2">
        <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold">
          Showing {displayed.length} of {shipments.length} global shipments
        </p>
      </div>
    </div>
  );
}
