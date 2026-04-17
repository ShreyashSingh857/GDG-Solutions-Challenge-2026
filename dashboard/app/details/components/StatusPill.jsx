const MAP = {
  active: 'bg-green-500/15 text-green-300 border-green-400/20',
  delayed: 'bg-red-500/15 text-red-300 border-red-400/20',
  rerouted: 'bg-blue-500/15 text-blue-300 border-blue-400/20',
  disrupted: 'bg-orange-500/15 text-orange-300 border-orange-400/20',
};

export default function StatusPill({ status }) {
  return (
    <span className={`text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded border ${MAP[status] ?? 'bg-white/5 text-white/40 border-white/10'}`}>
      {status}
    </span>
  );
}
