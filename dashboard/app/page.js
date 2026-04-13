'use client';

import dynamic from 'next/dynamic';
import { Toaster } from 'sonner';
import { useShipments } from './hooks/useShipments.js';
import { useDisruptions } from './hooks/useDisruptions.js';
import { useResolutions } from './hooks/useResolutions.js';
import AlertToastController from './components/alerts/AlertToast.jsx';
import AgentStatusBadge from './components/agent/AgentStatusBadge.jsx';
import AgentChatSidebar from './components/agent/AgentChatSidebar.jsx';
import DecisionModal from './components/decision/DecisionModal.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';

const GlobeView = dynamic(() => import('./components/globe/GlobeView.jsx'), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center w-full h-full bg-[#020617] text-white/40">Loading globe...</div>,
});

export default function Home() {
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
        <div className="w-[30%] min-w-[300px] max-w-[420px] h-full flex-shrink-0">
          <AgentChatSidebar />
        </div>
      </ErrorBoundary>
    </div>
  );
}
