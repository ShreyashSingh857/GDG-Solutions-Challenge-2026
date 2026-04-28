'use client';

import { useAlertStore } from '../store/alertStore.js';

const HEX_CLIP = 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)';

/**
 * @param {{ isOpen: boolean, onClick: () => void }} props
 */
export default function AgentTrigger({ isOpen, onClick }) {
  const hasActiveDisruption = useAlertStore((s) => Boolean(s.activeDisruptionId));
  const newsCount = useAlertStore((s) => s.newsAlerts.length);

  return (
    <div className="absolute bottom-6 right-6 z-20">
      {hasActiveDisruption && !isOpen && (
        <span
          className="hex-pulse absolute inset-0 opacity-40 bg-blue-500"
          style={{ clipPath: HEX_CLIP, width: 52, height: 52 }}
        />
      )}

      <button
        onMouseDown={(e) => e.preventDefault()}
        onClick={onClick}
        title={isOpen ? 'Close AI Agent Panel' : 'Open AI Agent Panel'}
        style={{ clipPath: HEX_CLIP, width: 52, height: 52 }}
        className={[
          'flex flex-col items-center justify-center gap-0.5',
          'glass-panel !rounded-none transition-all duration-300',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400',
          isOpen
            ? '!bg-[var(--accent-blue)]/30 !border-[var(--accent-blue)]/50'
            : 'hover:!border-[var(--accent-blue)]/40 hover:!bg-[var(--glass-bg-elevated)]',
        ].join(' ')}
      >
        <svg viewBox="0 0 20 20" className="w-5 h-5 text-blue-300" fill="currentColor" aria-hidden="true">
          <path d="M10 2a1 1 0 0 1 1 1v.5a3.5 3.5 0 0 1 2.5 3.3V9a1 1 0 1 1-2 0V6.8A1.5 1.5 0 0 0 10 5.5 1.5 1.5 0 0 0 8.5 6.8V9a1 1 0 1 1-2 0V6.8A3.5 3.5 0 0 1 9 3.5V3a1 1 0 0 1 1-1zM6 11a4 4 0 0 0 8 0H6z" />
        </svg>
        {newsCount > 0 && (
          <span className="text-[9px] font-bold text-cyan-300 leading-none">
            {newsCount > 9 ? '9+' : newsCount}
          </span>
        )}
      </button>
    </div>
  );
}
