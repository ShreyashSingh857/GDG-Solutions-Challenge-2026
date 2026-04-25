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
      className={`group flex items-center gap-2.5 rounded-xl border px-3 py-1.5 transition-all duration-300 glass-panel !shadow-sm ${
        isActive 
          ? '!bg-[var(--glass-bg-elevated)] !border-[var(--glass-border)]' 
          : '!bg-[var(--accent-amber)]/10 !border-[var(--accent-amber)]/30 text-[var(--accent-amber)]'
      }`}
      aria-pressed={isActive}
      aria-label={isActive ? 'Pause globe rendering' : 'Resume globe rendering'}
      title={isActive ? 'Pause globe rendering' : 'Resume globe rendering'}
    >
      <div className={`relative flex items-center justify-center w-4 h-4 rounded-full border border-current/30 transition-transform group-hover:scale-110`}>
        {isActive ? (
          <Pause className="h-2 w-2 fill-current" />
        ) : (
          <Play className="h-2 w-2 fill-current ml-0.5" />
        )}
      </div>
      <div className="text-left hidden md:block">
        <div className="text-[10px] font-bold tracking-tight uppercase leading-none">
          {isPageVisible ? (isActive ? 'Engine Active' : 'Engine Paused') : 'Engine Sleeping'}
        </div>
      </div>
    </button>
  );
}
