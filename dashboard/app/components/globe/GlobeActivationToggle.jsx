'use client';

import { PauseCircle, PlayCircle } from 'lucide-react';

/**
 * Toggle globe rendering to prevent loading/rendering when it is not needed.
 * @param {{ isActive:boolean, isPageVisible:boolean, onToggle:()=>void }} props
 */
export default function GlobeActivationToggle({ isActive, isPageVisible, onToggle }) {
  return (
    <div className="absolute top-4 right-4 z-20">
      <button
        type="button"
        onClick={onToggle}
        className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-black/50 px-3 py-2 text-xs font-medium text-white/80 backdrop-blur-sm transition hover:border-white/30 hover:bg-black/65"
        aria-pressed={isActive}
        aria-label={isActive ? 'Pause globe rendering' : 'Resume globe rendering'}
        title={isActive ? 'Pause globe rendering' : 'Resume globe rendering'}
      >
        {isActive ? (
          <PauseCircle className="h-4 w-4" aria-hidden="true" />
        ) : (
          <PlayCircle className="h-4 w-4" aria-hidden="true" />
        )}
        {isPageVisible ? (isActive ? 'Globe Active' : 'Globe Paused') : 'Tab Inactive'}
      </button>
    </div>
  );
}
