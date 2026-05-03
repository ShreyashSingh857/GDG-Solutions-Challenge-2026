'use client';

import { useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { AnimatePresence, motion } from 'framer-motion';

import { PanelSkeleton } from './ui/PanelSkeleton';

const AgentChatSidebar = dynamic(() => import('./agent/AgentChatSidebar.jsx'), {
  ssr: false,
  loading: () => <PanelSkeleton />,
});

const NewsFeed = dynamic(() => import('./news/NewsFeed.jsx'), {
  ssr: false,
  loading: () => <PanelSkeleton />,
});

const TABS = [
  { id: 'agent', label: 'Agent' },
  { id: 'news', label: 'News' },
];

/**
 * @param {{ isOpen:boolean, activeTab:string, onTabChange:(t:string)=>void, onClose:()=>void }} props
 */
export default function AgentPanel({ isOpen, activeTab, onTabChange, onClose }) {
  const panelRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;

    const onClick = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose();
    };

    const timer = setTimeout(() => document.addEventListener('mousedown', onClick), 150);

    // focus panel without scrolling the page
    try {
      panelRef.current?.focus({ preventScroll: true });
    } catch {
      panelRef.current?.focus && panelRef.current.focus();
    }

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', onClick);
    };
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={panelRef}
          tabIndex={-1}
          key="agent-panel"
          initial={{ opacity: 0, scale: 0.95, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 8 }}
          transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
          style={{ transformOrigin: 'bottom right' }}
          className={[
            'fixed bottom-[72px] right-6 z-50 pointer-events-auto',
            'w-[calc(100vw-48px)] sm:w-96 max-h-[60vh] sm:max-h-[70vh] flex flex-col',
            'liquid-glass !rounded-3xl overflow-hidden shadow-2xl',
          ].join(' ')}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
            <div className="flex gap-1.5 bg-[var(--bg-elevated)]/50 rounded-xl p-1 border border-[var(--border-subtle)]">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => onTabChange(tab.id)}
                  className={[
                    'px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 border border-transparent whitespace-nowrap',
                    activeTab === tab.id
                      ? 'bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)] border-[var(--accent-cyan)]/30 shadow-sm shadow-[var(--accent-cyan)]/10'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-overlay)]/40',
                  ].join(' ')}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full glass-panel !shadow-sm flex items-center justify-center hover:bg-[var(--glass-bg-elevated)] hover:!border-[var(--accent-cyan)]/30 transition-all group flex-shrink-0"
              aria-label="Close panel"
            >
              <svg
                viewBox="0 0 14 14"
                className="w-3 h-3 text-[var(--text-muted)] group-hover:text-[var(--text-primary)] transition-colors"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M1 1l12 12M13 1L1 13" />
              </svg>
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            {activeTab === 'agent' && (
              <div className="h-full w-full overflow-y-auto custom-scrollbar">
                <AgentChatSidebar />
              </div>
            )}
            {activeTab === 'news' && (
              <div className="h-full w-full overflow-y-auto custom-scrollbar">
                <NewsFeed />
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
