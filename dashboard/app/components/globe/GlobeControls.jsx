'use client';

import { useState } from 'react';
import { useShipmentStore } from '../../store/shipmentStore.js';

const STATUS_FILTERS = ['all', 'active', 'delayed', 'rerouted'];

/**
 * HUD overlay for the globe: status filter buttons and shipment counters.
 * @param {object} props
 * @param {function(string): void} props.onFilterChange
 */
export default function GlobeControls({ onFilterChange }) {
  const [activeFilter, setActiveFilter] = useState('all');
  const [injecting, setInjecting] = useState(null);
  const shipments = useShipmentStore((s) => s.shipments);

  const counts = {
    active: shipments.filter((s) => s.status === 'active').length,
    delayed: shipments.filter((s) => s.status === 'delayed').length,
    rerouted: shipments.filter((s) => s.status === 'rerouted').length,
  };

  const handleFilter = (filter) => {
    setActiveFilter(filter);
    onFilterChange(filter);
  };

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

  const filterColors = {
    all: 'border-white/30 text-white/70 hover:border-white/60',
    active: 'border-green-500/50 text-green-400 hover:border-green-400',
    delayed: 'border-red-500/50 text-red-400 hover:border-red-400',
    rerouted: 'border-blue-500/50 text-blue-400 hover:border-blue-400',
  };

  const activeColors = {
    all: 'bg-white/10 border-white/60 text-white',
    active: 'bg-green-500/20 border-green-400 text-green-300',
    delayed: 'bg-red-500/20 border-red-400 text-red-300',
    rerouted: 'bg-blue-500/20 border-blue-400 text-blue-300',
  };

  return (
    <div className="absolute top-4 left-4 z-10 flex flex-col gap-3">
      <div className="bg-black/50 backdrop-blur-md border border-white/10 rounded-xl p-3 flex flex-col gap-2">
        <p className="text-white/40 text-xs uppercase tracking-widest font-medium">Filter</p>
        <div className="flex flex-col gap-1">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter}
              onClick={() => handleFilter(filter)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-all capitalize ${
                activeFilter === filter ? activeColors[filter] : filterColors[filter]
              }`}
            >
              {filter === 'all' ? `All (${shipments.length})` : `${filter} (${counts[filter]})`}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-black/50 backdrop-blur-md border border-white/10 rounded-xl p-3 flex flex-col gap-2">
        <p className="text-white/40 text-xs uppercase tracking-widest font-medium">Scenarios</p>
        {['Pacific Storm', 'Port Strike', 'Suez Closure'].map((name) => (
          <button
            key={name}
            onClick={() => injectScenario(name)}
            className="text-xs px-3 py-1.5 rounded-lg border border-white/10 text-white/80 hover:border-white/30 transition flex items-center justify-center gap-2"
          >
            {injecting === name ? <span className="w-3 h-3 rounded-full border-2 border-white/60 border-t-transparent animate-spin" /> : null}
            <span>{name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
