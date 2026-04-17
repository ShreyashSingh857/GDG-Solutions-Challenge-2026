const COLORS = {
  default: 'border-white/5 bg-white/2',
  green: 'border-green-500/20 bg-green-500/5',
  red: 'border-red-500/20 bg-red-500/5',
  blue: 'border-blue-500/20 bg-blue-500/5',
  cyan: 'border-cyan-500/20 bg-cyan-500/5',
  amber: 'border-amber-500/20 bg-amber-500/5',
  purple: 'border-purple-500/20 bg-purple-500/5',
};

export default function MetricCard({ label, value, icon: Icon, color = 'default' }) {
  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-2 ${COLORS[color]}`}>
      <div className="flex items-center justify-between">
        {Icon ? <Icon className="w-5 h-5 text-white/80" aria-hidden="true" /> : null}
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="text-xs text-white/40 uppercase tracking-widest">{label}</p>
    </div>
  );
}
