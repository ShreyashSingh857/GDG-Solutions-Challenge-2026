'use client';

import { Pause, Play } from 'lucide-react';

/**
 * Toggle globe rendering to prevent loading/rendering when it is not needed.
 * @param {{ isActive:boolean, isPageVisible:boolean, onToggle:()=>void }} props
 */
export default function GlobeActivationToggle({ isActive, isPageVisible, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`group flex items-center gap-3 rounded-xl border px-4 py-2 transition-all duration-500 glass-panel !shadow-lg ${
        isActive 
          ? '!bg-[var(--glass-bg-elevated)] !border-[var(--glass-border-strong)]' 
          : '!bg-[var(--accent-amber)]/20 !border-[var(--accent-amber)]/40 text-[var(--accent-amber)] shadow-[0_0_20px_rgba(245,158,11,0.1)]'
      }`}
      aria-pressed={isActive}
      aria-label={isActive ? 'Pause simulation for performance' : 'Resume high-performance simulation'}
      title={isActive ? 'Pause simulation for performance' : 'Resume high-performance simulation'}
    >
      <div className={`relative flex items-center justify-center w-5 h-5 rounded-full border border-current/40 transition-all duration-500 group-hover:scale-110 ${isActive ? 'animate-spin-slow' : ''}`}>
        {isActive ? (
          <Pause className="h-2.5 w-2.5 fill-current" />
        ) : (
          <Play className="h-2.5 w-2.5 fill-current ml-0.5" />
        )}
      </div>
      <div className="text-left hidden md:block">
        <div className="text-[10px] font-extrabold tracking-[0.15em] uppercase leading-none mb-0.5">
          {isActive ? 'Sim Active' : 'Sim Paused'}
        </div>
        <div className="text-[8px] font-bold opacity-60 uppercase tracking-widest">
          {isActive ? 'High Usage' : 'Performance Mode'}
        </div>
      </div>
    </button>
  );
}
