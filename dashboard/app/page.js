'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Toaster } from 'sonner';
import { useAlertStore } from './store/alertStore.js';
import AgentStatusBadge from './components/agent/AgentStatusBadge.jsx';
import AgentTrigger from './components/AgentTrigger.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import NavBar from './components/NavBar.jsx';
import MinimalErrorFallback from './components/MinimalErrorFallback.jsx';
import { registerPushSubscription } from './lib/pushNotifications.js';
import { useShipmentStore } from './store/shipmentStore.js';

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
const GlobeView = dynamic(() => import(/* webpackPrefetch: false */ './components/globe/GlobeView.jsx'), {
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
  const shouldLoadGlobe = globeEnabled;
  const shipments = useShipmentStore((s) => s.shipments);
  const disruptions = useAlertStore((s) => s.disruptions);
  const newsAlerts = useAlertStore((s) => s.newsAlerts);

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
        <ErrorBoundary fallback={<MinimalErrorFallback name="Decision Modal" />}>
          <DecisionModal />
        </ErrorBoundary>
        {isMobile ? (
          <ErrorBoundary fallback={<MinimalErrorFallback name="Mobile View" />}>
            <div className="absolute inset-0 bg-[#020617]">
              <MobileView />
            </div>
          </ErrorBoundary>
        ) : isGlobeActive ? (
          <ErrorBoundary fallback={<div className="flex items-center justify-center w-full h-full bg-[#020617] text-white/40 text-sm">Globe unavailable - WebGL may not be supported</div>}>
            <div className="absolute inset-0">
              {shouldLoadGlobe ? (
                <GlobeView />
              ) : (
                <div className="flex items-center justify-center w-full h-full bg-[#020617] text-white/40">Loading globe...</div>
              )}
            </div>
          </ErrorBoundary>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#020617] gap-8 px-6 text-center">
            <p className="text-white/30 text-sm">Globe paused · Tab inactive</p>
            <div className="flex flex-wrap gap-4 justify-center">
              <PausedKpiCard label="Active Shipments" value={shipments.filter((s) => s.status === 'active').length} />
              <PausedKpiCard label="Disruptions" value={disruptions.length} color="text-red-400" />
              <PausedKpiCard label="News Alerts" value={newsAlerts.length} color="text-cyan-400" />
            </div>
            <button
              onClick={() => setGlobeEnabled(true)}
              className="text-xs text-white/40 hover:text-white/70 border border-white/10 rounded-full px-4 py-1.5 transition-colors"
            >
              Resume Globe
            </button>
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
          <ErrorBoundary fallback={<MinimalErrorFallback name="Agent Panel" />}>
            <AgentPanel
              isOpen={panelOpen}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              onClose={() => setPanelOpen(false)}
            />
          </ErrorBoundary>
        ) : null}
      </div>
    </div>
  );
}

function PausedKpiCard({ label, value, color = 'text-white' }) {
  return (
    <div className="min-w-36 rounded-2xl border border-white/10 bg-white/5 px-5 py-4 backdrop-blur-sm">
      <div className="text-[10px] uppercase tracking-[0.25em] text-white/35">{label}</div>
      <div className={`mt-2 text-3xl font-light font-mono ${color}`}>{value}</div>
    </div>
  );
}
