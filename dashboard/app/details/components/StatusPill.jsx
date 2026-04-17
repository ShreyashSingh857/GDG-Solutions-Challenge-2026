'use client';

/**
 * @param {{ status: string }} props
 */
export default function StatusPill({ status }) {
  const label = String(status || 'unknown').toLowerCase();

  const classes = {
    active: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30',
    delayed: 'bg-red-500/15 text-red-300 border-red-400/30',
    rerouted: 'bg-blue-500/15 text-blue-300 border-blue-400/30',
    disrupted: 'bg-amber-500/15 text-amber-300 border-amber-400/30',
    pending: 'bg-amber-500/15 text-amber-300 border-amber-400/30',
    paid: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30',
    failed: 'bg-red-500/15 text-red-300 border-red-400/30',
    refunded: 'bg-slate-500/15 text-slate-300 border-slate-400/30',
  };

  const className = classes[label] || 'bg-white/10 text-white/75 border-white/20';

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${className}`}>
      {label}
    </span>
  );
}
