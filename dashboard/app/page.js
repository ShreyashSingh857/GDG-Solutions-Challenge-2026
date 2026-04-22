'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Toaster } from 'sonner';
import { useAlertStore } from './store/alertStore.js';
import AgentStatusBadge from './components/agent/AgentStatusBadge.jsx';
import AgentTrigger from './components/AgentTrigger.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import NavBar from './components/NavBar.jsx';
import { registerPushSubscription } from './lib/pushNotifications.js';

const AlertToastController = dynamic(() => import('./components/alerts/AlertToast.jsx'), {
  ssr: false,
  loading: () => null,
});
const AgentPanel = dynamic(() => import('./components/AgentPanel.jsx'), {
  ssr: false,
  loading: () => null,
});
const DecisionModal = dynamic(() => import('./components/decision/DecisionModal.jsx'), {
  ssr: false,
  loading: () => null,
});
const GlobeActivationToggle = dynamic(() => import('./components/globe/GlobeActivationToggle.jsx'), {
  ssr: false,
  loading: () => null,
});
const GlobeView = dynamic(() => import('./components/globe/GlobeView.jsx'), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center w-full h-full bg-[#020617] text-white/40">Loading globe...</div>,
});
const MobileView = dynamic(() => import('./components/globe/MobileView.jsx'), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center w-full h-full bg-[#020617] text-white/40">Loading mobile view...</div>,
});

export default function Home() {
  const [panelOpen, setPanelOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('agent');
  const [globeEnabled, setGlobeEnabled] = useState(true);
  const [isPageVisible, setIsPageVisible] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const isGlobeActive = globeEnabled && isPageVisible;

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

  useEffect(() => {
    const handleVisibility = () => {
      setIsPageVisible(document.visibilityState === 'visible');
    };

    handleVisibility();
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  useEffect(() => {
    const syncViewport = () => {
      setIsMobile(window.innerWidth < 768);
    };

    syncViewport();
    window.addEventListener('resize', syncViewport);
    return () => window.removeEventListener('resize', syncViewport);
  }, []);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return;
    if (typeof window === 'undefined') return;
    if (!('Notification' in window) || Notification.permission === 'denied') return;

    const promptedKey = 'gdg_push_prompted';
    const alreadyPrompted = window.localStorage.getItem(promptedKey) === '1';
    if (Notification.permission === 'default' && alreadyPrompted) return;

    registerPushSubscription()
      .catch(() => null)
      .finally(() => window.localStorage.setItem(promptedKey, '1'));
  }, []);

  return (
    <div data-globe="true" className="flex flex-col h-screen w-screen overflow-hidden bg-[#020617]">
      <NavBar />
      <div className="relative flex-1 overflow-hidden">
        <Toaster position="bottom-right" theme="dark" />
        <AlertToastController />
        <DecisionModal />
        {isMobile ? (
          <div className="absolute inset-0 bg-[#020617]">
            <MobileView />
          </div>
        ) : isGlobeActive ? (
          <ErrorBoundary fallback={<div className="flex items-center justify-center w-full h-full bg-[#020617] text-white/40 text-sm">Globe unavailable - WebGL may not be supported</div>}>
            <div className="absolute inset-0">
              <GlobeView />
            </div>
          </ErrorBoundary>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-[#020617] text-sm text-white/45">
            Globe is paused while inactive.
          </div>
        )}
        <AgentStatusBadge />
        <GlobeActivationToggle
          isActive={globeEnabled}
          isPageVisible={isPageVisible}
          onToggle={() => setGlobeEnabled((prev) => !prev)}
        />
        <AgentTrigger isOpen={panelOpen} onClick={() => setPanelOpen((v) => !v)} />
        {panelOpen ? (
          <AgentPanel
            isOpen={panelOpen}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onClose={() => setPanelOpen(false)}
          />
        ) : null}
      </div>
    </div>
  );
}
