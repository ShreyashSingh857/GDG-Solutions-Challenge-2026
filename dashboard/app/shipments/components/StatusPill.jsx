import { CheckCircle2, AlertCircle, RefreshCw, XCircle } from 'lucide-react';

const CONFIG = {
  active: {
    icon: CheckCircle2,
    label: 'Active',
    className: 'bg-[var(--accent-green)]/15 text-[var(--accent-green)] border-[var(--accent-green)]/20',
  },
  delayed: {
    icon: AlertCircle,
    label: 'Delayed',
    className: 'bg-[var(--accent-red)]/15 text-[var(--accent-red)] border-[var(--accent-red)]/20',
  },
  rerouted: {
    icon: RefreshCw,
    label: 'Rerouted',
    className: 'bg-[var(--accent-blue)]/15 text-[var(--accent-blue)] border-[var(--accent-blue)]/20',
  },
  disrupted: {
    icon: XCircle,
    label: 'Disrupted',
    className: 'bg-[var(--accent-amber)]/15 text-[var(--accent-amber)] border-[var(--accent-amber)]/20',
  },
};

export default function StatusPill({ status }) {
  const config = CONFIG[status] || {
    icon: AlertCircle,
    label: status,
    className: 'bg-[var(--bg-elevated)] text-[var(--text-muted)] border-[var(--border-subtle)]',
  };
  
  const Icon = config.icon;

  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg border ${config.className}`}>
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  );
}
