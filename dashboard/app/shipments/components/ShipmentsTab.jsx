'use client';

import { useEffect, useMemo, useState } from 'react';
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
import { useShipmentMutations } from '../hooks/useShipmentMutations.js';

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
  const [selectedIndex, setSelectedIndex] = useState(0);
  const { deleteShipment } = useShipmentMutations();

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
  const boundedSelectedIndex = displayed.length
    ? Math.min(selectedIndex, displayed.length - 1)
    : 0;

  useEffect(() => {
    const onKeyDown = async (event) => {
      const target = event.target;
      const tag = target?.tagName?.toLowerCase();
      if (target?.isContentEditable || ['input', 'textarea', 'select'].includes(tag)) return;

      if (!displayed.length) return;

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelectedIndex((index) => Math.min(index + 1, displayed.length - 1));
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelectedIndex((index) => Math.max(index - 1, 0));
      }

      if (event.key === 'Enter' || event.key.toLowerCase() === 'e') {
        event.preventDefault();
        const shipment = displayed[boundedSelectedIndex];
        if (shipment) onEdit?.(shipment);
      }

      if (event.key === 'Delete') {
        event.preventDefault();
        const shipment = displayed[boundedSelectedIndex];
        if (!shipment) return;
        const label = shipment.trackingNumber || shipment.id.slice(-8);
        if (!window.confirm(`Delete shipment ${label}? This cannot be undone.`)) return;
        await deleteShipment(shipment.id);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [boundedSelectedIndex, deleteShipment, displayed, onEdit]);

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

  if (isLoading) return <ShipmentsSkeleton />;

  return (
    <div className="flex flex-col gap-8">
      <div className="relative max-w-md group">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)] group-focus-within:text-[var(--accent-cyan)] transition-colors" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter by origin, destination, or tracking..."
          className="w-full bg-[var(--bg-elevated)]/20 border border-[var(--border-subtle)] rounded-2xl pl-12 pr-4 py-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-cyan)]/50 focus:ring-4 focus:ring-[var(--accent-cyan)]/10 transition-all backdrop-blur-md shadow-sm"
        />
      </div>

      <div className="glass-panel !border-[var(--border-subtle)] !shadow-2xl">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full min-w-[1000px] text-sm border-collapse">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)]/10">
                {renderHeader('importExport', 'Type')}
                {renderHeader('origin', 'Route')}
                {renderHeader('mode', 'Mode')}
                {renderHeader('carrier', 'Carrier')}
                {renderHeader('cargoValueUSD', 'Value')}
                {renderHeader('paymentStatus', 'Payment')}
                {renderHeader('status', 'Status')}
                {renderHeader('eta', 'ETA')}
                <th className="sticky top-0 z-20 px-6 py-5 bg-transparent text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              <AnimatePresence mode="popLayout">
                {displayed.map((s, idx) => (
                  <motion.tr
                    key={s.id}
                    layout
                    variants={CARD_ITEM}
                    onClick={() => { setSelectedIndex(idx); onEdit(s); }}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`group hover:bg-[var(--accent-blue)]/5 cursor-pointer transition-all duration-300 relative ${selectedIndex === idx ? 'bg-[var(--accent-blue)]/10' : ''}`}
                  >
                    <td className="px-6 py-5 whitespace-nowrap">
                      <span className={`text-[9px] font-extrabold uppercase tracking-widest px-2.5 py-1 rounded-lg border ${
                        s.importExport === 'export'
                          ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                          : 'bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)] border-[var(--accent-cyan)]/20'
                      }`}>
                        {s.importExport ?? 'Ship'}
                      </span>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-[var(--text-primary)] tracking-tight">{s.origin}</span>
                        <ChevronRight className="w-3.5 h-3.5 text-[var(--text-muted)] opacity-50" />
                        <span className="font-medium text-[var(--text-secondary)]">{s.destination}</span>
                      </div>
                      <div className="font-mono text-[9px] text-[var(--text-muted)] tracking-wider uppercase opacity-60">
                        {s.trackingNumber || s.id.slice(0, 8)}
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      {(() => {
                        const ModeIcon = MODE_ICONS[s.mode] || Ship;
                        return (
                          <div className="flex items-center gap-3 text-[var(--text-secondary)] font-medium">
                            <div className="w-8 h-8 rounded-xl bg-[var(--bg-elevated)]/40 border border-[var(--border-subtle)] flex items-center justify-center">
                              <ModeIcon className="w-4 h-4 opacity-80" />
                            </div>
                            <span className="capitalize text-[13px]">{s.mode?.replace('-', ' ')}</span>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-6 py-5 text-[var(--text-secondary)] font-bold text-[13px] tracking-tight">
                      {s.carrier}
                    </td>
                    <td className="px-6 py-5 font-mono text-[var(--text-primary)] font-extrabold text-[13px]">
                      {formatCargo(s.cargoValueUSD)}
                    </td>
                    <td className="px-6 py-5">
                      <span className={`text-[11px] font-bold flex items-center gap-2 capitalize ${PAY_COLORS[s.paymentStatus] || 'text-[var(--text-muted)]'}`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-current shadow-[0_0_8px_currentColor]" />
                        {s.paymentStatus || 'pending'}
                      </span>
                    </td>
                    <td className="px-6 py-5"><StatusPill status={s.status} /></td>
                    <td className="px-6 py-5 text-[var(--text-secondary)] font-bold text-[13px]">{fmtDate(s.eta)}</td>
                    <td className="px-6 py-5 text-right">
                      <div className="flex justify-end">
                        <div className="w-9 h-9 rounded-2xl flex items-center justify-center border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/40 text-[var(--text-muted)] group-hover:text-[var(--accent-cyan)] group-hover:border-[var(--accent-cyan)]/30 group-hover:bg-[var(--accent-cyan)]/5 transition-all shadow-sm">
                          <ChevronRight className="w-5 h-5" />
                        </div>
                      </div>
                    </td>
                    {/* Active highlight */}
                    <td className={`absolute left-0 inset-y-0 w-1 bg-[var(--accent-cyan)] transition-all duration-300 ${selectedIndex === idx ? 'opacity-100 scale-y-100' : 'opacity-0 scale-y-0'}`} />
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>

        {displayed.length === 0 && (
          <div className="py-24 text-center space-y-6 bg-black/5">
            <div className="w-20 h-20 rounded-[24px] bg-[var(--bg-elevated)]/40 border border-[var(--border-subtle)] flex items-center justify-center mx-auto shadow-xl glass-panel !rounded-[24px]">
              <Ship className="w-10 h-10 text-[var(--accent-cyan)] opacity-40" />
            </div>
            <div className="space-y-2">
              <p className="text-[var(--text-primary)] font-bold text-lg tracking-tight">No Results Found</p>
              <p className="text-[var(--text-muted)] text-xs max-w-[280px] mx-auto leading-relaxed">
                We couldn&apos;t find any shipments matching your current search or filter criteria.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between px-2">
        <p className="text-[9px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-extrabold flex items-center gap-2">
          <span className="w-1 h-1 rounded-full bg-[var(--accent-cyan)]" />
          Synchronized: {displayed.length} / {shipments.length} Global Nodes Active
        </p>
      </div>
    </div>
  );
}

function ShipmentsSkeleton() {
  return (
    <div className="p-6 flex flex-col gap-6">
      <div className="relative max-w-md h-11 rounded-xl bg-[var(--bg-elevated)] animate-pulse" />
      <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-[var(--shadow-card)] overflow-hidden">
        <div className="overflow-hidden">
          <div className="h-[540px] bg-[var(--bg-elevated)] animate-pulse" />
        </div>
      </div>
    </div>
  );
}
