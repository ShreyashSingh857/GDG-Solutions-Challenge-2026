'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Toaster } from 'sonner';
import { Play } from 'lucide-react';
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
  const [simulationControlsOpen, setSimulationControlsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('agent');
  const [globeEnabled, setGlobeEnabled] = useState(true);
  const [isPageVisible, setIsPageVisible] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [globalStats, setGlobalStats] = useState(null);
  const isGlobeActive = globeEnabled && isPageVisible;
  const shouldLoadGlobe = globeEnabled;
  const shipments = useShipmentStore((s) => s.shipments);
  const disruptions = useAlertStore((s) => s.disruptions);
  const newsAlerts = useAlertStore((s) => s.newsAlerts);
  const activeShipments = shipments.filter((s) => s.status === 'active');
  const cargoUnderProtectionUSD = activeShipments.reduce((sum, shipment) => sum + Number(shipment.cargoValueUSD || 0), 0);

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

  useEffect(() => {
    let cancelled = false;

    const loadStats = async () => {
      try {
        const response = await fetch('/api/visualize/stats', { cache: 'no-store' });
        const payload = await response.json();
        if (!cancelled) {
          setGlobalStats(payload?.data || null);
        }
      } catch {
        if (!cancelled) {
          setGlobalStats(null);
        }
      }
    };

    loadStats();
    const interval = setInterval(() => loadStats().catch(() => {}), 60_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <div data-globe="true" className="flex flex-col h-screen w-screen overflow-hidden bg-[#020617]">
      <NavBar />
      <div className="relative flex-1 overflow-hidden">
        <Toaster position="bottom-right" theme="dark" />
        <div className="absolute left-4 top-4 z-20 pointer-events-none">
          <div className="pointer-events-auto liquid-glass relative px-5 py-4 min-w-[280px]">
            <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--accent-cyan)] font-bold">Pipeline Impact</div>
            <div className="mt-2 text-base font-semibold text-[var(--text-primary)] tracking-tight">
              Cargo under protection: ${(cargoUnderProtectionUSD / 1e6).toFixed(1)}M
            </div>
            <div className="mt-1 text-xs text-[var(--text-secondary)]">
              across {activeShipments.length} active shipments · {shipments.filter((s) => s.status !== 'delivered').length} monitored
            </div>
            <div className="mt-4 flex flex-wrap gap-2 text-[10px] font-bold">
              <span className="rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg-elevated)] px-2.5 py-1.5 text-[var(--text-secondary)] shadow-sm">
                Sessions run: {globalStats?.totalResolutions ?? 0}
              </span>
              <span className="rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg-elevated)] px-2.5 py-1.5 text-[var(--text-secondary)] shadow-sm">
                Human hours saved: {globalStats?.humanHoursSaved ?? 0}
              </span>
              <span className="rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg-elevated)] px-2.5 py-1.5 text-[var(--text-secondary)] shadow-sm">
                Total analyzed: ${((globalStats?.totalCargoAnalyzedUSD ?? 0) / 1e6).toFixed(1)}M
              </span>
            </div>
          </div>
        </div>
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
                <GlobeView simulationControlsOpen={simulationControlsOpen} />
              ) : (
                <div className="flex items-center justify-center w-full h-full bg-[#020617] text-white/40">Loading globe...</div>
              )}
            </div>
          </ErrorBoundary>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#020617] overflow-hidden">
            {/* Ambient Background for Paused State */}
            <div className="absolute inset-0 opacity-20 pointer-events-none">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-[radial-gradient(circle,rgba(34,211,238,0.1)_0%,transparent_70%)] animate-pulse" />
            </div>

            <div className="relative z-10 flex flex-col items-center gap-10 px-6 text-center">
              <div className="space-y-2">
                <p className="text-[var(--text-muted)] text-[10px] font-bold uppercase tracking-[0.4em]">Standby Mode</p>
                <h2 className="text-white/40 text-sm font-medium tracking-tight">Globe paused · Tab inactive</h2>
              </div>

              <div className="flex flex-wrap gap-4 justify-center">
                <PausedKpiCard label="Active Shipments" value={shipments.filter((s) => s.status === 'active').length} />
                <PausedKpiCard label="Disruptions" value={disruptions.length} color="text-[var(--accent-red)]" />
                <PausedKpiCard label="News Alerts" value={newsAlerts.length} color="text-[var(--accent-cyan)]" />
              </div>

              <button
                onClick={() => setGlobeEnabled(true)}
                className="liquid-glass px-10 py-4 text-[10px] font-extrabold uppercase tracking-[0.2em] text-[var(--text-primary)] hover:scale-105 transition-all active:scale-95 cursor-pointer shadow-2xl"
              >
                Resume Live Environment
              </button>
            </div>
          </div>
        )}
        <div className="absolute top-4 right-4 z-40 flex flex-col items-end gap-3 pointer-events-none">
          <button
            onClick={() => setSimulationControlsOpen((prev) => !prev)}
            className={`pointer-events-auto liquid-glass px-4 py-2 rounded-2xl text-[10px] font-bold uppercase tracking-[0.2em] flex items-center gap-2 transition-all ${simulationControlsOpen ? 'border-[var(--accent-cyan)]/40 text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
            title={simulationControlsOpen ? 'Hide simulation controls' : 'Show simulation controls'}
            aria-label="Toggle simulation controls"
          >
            <Play className="w-3.5 h-3.5" />
            Simulation
          </button>
          <div className="pointer-events-auto">
            <GlobeActivationToggle
              isActive={globeEnabled}
              isPageVisible={isPageVisible}
              onToggle={() => setGlobeEnabled((prev) => !prev)}
            />
          </div>
          {isGlobeActive && (
            <div className="pointer-events-auto">
              <AgentStatusBadge />
            </div>
          )}
        </div>
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
    <div className="min-w-44 liquid-glass px-6 py-6 text-left border-white/5">
      <div className="text-[9px] uppercase tracking-[0.25em] text-[var(--text-muted)] font-bold mb-4">{label}</div>
      <div className={`text-4xl font-light font-mono tracking-tighter ${color}`}>{value}</div>
    </div>
  );
}
