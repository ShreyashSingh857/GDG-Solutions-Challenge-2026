const COLORS = {
  default: 'border-[var(--border-subtle)] bg-[var(--bg-elevated)]/30',
  green: 'border-[var(--accent-green)]/20 bg-[var(--accent-green)]/5',
  red: 'border-[var(--accent-red)]/20 bg-[var(--accent-red)]/5',
  blue: 'border-[var(--accent-blue)]/20 bg-[var(--accent-blue)]/5',
  cyan: 'border-[var(--accent-cyan)]/20 bg-[var(--accent-cyan)]/5',
  amber: 'border-[var(--accent-amber)]/20 bg-[var(--accent-amber)]/5',
  purple: 'border-purple-500/20 bg-purple-500/5', // purple not in our palette but kept as fallback
};

export default function MetricCard({ label, value, icon: Icon, color = 'default' }) {
  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-2 ${COLORS[color]}`}>
      <div className="flex items-center justify-between">
        {Icon ? <Icon className="w-5 h-5 text-[var(--text-primary)]/80" aria-hidden="true" /> : null}
      </div>
      <p className="text-2xl font-bold text-[var(--text-primary)]">{value}</p>
      <p className="text-xs text-[var(--text-muted)] uppercase tracking-widest">{label}</p>
    </div>
  );
}
