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
import { motion } from 'framer-motion';
import NavBar from '../components/NavBar.jsx';
import { useTheme } from '../providers/ThemeProvider.jsx';
import { PAGE_ENTER, STAGGER_CHILDREN, CARD_ITEM } from '../lib/motion.js';

const PIE_COLORS = ['#0EA5E9', '#F59E0B', '#EF4444', '#22C55E', '#14B8A6', '#F97316'];

function KpiCard({ label, value, sub, trend, accentColor = 'var(--accent-cyan)' }) {
  return (
    <motion.article
      variants={CARD_ITEM}
      className="relative overflow-hidden rounded-2xl border border-[var(--border-default)]
                 bg-[var(--bg-surface)] shadow-[var(--shadow-card)] p-5 group"
    >
      {/* Top accent bar */}
      <div
        className="absolute inset-x-0 top-0 h-px transition-opacity opacity-50 group-hover:opacity-100"
        style={{ background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)` }}
      />
      <p className="text-[10px] uppercase tracking-[0.25em] text-[var(--text-muted)] font-semibold">{label}</p>
      <p className="mt-3 font-mono text-4xl font-light text-[var(--text-primary)] leading-none">
        {value}
      </p>
      <div className="mt-2 flex items-center justify-between">
        <p className="text-xs text-[var(--text-secondary)]">{sub}</p>
        {trend && (
          <span className={`text-xs font-medium ${trend > 0 ? 'text-[var(--accent-green)]' : 'text-[var(--accent-red)]'}`}>
            {trend > 0 ? '▲' : '▼'} {Math.abs(trend)}%
          </span>
        )}
      </div>
    </motion.article>
  );
}

function ChartPanel({ title, subtitle, children }) {
  return (
    <motion.div 
      variants={CARD_ITEM}
      className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)]
                 shadow-[var(--shadow-card)] p-5 space-y-4"
    >
      <div>
        <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-[0.18em] font-display">
          {title}
        </p>
        {subtitle && (
          <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">{subtitle}</p>
        )}
      </div>
      {children}
    </motion.div>
  );
}

export default function AnalyticsPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const { theme } = useTheme();

  const tickColor = theme === 'light' ? '#475569' : '#64748b';
  const tooltipBg = theme === 'light' ? '#ffffff' : '#0f172a';
  const tooltipBorder = theme === 'light' ? '1px solid rgba(0,0,0,0.1)' : '1px solid rgba(255,255,255,0.08)';

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
      <div className="flex h-screen flex-col bg-[var(--bg-base)] text-[var(--text-primary)]">
        <NavBar />
        <div className="flex flex-1 items-center justify-center text-sm text-[var(--accent-red)]">{error}</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-screen flex-col bg-[var(--bg-base)] text-[var(--text-primary)]">
        <NavBar />
        <div className="flex flex-1 items-center justify-center text-sm text-[var(--text-muted)]">Loading analytics...</div>
      </div>
    );
  }

  const cards = [
    { label: 'MTTD', value: `${data.mttdMinutes}m`, sub: 'Mean time to detect', trend: 12 },
    { label: 'MTTR', value: `${data.mttrMinutes}m`, sub: 'Mean time to resolve', trend: -5, accentColor: 'var(--accent-amber)' },
    { label: 'Cargo Saved', value: `$${(data.cargoSavedUSD / 1e6).toFixed(1)}M`, sub: 'Est. from rerouting', trend: 8, accentColor: 'var(--accent-green)' },
    { label: 'CO2 Impact', value: `${data.totalCO2t}t`, sub: 'Reroute emissions delta', trend: -2, accentColor: 'var(--accent-blue)' },
  ];

  return (
    <div className="flex h-screen flex-col bg-[var(--bg-base)] text-[var(--text-primary)]">
      <NavBar />
      <motion.main 
        variants={PAGE_ENTER}
        initial="hidden"
        animate="visible"
        className="flex-1 overflow-y-auto p-6 space-y-8"
      >
        <header>
          <p className="text-[11px] uppercase tracking-[0.25em] text-[var(--accent-cyan)] font-semibold font-display">Operations Intelligence</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight font-display">30-Day Analytics</h1>
        </header>

        <motion.section variants={STAGGER_CHILDREN} className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
          {cards.map((kpi) => (
            <KpiCard key={kpi.label} {...kpi} />
          ))}
        </motion.section>

        <motion.section variants={STAGGER_CHILDREN} className="space-y-6">
          <ChartPanel title="Disruption Events" subtitle="Frequency of detected anomalies over the last 30 days">
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={data.disruptionsByDay} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="eventsFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--accent-cyan)" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="var(--accent-cyan)" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fill: tickColor, fontSize: 10 }} axisLine={false} tickLine={false} dy={10} />
                <YAxis tick={{ fill: tickColor, fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip 
                  contentStyle={{ background: tooltipBg, border: tooltipBorder, borderRadius: '12px', fontSize: '11px' }} 
                  itemStyle={{ color: 'var(--accent-cyan)' }}
                />
                <Area type="monotone" dataKey="count" stroke="var(--accent-cyan)" fill="url(#eventsFill)" strokeWidth={2.5} animationDuration={1500} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartPanel>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <ChartPanel title="Disruptions by Type" subtitle="Distribution of events by root cause category">
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={data.byType} dataKey="count" nameKey="type" innerRadius={55} outerRadius={85} paddingAngle={4}>
                    {data.byType.map((entry, idx) => (
                      <Cell key={`${entry.type}-${idx}`} fill={PIE_COLORS[idx % PIE_COLORS.length]} stroke="transparent" />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: tooltipBg, border: tooltipBorder, borderRadius: '12px', fontSize: '11px' }} />
                </PieChart>
              </ResponsiveContainer>
            </ChartPanel>

            <ChartPanel title="Regional Urgency" subtitle="Average severity score across primary shipping corridors">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.byCorridor} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <XAxis dataKey="corridor" tick={{ fill: tickColor, fontSize: 10 }} axisLine={false} tickLine={false} dy={10} />
                  <YAxis domain={[0, 10]} tick={{ fill: tickColor, fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: tooltipBg, border: tooltipBorder, borderRadius: '12px', fontSize: '11px' }} />
                  <Bar dataKey="avgSeverity" fill="var(--accent-amber)" radius={[4, 4, 0, 0]} barSize={24} animationDuration={1200} />
                </BarChart>
              </ResponsiveContainer>
            </ChartPanel>
          </div>
        </motion.section>
      </motion.main>
    </div>
  );
}
