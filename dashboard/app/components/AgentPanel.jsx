'use client';

import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import AgentChatSidebar from './agent/AgentChatSidebar.jsx';
import NewsFeed from './news/NewsFeed.jsx';

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
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', onClick);
    };
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="absolute inset-0 z-30 pointer-events-none">
          <motion.div
            ref={panelRef}
            key="agent-panel"
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            style={{ transformOrigin: 'bottom right' }}
            className={[
              'absolute bottom-24 right-6 z-30 pointer-events-auto',
              'w-100 max-h-[70vh] flex flex-col',
              'bg-gray-950/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl',
              'overflow-hidden',
            ].join(' ')}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
              <div className="flex gap-1 bg-white/5 rounded-lg p-0.5">
                {TABS.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => onTabChange(tab.id)}
                    className={[
                      'px-3 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1.5',
                      activeTab === tab.id
                        ? 'bg-white/15 text-white shadow-sm'
                        : 'text-white/40 hover:text-white/70',
                    ].join(' ')}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <button
                onClick={onClose}
                className="w-7 h-7 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors"
                aria-label="Close panel"
              >
                <svg
                  viewBox="0 0 14 14"
                  className="w-3 h-3 text-white/50"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M1 1l12 12M13 1L1 13" />
                </svg>
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-hidden">
              {activeTab === 'agent' && (
                <div className="h-full overflow-y-auto custom-scrollbar">
                  <AgentChatSidebar />
                </div>
              )}
              {activeTab === 'news' && (
                <div className="h-full overflow-y-auto custom-scrollbar p-3">
                  <NewsFeed />
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
