'use client';

import CostTimeChart from './CostTimeChart.jsx';

const CFG = {
  1: { label: '#1 Recommended', badge: 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30', border: 'border-yellow-500/20', btn: 'bg-yellow-600 hover:bg-yellow-500 text-white' },
  2: { label: '#2 Fastest', badge: 'bg-gray-500/20 text-gray-300 border border-gray-500/30', border: 'border-white/5', btn: 'bg-gray-700 hover:bg-gray-600 text-white' },
  3: { label: '#3 Cheapest', badge: 'bg-amber-900/20 text-amber-500 border border-amber-700/30', border: 'border-white/5', btn: 'bg-gray-700 hover:bg-gray-600 text-white' },
};

export default function OptionCard({ option, onApprove, isApproving, isSelected }) {
  const c = CFG[option.rank] || CFG[3];
  return (
    <div className={`flex flex-col gap-4 bg-gray-800/60 rounded-xl border p-5 flex-1 min-w-0 ${c.border} ${isSelected ? 'ring-2 ring-green-500/40' : ''}`}>
      <div className="flex items-center justify-between">
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${c.badge}`}>{c.label}</span>
        <span className="text-xs text-white/30 font-mono">{Math.round((option.confidence || 0) * 100)}% confident</span>
      </div>
      <h3 className="text-sm font-semibold text-white leading-snug">{option.title}</h3>
      <p className="text-xs text-white/60 leading-relaxed">{option.description}</p>
      <CostTimeChart costDelta={option.costDelta} timeDelta={option.timeDelta} />
      <div className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-blue-400" /><span className="text-xs text-white/50">{option.supplierName}</span></div>
      {isSelected ? (
        <div className="text-xs text-green-400 font-medium flex items-center gap-1.5 mt-auto pt-2 border-t border-white/5"><span>✓</span> Executed</div>
      ) : (
        <button onClick={() => onApprove(option.rank)} disabled={isApproving} className={`mt-auto w-full py-2 px-4 rounded-lg text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed ${c.btn}`}>
          {isApproving ? 'Executing...' : 'Approve & Execute'}
        </button>
      )}
    </div>
  );
}
