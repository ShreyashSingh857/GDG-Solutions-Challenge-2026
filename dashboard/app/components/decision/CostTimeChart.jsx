'use client';

import { BarChart, Bar, XAxis, YAxis, Cell, ResponsiveContainer, Tooltip } from 'recharts';

export default function CostTimeChart({ costDelta, timeDelta }) {
  const data = [
    {
      name: 'Cost',
      value: Math.abs(costDelta),
      isPositive: costDelta > 0,
      label: `${costDelta > 0 ? '+' : '-'}$${Math.abs(costDelta / 1000).toFixed(0)}K`,
    },
    {
      name: 'Time',
      value: Math.abs(timeDelta),
      isPositive: timeDelta > 0,
      label: `${timeDelta > 0 ? '+' : '-'}${Math.abs(timeDelta)}h`,
    },
  ];

  const Tip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    return <div className="bg-gray-900 border border-white/10 rounded px-2 py-1 text-xs text-white">{payload[0].payload.label}</div>;
  };

  return (
    <div className="w-full h-[100px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
          <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis hide />
          <Tooltip content={<Tip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
          <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={40}>
            {data.map((x, i) => (
              <Cell key={i} fill={x.isPositive ? '#ef4444' : '#22c55e'} fillOpacity={0.8} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="flex justify-around -mt-1">
        {data.map((x) => (
          <span key={x.name} className={`text-xs font-mono font-medium ${x.isPositive ? 'text-red-400' : 'text-green-400'}`}>
            {x.label}
          </span>
        ))}
      </div>
    </div>
  );
}
