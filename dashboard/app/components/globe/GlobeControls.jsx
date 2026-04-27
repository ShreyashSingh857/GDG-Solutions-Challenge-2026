'use client';

import { useEffect, useState } from 'react';
import { useShipmentStore } from '../../store/shipmentStore.js';

const STATUS_FILTERS = [
  { id: 'all', label: 'All', key: 'A', color: 'var(--text-secondary)' },
  { id: 'active', label: 'Active', key: 'V', color: 'var(--accent-green)' },
  { id: 'delayed', label: 'Delayed', key: 'D', color: 'var(--accent-red)' },
  { id: 'rerouted', label: 'Rerouted', key: 'R', color: 'var(--accent-blue)' },
  { id: 'disrupted', label: 'Disrupted', key: 'X', color: 'var(--accent-amber)' },
];

function MiniSparkline({ status, shipments }) {
  const last20 = shipments.slice(-20);
  
  return (
    <div className="flex gap-[1px] h-2 px-1">
      {last20.map((s, i) => (
        <div 
          key={i} 
          className="w-[3px] rounded-t-[1px]" 
          style={{ 
            height: '7px',
            backgroundColor: s.status === status ? 'currentColor' : 'rgba(255,255,255,0.05)' 
          }}
        />
      ))}
    </div>
  );
}

export default function GlobeControls({ onFilterChange, showSimulationControls = false }) {
  const [activeFilter, setActiveFilter] = useState('all');
  const [injecting, setInjecting] = useState(null);
  const shipments = useShipmentStore((s) => s.shipments);

  const handleFilter = (filter) => {
    setActiveFilter(filter);
    onFilterChange(filter);
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      const keyMap = { 'a': 'all', 'v': 'active', 'd': 'delayed', 'r': 'rerouted', 'x': 'disrupted' };
      const filter = keyMap[e.key.toLowerCase()];
      if (filter) {
        setActiveFilter(filter);
        onFilterChange(filter);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onFilterChange]);

  async function injectScenario(name) {
    setInjecting(name);
    try {
      await fetch('/api/webhooks/disruption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario: name.toLowerCase().replace(/ /g, '_') }),
      });
    } finally {
      setInjecting(null);
    }
  }

  return (
    <div className="absolute top-20 left-6 z-40 flex flex-col gap-4">
      <div className="bg-[var(--bg-overlay)] backdrop-blur-xl border border-[var(--border-subtle)] rounded-2xl p-4 shadow-2xl min-w-[180px] space-y-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--text-muted)] mb-3 pl-1">Operational Filter</p>
          <div className="space-y-1">
            {STATUS_FILTERS.map((f) => {
              const active = activeFilter === f.id;
              const count = f.id === 'all' 
                ? shipments.length 
                : shipments.filter(s => s.status === f.id).length;
                
              return (
                <button
                  key={f.id}
                  onClick={() => handleFilter(f.id)}
                  style={{ color: f.color }}
                  className={`w-full group flex flex-col items-start gap-1 p-2 rounded-lg transition-all relative ${active ? 'bg-white/5' : 'hover:bg-white/[0.03]'}`}
                >
                  <div className="w-full flex items-center justify-between">
                    <span className={`text-[11px] font-bold tracking-tight uppercase ${active ? '' : 'text-[var(--text-muted)]'}`}>
                      {f.label} <span className="text-[9px] opacity-40 ml-1 font-mono">[{f.key}]</span>
                    </span>
                    <span className="text-[11px] font-mono opacity-50">{count}</span>
                  </div>
                  
                  {f.id !== 'all' && (
                    <MiniSparkline status={f.id} shipments={shipments} />
                  )}

                  {active && (
                    <div className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full shadow-[0_-2px_6px_currentColor]" style={{ backgroundColor: 'currentColor' }} />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {showSimulationControls && (
        <div className="bg-[var(--bg-overlay)] backdrop-blur-xl border border-[var(--border-subtle)] rounded-2xl p-4 shadow-2xl space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--text-muted)] pl-1">Simulation</p>
          <div className="grid grid-cols-1 gap-2">
            {['Pacific Storm', 'Port Strike', 'Suez Closure'].map((name) => (
              <button
                key={name}
                onClick={() => injectScenario(name)}
                className="text-[11px] font-bold uppercase tracking-wider px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent-cyan)]/40 transition-all flex items-center justify-between group"
              >
                <span>{name}</span>
                {injecting === name ? (
                  <div className="w-3 h-3 rounded-full border-2 border-[var(--accent-cyan)] border-t-transparent animate-spin" />
                ) : (
                  <div className="w-1 h-1 rounded-full bg-[var(--text-muted)] group-hover:bg-[var(--accent-cyan)] transition-colors" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}