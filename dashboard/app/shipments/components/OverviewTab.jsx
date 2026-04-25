'use client';

import { useMemo } from 'react';
import {
  ArrowRightLeft,
  Banknote,
  CheckCircle2,
  CircleAlert,
  ReceiptText,
  Route,
  Ship,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import MetricCard from './MetricCard.jsx';

const CORRIDOR_COLORS = {
  Pacific: '#3b82f6',
  Suez: '#f59e0b',
  'Indian Ocean': '#10b981',
  Atlantic: '#8b5cf6',
};

/**
 * @param {{ shipments: any[], isLoading: boolean }} props
 */
export default function OverviewTab({ shipments, isLoading }) {
  const metrics = useMemo(() => {
    if (!shipments.length) return null;

    const byStatus = Object.groupBy(shipments, (s) => s.status);
    const byCorridor = Object.groupBy(shipments, (s) => s.corridor);
    const byMode = Object.groupBy(shipments, (s) => s.mode ?? 'sea-freight');
    const byIE = Object.groupBy(shipments, (s) => s.importExport ?? 'unknown');
    const totalValue = shipments.reduce((acc, s) => acc + (Number(s.cargoValueUSD) || 0), 0);
    const paidCount = shipments.filter((s) => s.paymentStatus === 'paid').length;

    return { byStatus, byCorridor, byMode, byIE, totalValue, paidCount };
  }, [shipments]);

  const corridorData = metrics
    ? Object.entries(metrics.byCorridor).map(([name, items]) => ({ name, count: items.length }))
    : [];

  if (isLoading) return <OverviewSkeleton />;
  if (!metrics) return <div className="p-8 text-[var(--text-muted)] text-sm">No shipments found.</div>;

  const fmt = (n) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      notation: 'compact',
    }).format(n);

  return (
    <div className="p-6 flex flex-col gap-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <MetricCard label="Total Shipments" value={shipments.length} icon={Ship} />
        <MetricCard label="Active" value={metrics.byStatus.active?.length ?? 0} color="green" icon={CheckCircle2} />
        <MetricCard label="Delayed" value={metrics.byStatus.delayed?.length ?? 0} color="red" icon={CircleAlert} />
        <MetricCard label="Rerouted" value={metrics.byStatus.rerouted?.length ?? 0} color="blue" icon={Route} />
        <MetricCard label="Total Cargo Value" value={fmt(metrics.totalValue)} icon={Banknote} />
        <MetricCard label="Payments Cleared" value={`${metrics.paidCount}/${shipments.length}`} icon={ReceiptText} />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <MetricCard label="Imports" value={metrics.byIE.import?.length ?? 0} color="cyan" icon={TrendingDown} />
        <MetricCard label="Exports" value={metrics.byIE.export?.length ?? 0} color="amber" icon={TrendingUp} />
        <MetricCard label="Transit" value={metrics.byIE.transit?.length ?? 0} color="purple" icon={ArrowRightLeft} />
      </div>

      <div className="glass-panel p-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-secondary)] mb-4">
          Shipments by Corridor
        </p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={corridorData} barSize={32}>
            <XAxis dataKey="name" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-default)',
                borderRadius: 8,
              }}
              labelStyle={{ color: 'var(--text-primary)' }}
              itemStyle={{ color: 'var(--text-secondary)' }}
            />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {corridorData.map((entry) => (
                <Cell key={entry.name} fill={CORRIDOR_COLORS[entry.name] ?? '#6366f1'} fillOpacity={0.8} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="p-6 flex flex-col gap-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-24 rounded-2xl bg-[var(--bg-elevated)] animate-pulse" />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-24 rounded-2xl bg-[var(--bg-elevated)] animate-pulse" />
        ))}
      </div>
      <div className="h-72 rounded-2xl bg-[var(--bg-elevated)] animate-pulse" />
    </div>
  );
}
