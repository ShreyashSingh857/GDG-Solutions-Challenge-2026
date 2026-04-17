'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import MetricCard from './MetricCard.jsx';

const STATUS_COLORS = {
  active: '#34d399',
  delayed: '#f87171',
  rerouted: '#60a5fa',
  disrupted: '#fbbf24',
};

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

/**
 * @param {{ shipments: any[] }} props
 */
export default function OverviewTab({ shipments }) {
  const totalCargo = shipments.reduce((sum, s) => sum + Number(s.cargoValueUSD || 0), 0);
  const totalPayments = shipments.reduce((sum, s) => sum + Number(s.paymentAmountUSD || 0), 0);

  const statusCounts = shipments.reduce((acc, s) => {
    const key = String(s.status || 'unknown').toLowerCase();
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const corridorCargo = shipments.reduce((acc, s) => {
    const corridor = String(s.corridor || 'Unknown');
    acc[corridor] = (acc[corridor] || 0) + Number(s.cargoValueUSD || 0);
    return acc;
  }, {});

  const paymentCounts = shipments.reduce((acc, s) => {
    const key = String(s.paymentStatus || 'unknown').toLowerCase();
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const delayedRatio = shipments.length ? Math.round(((statusCounts.delayed || 0) / shipments.length) * 100) : 0;

  const statusData = Object.entries(statusCounts).map(([name, value]) => ({ name, value }));
  const corridorData = Object.entries(corridorCargo)
    .map(([name, cargo]) => ({ name, cargo: Math.round(cargo / 1000) }))
    .sort((a, b) => b.cargo - a.cargo);

  return (
    <section className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard title="Total Shipments" value={String(shipments.length)} subtitle="Live from Firestore" tone="neutral" />
        <MetricCard title="Cargo at Risk" value={currency.format(totalCargo)} subtitle="Aggregate cargo valuation" tone="amber" />
        <MetricCard title="Payment Exposure" value={currency.format(totalPayments)} subtitle="Total payment commitments" tone="blue" />
        <MetricCard title="Delayed Ratio" value={`${delayedRatio}%`} subtitle="Share of delayed routes" tone="green" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <article className="rounded-2xl border border-white/10 bg-white/3 p-4">
          <h2 className="text-sm text-white/70 mb-3">Shipment Status Mix</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={95} innerRadius={55}>
                  {statusData.map((entry) => (
                    <Cell key={entry.name} fill={STATUS_COLORS[entry.name] || '#94a3b8'} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value, name) => [value, String(name).toUpperCase()]}
                  contentStyle={{ background: '#0b1221', border: '1px solid rgba(148,163,184,0.25)' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="rounded-2xl border border-white/10 bg-white/3 p-4">
          <h2 className="text-sm text-white/70 mb-3">Corridor Cargo (x$1k)</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={corridorData} margin={{ top: 8, right: 8, left: 0, bottom: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                <XAxis dataKey="name" tick={{ fill: '#cbd5e1', fontSize: 12 }} interval={0} angle={-12} textAnchor="end" height={48} />
                <YAxis tick={{ fill: '#cbd5e1', fontSize: 12 }} />
                <Tooltip
                  formatter={(value) => [currency.format(Number(value) * 1000), 'Cargo']}
                  contentStyle={{ background: '#0b1221', border: '1px solid rgba(148,163,184,0.25)' }}
                />
                <Bar dataKey="cargo" fill="#22d3ee" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>
      </div>

      <article className="rounded-2xl border border-white/10 bg-white/3 p-4">
        <h2 className="text-sm text-white/70 mb-3">Payment Settlement Distribution</h2>
        <div className="flex flex-wrap gap-2">
          {Object.entries(paymentCounts).map(([key, count]) => (
            <div key={key} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
              <p className="text-xs text-white/60 uppercase">{key}</p>
              <p className="text-lg font-semibold">{count}</p>
            </div>
          ))}
          {!Object.keys(paymentCounts).length && <p className="text-sm text-white/55">No payment status data yet.</p>}
        </div>
      </article>
    </section>
  );
}
