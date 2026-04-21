'use client';

import { useEffect, useState } from 'react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import NavBar from '../components/NavBar.jsx';

const PIE_COLORS = ['#0EA5E9', '#F59E0B', '#EF4444', '#22C55E', '#14B8A6', '#F97316'];

function kpiCards(data) {
  return [
    { label: 'MTTD', value: `${data.mttdMinutes}m`, sub: 'Mean time to detect' },
    { label: 'MTTR', value: `${data.mttrMinutes}m`, sub: 'Mean time to resolve' },
    { label: 'Cargo Saved', value: `$${(data.cargoSavedUSD / 1e6).toFixed(1)}M`, sub: 'Estimated from rerouting' },
    { label: 'CO2 Impact', value: `${data.totalCO2t}t`, sub: 'Reroute emissions delta' },
  ];
}

export default function AnalyticsPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    fetch('/api/analytics')
      .then((r) => r.json())
      .then((payload) => {
        if (!mounted) return;
        if (payload?.error) {
          setError(payload.error);
          return;
        }
        setData(payload.data);
      })
      .catch((err) => {
        if (mounted) setError(err.message || 'Failed to load analytics');
      });

    return () => {
      mounted = false;
    };
  }, []);

  if (error) {
    return (
      <div className="flex h-screen flex-col bg-[#020617] text-white">
        <NavBar />
        <div className="flex flex-1 items-center justify-center text-sm text-red-300">{error}</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-screen flex-col bg-[#020617] text-white">
        <NavBar />
        <div className="flex flex-1 items-center justify-center text-sm text-white/50">Loading analytics...</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-[#020617] text-white">
      <NavBar />
      <main className="flex-1 overflow-y-auto p-6 space-y-6">
        <header>
          <p className="text-[11px] uppercase tracking-[0.25em] text-cyan-300/70">Operations Intelligence</p>
          <h1 className="mt-2 text-2xl font-semibold">30-Day Analytics</h1>
        </header>

        <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {kpiCards(data).map((kpi) => (
            <article key={kpi.label} className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">{kpi.label}</p>
              <p className="mt-2 text-3xl font-semibold leading-none">{kpi.value}</p>
              <p className="mt-2 text-xs text-white/45">{kpi.sub}</p>
            </article>
          ))}
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="mb-3 text-sm text-white/60">Disruption Events by Day</p>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={data.disruptionsByDay}>
              <defs>
                <linearGradient id="eventsFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.45} />
                  <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.08)' }} />
              <Area type="monotone" dataKey="count" stroke="#0ea5e9" fill="url(#eventsFill)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </section>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <article className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="mb-3 text-sm text-white/60">Disruptions by Type</p>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={data.byType} dataKey="count" nameKey="type" innerRadius={38} outerRadius={72}>
                  {data.byType.map((entry, idx) => (
                    <Cell key={`${entry.type}-${idx}`} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.08)' }} />
              </PieChart>
            </ResponsiveContainer>
          </article>

          <article className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="mb-3 text-sm text-white/60">Average Urgency by Corridor</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.byCorridor}>
                <XAxis dataKey="corridor" tick={{ fill: '#64748b', fontSize: 11 }} />
                <YAxis domain={[0, 10]} tick={{ fill: '#64748b', fontSize: 11 }} />
                <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.08)' }} />
                <Bar dataKey="avgSeverity" fill="#f59e0b" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </article>
        </section>
      </main>
    </div>
  );
}
