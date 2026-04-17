'use client';

import { useMemo, useState } from 'react';
import StatusPill from './StatusPill.jsx';

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

/**
 * @param {{ shipments:any[], onCreate:()=>void, onEdit:(shipment:any)=>void, onDelete:(id:string)=>Promise<void>, isSaving:boolean }} props
 */
export default function ShipmentsTab({ shipments, onCreate, onEdit, onDelete, isSaving }) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const filtered = useMemo(() => {
    return shipments.filter((s) => {
      const q = query.trim().toLowerCase();
      const searchMatch =
        !q ||
        String(s.id || '').toLowerCase().includes(q) ||
        String(s.trackingNumber || '').toLowerCase().includes(q) ||
        String(s.origin || '').toLowerCase().includes(q) ||
        String(s.destination || '').toLowerCase().includes(q) ||
        String(s.carrier || '').toLowerCase().includes(q);

      const statusMatch = statusFilter === 'all' || String(s.status || '').toLowerCase() === statusFilter;
      return searchMatch && statusMatch;
    });
  }, [query, shipments, statusFilter]);

  return (
    <section className="rounded-2xl border border-white/10 bg-white/3 p-4">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by ID, tracking, route, carrier"
            className="w-full sm:w-80 rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400/30"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400/30"
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="delayed">Delayed</option>
            <option value="rerouted">Rerouted</option>
            <option value="disrupted">Disrupted</option>
          </select>
        </div>
        <button
          onClick={onCreate}
          className="self-start md:self-auto px-3 py-2 text-sm rounded-xl bg-cyan-500/20 border border-cyan-400/40 text-cyan-200 hover:bg-cyan-500/30 transition-colors"
        >
          New Shipment
        </button>
      </div>

      <div className="overflow-auto rounded-xl border border-white/10">
        <table className="w-full text-sm min-w-280">
          <thead className="bg-black/40 text-white/65">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Tracking</th>
              <th className="px-3 py-2 text-left font-medium">Route</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2 text-left font-medium">Mode</th>
              <th className="px-3 py-2 text-left font-medium">Carrier</th>
              <th className="px-3 py-2 text-left font-medium">Cargo</th>
              <th className="px-3 py-2 text-left font-medium">Payment</th>
              <th className="px-3 py-2 text-left font-medium">Direction</th>
              <th className="px-3 py-2 text-left font-medium">ETA</th>
              <th className="px-3 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.id} className="border-t border-white/10 hover:bg-white/3">
                <td className="px-3 py-2">
                  <p className="font-medium text-white/90">{s.trackingNumber || '-'}</p>
                  <p className="text-xs text-white/45">{s.id}</p>
                </td>
                <td className="px-3 py-2">{s.origin} to {s.destination}</td>
                <td className="px-3 py-2"><StatusPill status={s.status} /></td>
                <td className="px-3 py-2 uppercase text-white/75">{s.mode || '-'}</td>
                <td className="px-3 py-2">{s.carrier || '-'}</td>
                <td className="px-3 py-2">{currency.format(Number(s.cargoValueUSD || 0))}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-col gap-1">
                    <span>{currency.format(Number(s.paymentAmountUSD || 0))}</span>
                    <StatusPill status={s.paymentStatus} />
                  </div>
                </td>
                <td className="px-3 py-2 capitalize">{s.importExport || '-'}</td>
                <td className="px-3 py-2">{s.eta ? new Date(s.eta).toLocaleDateString() : '-'}</td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => onEdit(s)}
                      className="px-2.5 py-1.5 rounded-lg border border-white/15 text-white/80 hover:bg-white/10"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => onDelete(s.id)}
                      disabled={isSaving}
                      className="px-2.5 py-1.5 rounded-lg border border-red-400/30 text-red-300 hover:bg-red-500/15 disabled:opacity-60"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td className="px-3 py-8 text-center text-white/50" colSpan={10}>
                  No shipments match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
