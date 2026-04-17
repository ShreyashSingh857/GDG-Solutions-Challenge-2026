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
import AgentTrigger from './components/AgentTrigger.jsx';
import AgentPanel from './components/AgentPanel.jsx';
import DecisionModal from './components/decision/DecisionModal.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import NavBar from './components/NavBar.jsx';

const GlobeView = dynamic(() => import('./components/globe/GlobeView.jsx'), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center w-full h-full bg-[#020617] text-white/40">Loading globe...</div>,
});

export default function Home() {
  const [panelOpen, setPanelOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('agent');

  useEffect(() => {
    const unsub = useAlertStore.subscribe(
      (s) => s.activeDisruptionId,
      (id) => {
        if (id) {
          setPanelOpen(true);
          setActiveTab('agent');
        }
      }
    );
    return unsub;
  }, []);

  useShipments();
  useDisruptions();
  useResolutions();

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#020617]">
      <NavBar />
      <div className="relative flex-1 overflow-hidden">
        <Toaster position="bottom-right" theme="dark" />
        <AlertToastController />
        <DecisionModal />
        <ErrorBoundary fallback={<div className="flex items-center justify-center w-full h-full bg-[#020617] text-white/40 text-sm">Globe unavailable - WebGL may not be supported</div>}>
          <div className="absolute inset-0">
            <GlobeView />
          </div>
          <AgentStatusBadge />
          <AgentTrigger isOpen={panelOpen} onClick={() => setPanelOpen((v) => !v)} />
          <AgentPanel
            isOpen={panelOpen}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onClose={() => setPanelOpen(false)}
          />
        </ErrorBoundary>
      </div>
    </div>
  );
}
