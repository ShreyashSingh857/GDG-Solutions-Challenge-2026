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
import { BarChart3, ChevronUp, ChevronDown } from 'lucide-react';
import { Skeleton } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import NavBar from '../components/NavBar.jsx';
import { useTheme } from '../providers/ThemeProvider.jsx';
import { PAGE_ENTER, STAGGER_CHILDREN, CARD_ITEM } from '../lib/motion.js';

const PIE_COLORS = ['#0EA5E9', '#F59E0B', '#EF4444', '#22C55E', '#14B8A6', '#F97316'];

function KpiCard({ label, value, sub, trend, accentColor = 'var(--accent-cyan)' }) {
  return (
    <motion.article
      variants={CARD_ITEM}
      className="glass-panel glass-edge relative overflow-hidden p-6 group"
    >
      <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)] font-bold">{label}</p>
      <p className="mt-4 font-mono text-4xl font-light text-[var(--text-primary)] leading-none">
        {value}
      </p>
      <div className="mt-4 flex items-center justify-between">
        <p className="text-xs text-[var(--text-secondary)] font-medium">{sub}</p>
        {trend !== undefined && (
          <div className={`flex items-center gap-1 text-sm font-bold ${trend > 0 ? 'text-[var(--accent-green)]' : 'text-[var(--accent-red)]'}`}>
            <span className="opacity-70">{trend > 0 ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</span>
            <span>{Math.abs(trend)}%</span>
          </div>
        )}
      </div>
      {/* Decorative hover gradient */}
      <div 
        className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-[var(--glass-border)] opacity-0 group-hover:opacity-10 transition-opacity duration-500 pointer-events-none"
        style={{ color: accentColor }}
      />
    </motion.article>
  );
}

function ChartPanel({ title, subtitle, children }) {
  return (
    <motion.div 
      variants={CARD_ITEM}
      className="glass-panel p-6 space-y-6"
    >
      <div className="flex flex-col gap-1">
        <p className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-[0.2em] font-display">
          {title}
        </p>
        {subtitle && (
          <p className="text-xs text-[var(--text-muted)] font-medium">{subtitle}</p>
        )}
      </div>
      <div className="w-full">
        {children}
      </div>
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
        <div className="flex-1 p-6 space-y-8">
          <Skeleton variant="line" className="h-10 w-64 rounded-xl" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} variant="block" className="h-32 rounded-2xl" />
            ))}
          </div>
          <Skeleton variant="block" className="h-72 rounded-2xl" />
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Skeleton variant="block" className="h-64 rounded-2xl" />
            <Skeleton variant="block" className="h-64 rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  const cards = [
    { label: 'MTTD', value: `${data.mttdMinutes}m`, sub: 'Mean time to detect', trend: 12 },
    { label: 'MTTR', value: `${data.mttrMinutes}m`, sub: 'Mean time to resolve', trend: -5, accentColor: 'var(--accent-amber)' },
    { label: 'Cargo Saved', value: `$${(data.cargoSavedUSD / 1e6).toFixed(1)}M`, sub: 'Est. from rerouting', trend: 8, accentColor: 'var(--accent-green)' },
    { label: 'CO2 Impact', value: `${data.totalCO2t}t`, sub: 'Reroute emissions delta', trend: -2, accentColor: 'var(--accent-blue)' },
  ];

  const tooltipStyle = {
    background: 'var(--glass-bg-elevated)',
    backdropFilter: 'blur(12px)',
    border: '1px solid var(--glass-border)',
    borderRadius: '12px',
    fontSize: '11px',
    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
    padding: '10px 14px',
  };

  return (
    <div className="flex h-screen flex-col bg-[var(--bg-base)] text-[var(--text-primary)]">
      <NavBar />
      <motion.main 
        variants={PAGE_ENTER}
        initial="hidden"
        animate="visible"
        className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar"
      >
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
          <span className="hover:text-[var(--text-primary)] transition-colors cursor-pointer">OpenTrade</span>
          <span className="opacity-30">/</span>
          <span className="text-[var(--text-secondary)]">Analytics</span>
        </div>

        <header>
          <p className="text-xs uppercase tracking-[0.25em] text-[var(--accent-cyan)] font-bold font-display">Operations Intelligence</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight font-display">30-Day Performance</h1>
        </header>

        {(!data || Object.keys(data).length === 0) ? (
          <div className="flex-1 min-h-[400px] flex items-center justify-center glass-panel !bg-transparent border-dashed border-2 opacity-60">
            <EmptyState 
              icon={BarChart3} 
              title="No Intelligence Data" 
              description="Historical performance metrics are calculated every 24 hours. Check back once your first disruption protocol has been executed."
            />
          </div>
        ) : (
          <>
            <motion.section variants={STAGGER_CHILDREN} className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
          {cards.map((kpi) => (
            <KpiCard key={kpi.label} {...kpi} />
          ))}
        </motion.section>

        <motion.section variants={STAGGER_CHILDREN} className="space-y-6 pb-6">
          <ChartPanel title="Disruption Events" subtitle="Frequency of detected anomalies over the last 30 days">
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={data.disruptionsByDay} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="eventsFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--accent-cyan)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--accent-cyan)" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fill: tickColor, fontSize: 10, fontWeight: 600 }} axisLine={false} tickLine={false} dy={10} />
                <YAxis tick={{ fill: tickColor, fontSize: 10, fontWeight: 600 }} axisLine={false} tickLine={false} />
                <Tooltip 
                  contentStyle={tooltipStyle} 
                  itemStyle={{ color: 'var(--accent-cyan)', fontWeight: 700 }}
                  labelStyle={{ color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: 600 }}
                />
                <Area type="monotone" dataKey="count" stroke="var(--accent-cyan)" fill="url(#eventsFill)" strokeWidth={3} animationDuration={1500} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartPanel>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <ChartPanel title="Disruptions by Type" subtitle="Distribution of events by root cause category">
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={data.byType} dataKey="count" nameKey="type" innerRadius={60} outerRadius={90} paddingAngle={4}>
                    {data.byType.map((entry, idx) => (
                      <Cell key={`${entry.type}-${idx}`} fill={PIE_COLORS[idx % PIE_COLORS.length]} stroke="transparent" />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            </ChartPanel>

            <ChartPanel title="Regional Urgency" subtitle="Average severity score across primary shipping corridors">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.byCorridor} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <XAxis dataKey="corridor" tick={{ fill: tickColor, fontSize: 10, fontWeight: 600 }} axisLine={false} tickLine={false} dy={10} />
                  <YAxis domain={[0, 10]} tick={{ fill: tickColor, fontSize: 10, fontWeight: 600 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="avgSeverity" fill="var(--accent-amber)" radius={[6, 6, 0, 0]} barSize={28} animationDuration={1200} />
                </BarChart>
              </ResponsiveContainer>
            </ChartPanel>
          </div>
        </motion.section>
        </>
        )}
      </motion.main>
    </div>
  );
}
