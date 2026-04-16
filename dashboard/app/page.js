'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Toaster } from 'sonner';
import { useShipments } from './hooks/useShipments.js';
import { useDisruptions } from './hooks/useDisruptions.js';
import { useResolutions } from './hooks/useResolutions.js';
import { useAlertStore } from './store/alertStore.js';
import AlertToastController from './components/alerts/AlertToast.jsx';
import AgentStatusBadge from './components/agent/AgentStatusBadge.jsx';
import AgentChatSidebar from './components/agent/AgentChatSidebar.jsx';
import NewsFeed from './components/news/NewsFeed.jsx';
import DecisionModal from './components/decision/DecisionModal.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';

const GlobeView = dynamic(() => import('./components/globe/GlobeView.jsx'), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center w-full h-full bg-[#020617] text-white/40">Loading globe...</div>,
});

export default function Home() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const unsub = useAlertStore.subscribe(
      (s) => s.activeDisruptionId,
      (id) => { if (id) setSidebarOpen(true); }
    );
    return unsub;
  }, []);

  useShipments();
  useDisruptions();
  useResolutions();

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#020617]">
      <Toaster position="bottom-right" theme="dark" />
      <AlertToastController />
      <DecisionModal />
      <ErrorBoundary fallback={<div className="flex items-center justify-center w-full h-full bg-[#020617] text-white/40 text-sm">Globe unavailable — WebGL may not be supported</div>}>
        <div className="relative flex-1 h-full">
          <GlobeView />
          <AgentStatusBadge />
        </div>
      </ErrorBoundary>
      <ErrorBoundary>
        <div className={`sidebar ${sidebarOpen ? 'expanded' : 'collapsed'} h-full shrink-0 relative`}>
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="absolute top-3 right-3 z-10 w-7 h-7 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors"
            title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-white/50" fill="none" stroke="currentColor" strokeWidth="2">
              {sidebarOpen ? <path d="M13 18l6-6-6-6" /> : <path d="M11 6l-6 6 6 6" />}
            </svg>
          </button>
          <div className="sidebar-panel flex flex-col">
            <div className="flex-1 min-h-0">
              <AgentChatSidebar />
            </div>
            <div className="border-t border-white/5 bg-black/20 p-3">
              <NewsFeed />
            </div>
          </div>
        </div>
      </ErrorBoundary>
    </div>
  );
}
