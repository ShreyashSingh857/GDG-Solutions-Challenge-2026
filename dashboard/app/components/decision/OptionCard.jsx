'use client';

import CostTimeChart from './CostTimeChart.jsx';
import FeedbackThumb from './FeedbackThumb.jsx';

function formatMoney(value) {
  return `$${Number(value || 0).toLocaleString()}`;
}

function formatCarbon(value) {
  return `${Math.round(Number(value || 0) / 1000).toLocaleString()}t CO2`;
}

const CFG = {
  1: { label: '#1 Recommended', badge: 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30', border: 'border-yellow-500/20', btn: 'bg-yellow-600 hover:bg-yellow-500 text-white' },
  2: { label: '#2 Fastest', badge: 'bg-gray-500/20 text-gray-300 border border-gray-500/30', border: 'border-white/5', btn: 'bg-gray-700 hover:bg-gray-600 text-white' },
  3: { label: '#3 Cheapest', badge: 'bg-amber-900/20 text-amber-500 border border-amber-700/30', border: 'border-white/5', btn: 'bg-gray-700 hover:bg-gray-600 text-white' },
};

export default function OptionCard({ option, onApprove, isApproving, isSelected, shortcutKey }) {
  const c = CFG[option.rank] || CFG[3];
  return (
    <div className={`flex flex-col gap-4 bg-gray-800/60 rounded-xl border p-5 flex-1 min-w-0 ${c.border} ${isSelected ? 'ring-2 ring-green-500/40' : ''}`}>
      <div className="flex items-center justify-between">
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${c.badge}`}>{c.label}</span>
        <span className="text-xs text-white/30 font-mono">{Math.round((option.confidence || 0) * 100)}% confident</span>
      </div>
      <h3 className="text-sm font-semibold text-white leading-snug">{option.title}</h3>
      <p className="text-xs text-white/60 leading-relaxed">{option.description}</p>
      {option.sanctionsWarning ? (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-100">
          {option.sanctionsWarning}
        </div>
      ) : null}
      <CostTimeChart costDelta={option.costDelta} timeDelta={option.timeDelta} carbonDeltaKg={option.carbonDeltaKg} />
      <div className="grid grid-cols-2 gap-2 text-[11px] text-white/65">
        <div className="rounded-lg border border-white/5 bg-black/20 px-3 py-2">
          <div className="uppercase tracking-[0.2em] text-white/30">Carbon</div>
          <div className="mt-1 font-medium text-white">{formatCarbon(option.carbonDeltaKg)}</div>
        </div>
        <div className="rounded-lg border border-white/5 bg-black/20 px-3 py-2">
          <div className="uppercase tracking-[0.2em] text-white/30">Insurance</div>
          <div className="mt-1 font-medium text-white">{formatMoney(option.insurancePremiumUSD)} · {option.corridorRisk || 'STANDARD'}</div>
        </div>
      </div>
      {option.freightMarketSummary ? <div className="text-[11px] text-white/35 leading-relaxed">Market: {option.freightMarketSummary}</div> : null}
      <div className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-blue-400" /><span className="text-xs text-white/50">{option.supplierName}</span></div>
      {isSelected ? (
        <div className="mt-auto pt-2 border-t border-white/5 text-xs text-green-400 font-medium flex items-center justify-between">
          <span>Executed</span>
          <FeedbackThumb traceId={option.traceId} rank={option.rank} />
        </div>
      ) : (
        <div className="mt-auto flex flex-col gap-1.5">
          <button onClick={() => onApprove(option.rank)} disabled={isApproving} className={`w-full py-2 px-4 rounded-lg text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed ${c.btn}`}>
            {isApproving ? 'Executing...' : 'Approve & Execute'}
          </button>
          <span className="text-xs text-white/20 text-center">[{shortcutKey}]</span>
        </div>
      )}
    </div>
  );
}
