'use client';

/**
 * 2x2 Risk/Reward matrix for decision options.
 * Plots options by Cost vs Speed.
 */
export default function RiskMatrix({ options }) {
  if (!options?.length) return null;

  // Find max/min for normalization
  const costs = options.map(o => Math.abs(o.costDelta || 0));
  const times = options.map(o => Math.abs(o.timeDelta || 0));
  
  const maxCost = Math.max(...costs, 1000);
  const maxTime = Math.max(...times, 24);

  const padding = 40;
  const size = 300;
  const innerSize = size - padding * 2;

  const points = options.map(o => {
    // x = cost (lower is better, but usually higher cost = faster)
    // y = time (lower is better)
    const x = padding + (Math.abs(o.costDelta || 0) / maxCost) * innerSize;
    const y = padding + (Math.abs(o.timeDelta || 0) / maxTime) * innerSize;
    return { x, y, rank: o.rank, color: o.rank === 1 ? 'var(--accent-cyan)' : o.rank === 2 ? 'var(--accent-blue)' : 'var(--accent-amber)' };
  });

  return (
    <div className="flex flex-col items-center justify-center p-4 bg-[var(--bg-elevated)]/30 rounded-3xl border border-[var(--border-subtle)]">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-2 h-2 rounded-full bg-[var(--accent-cyan)] shadow-[0_0_8px_var(--accent-cyan)]" />
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--text-muted)]">Option Trade-off Analysis</span>
      </div>
      
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible">
        {/* Quadrant Lines */}
        <line x1={size/2} y1={padding/2} x2={size/2} y2={size - padding/2} stroke="var(--border-subtle)" strokeWidth="1" strokeDasharray="4 4" />
        <line x1={padding/2} y1={size/2} x2={size - padding/2} y2={size/2} stroke="var(--border-subtle)" strokeWidth="1" strokeDasharray="4 4" />
        
        {/* Axes */}
        <line x1={padding} y1={size-padding} x2={size-padding} y2={size-padding} stroke="var(--text-muted)" strokeWidth="1.5" markerEnd="url(#arrowhead)" />
        <line x1={padding} y1={size-padding} x2={padding} y2={padding} stroke="var(--text-muted)" strokeWidth="1.5" markerEnd="url(#arrowhead)" />
        
        {/* Labels */}
        <text x={size-padding} y={size-padding+15} textAnchor="end" fontSize="10" fill="var(--text-muted)" className="font-bold uppercase tracking-widest">Cost</text>
        <text x={padding-15} y={padding} textAnchor="start" fontSize="10" fill="var(--text-muted)" transform={`rotate(-90 ${padding-15},${padding})`} className="font-bold uppercase tracking-widest">Delay</text>

        {/* Quadrant Labels */}
        <text x={padding + innerSize*0.25} y={padding + innerSize*0.25} textAnchor="middle" fontSize="9" fill="var(--text-muted)" className="opacity-40 italic">Optimal</text>
        <text x={padding + innerSize*0.75} y={padding + innerSize*0.75} textAnchor="middle" fontSize="9" fill="var(--text-muted)" className="opacity-40 italic">High Risk</text>

        {/* Points */}
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="6" fill={p.color} className="shadow-lg" />
            <circle cx={p.x} cy={p.y} r="12" fill={p.color} className="opacity-20 animate-pulse" />
            <text x={p.x} y={p.y - 12} textAnchor="middle" fontSize="11" fill="var(--text-primary)" fontWeight="bold">#{p.rank}</text>
          </g>
        ))}

        <defs>
          <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="var(--text-muted)" />
          </marker>
        </defs>
      </svg>
    </div>
  );
}
