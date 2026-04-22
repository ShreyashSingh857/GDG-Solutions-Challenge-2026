'use client';

import { Pause, Play } from 'lucide-react';

/**
 * Toggle globe rendering to prevent loading/rendering when it is not needed.
 * @param {{ isActive:boolean, isPageVisible:boolean, onToggle:()=>void }} props
 */
export default function GlobeActivationToggle({ isActive, isPageVisible, onToggle }) {
  return (
    <div className="absolute bottom-6 right-6 z-40">
      <button
        type="button"
        onClick={onToggle}
        className={`group flex items-center gap-3 rounded-2xl border px-4 py-2.5 transition-all duration-300 shadow-2xl backdrop-blur-xl ${
          isActive 
            ? 'bg-[var(--bg-overlay)] border-[var(--border-subtle)] text-[var(--text-secondary)]' 
            : 'bg-[var(--accent-amber)]/10 border-[var(--accent-amber)]/30 text-[var(--accent-amber)]'
        }`}
        aria-pressed={isActive}
        aria-label={isActive ? 'Pause globe rendering' : 'Resume globe rendering'}
        title={isActive ? 'Pause globe rendering' : 'Resume globe rendering'}
      >
        <div className={`relative flex items-center justify-center w-5 h-5 rounded-full border border-current/30 transition-transform group-hover:scale-110`}>
          {isActive ? (
            <Pause className="h-2.5 w-2.5 fill-current" />
          ) : (
            <Play className="h-2.5 w-2.5 fill-current ml-0.5" />
          )}
        </div>
        <div className="text-left">
          <div className="text-[9px] font-bold uppercase tracking-[0.2em] opacity-40 leading-none mb-1">Engine State</div>
          <div className="text-[11px] font-bold tracking-tight uppercase">
            {isPageVisible ? (isActive ? 'System Active' : 'Rendering Paused') : 'Tab Sleeping'}
          </div>
        </div>
      </button>
    </div>
  );
}
