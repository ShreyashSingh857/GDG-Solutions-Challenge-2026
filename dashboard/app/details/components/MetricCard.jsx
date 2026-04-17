'use client';

/**
 * @param {{ title: string, value: string, subtitle?: string, tone?: 'neutral'|'green'|'amber'|'blue' }} props
 */
export default function MetricCard({ title, value, subtitle, tone = 'neutral' }) {
  const toneClass = {
    neutral: 'border-white/10 bg-white/[0.03]',
    green: 'border-emerald-400/25 bg-emerald-500/[0.08]',
    amber: 'border-amber-400/25 bg-amber-500/[0.08]',
    blue: 'border-cyan-400/25 bg-cyan-500/[0.08]',
  }[tone];

  return (
    <article className={`rounded-2xl border p-4 backdrop-blur-sm ${toneClass}`}>
      <p className="text-xs uppercase tracking-wider text-white/60">{title}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      {subtitle ? <p className="mt-1 text-xs text-white/55">{subtitle}</p> : null}
    </article>
  );
}
