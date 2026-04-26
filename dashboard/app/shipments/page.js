'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Download, PackageSearch, Plus, ShipWheel, Upload } from 'lucide-react';
import { motion } from 'framer-motion';
import NavBar from '../components/NavBar.jsx';
import ErrorBoundary from '../components/ErrorBoundary.jsx';
import MinimalErrorFallback from '../components/MinimalErrorFallback.jsx';
import { useShipmentStore } from '../store/shipmentStore.js';
import { PAGE_ENTER } from '../lib/motion.js';

const OverviewTab = dynamic(() => import('./components/OverviewTab.jsx'), {
  ssr: false,
  loading: () => <ShipmentsPageSkeleton />, 
});

const ShipmentsTab = dynamic(() => import('./components/ShipmentsTab.jsx'), {
  ssr: false,
  loading: () => <ShipmentsPageSkeleton />,
});

const ShipmentModal = dynamic(() => import('./components/ShipmentModal.jsx'), {
  ssr: false,
  loading: () => null,
});

const ShipmentImportModal = dynamic(() => import('./components/ShipmentImportModal.jsx'), {
  ssr: false,
  loading: () => null,
});

const TABS = [
  { id: 'overview', label: 'Overview', icon: PackageSearch },
  { id: 'shipments', label: 'Shipments', icon: ShipWheel },
];

export default function DetailsPage() {
  const [activeTab, setActiveTab] = useState('overview');
  const [modalState, setModalState] = useState({ open: false, shipment: null });
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const shipments = useShipmentStore((s) => s.shipments);
  const isLoading = useShipmentStore((s) => s.isLoading);

  const openAdd = () => setModalState({ open: true, shipment: null });
  const openEdit = (shipment) => setModalState({ open: true, shipment });
  const closeModal = () => setModalState({ open: false, shipment: null });

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const XLSX = await import('xlsx');
      const rows = shipments.map((shipment) => ({
        ID: shipment.id,
        Origin: shipment.origin,
        Destination: shipment.destination,
        Status: shipment.status,
        Carrier: shipment.carrier,
        CargoValueUSD: shipment.cargoValueUSD,
        ETA: shipment.eta,
        Corridor: shipment.corridor,
        Mode: shipment.mode,
        TrackingNumber: shipment.trackingNumber,
      }));

      const sheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet, 'Shipments');

      const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
      XLSX.writeFile(workbook, `shipments-${stamp}.xlsx`);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[var(--bg-base)] text-[var(--text-primary)] overflow-hidden relative">
      {/* Ambient background blur for glass effect */}
      <div className="absolute top-[-10%] right-[-5%] w-[40%] h-[40%] bg-[var(--accent-blue)]/5 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-5%] w-[30%] h-[30%] bg-[var(--accent-cyan)]/5 blur-[100px] rounded-full pointer-events-none" />

      <NavBar />
      
      <div className="flex flex-col px-6 py-4 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/20 backdrop-blur-md z-30 space-y-4">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--text-muted)]">
          <span className="hover:text-[var(--text-primary)] transition-colors cursor-pointer">OpenTrade</span>
          <span className="opacity-30">/</span>
          <span className="text-[var(--text-secondary)]">Logistics</span>
          <span className="opacity-30">/</span>
          <span className="text-[var(--text-primary)]">{activeTab === 'overview' ? 'Overview' : 'Shipment Management'}</span>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex bg-[var(--bg-elevated)]/30 rounded-2xl p-1 gap-1 border border-[var(--border-subtle)] backdrop-blur-sm">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={[
                  'px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all flex items-center gap-2',
                  activeTab === tab.id
                    ? 'bg-[var(--glass-bg-elevated)] text-[var(--text-primary)] shadow-sm border border-[var(--glass-border)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-overlay)]/40',
                ].join(' ')}
              >
                <tab.icon className={`w-3.5 h-3.5 ${activeTab === tab.id ? 'text-[var(--accent-cyan)]' : 'opacity-60'}`} aria-hidden="true" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>
          
          {activeTab === 'shipments' && (
            <div className="flex items-center gap-3">
              <div className="hidden md:flex items-center gap-3">
                <button
                  onClick={() => setIsImportModalOpen(true)}
                  className="h-10 flex items-center gap-2 px-4 rounded-xl text-[10px] font-bold uppercase tracking-widest border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/20 hover:bg-[var(--bg-elevated)]/50 text-[var(--text-secondary)] transition-all active:scale-95"
                >
                  <Upload className="w-4 h-4" />
                  Import
                </button>
                <button
                  onClick={handleExport}
                  disabled={isExporting || isLoading || shipments.length === 0}
                  className="h-10 flex items-center gap-2 px-4 rounded-xl text-[10px] font-bold uppercase tracking-widest border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/20 hover:bg-[var(--bg-elevated)]/50 text-[var(--text-secondary)] transition-all active:scale-95 disabled:opacity-50"
                >
                  <Download className="w-4 h-4" />
                  {isExporting ? 'Exporting...' : 'Export Data'}
                </button>
              </div>
              <button
                onClick={openAdd}
                className="h-10 flex items-center gap-2 px-5 rounded-xl text-[10px] font-bold uppercase tracking-widest bg-[var(--accent-blue)] hover:brightness-110 text-white transition-all active:scale-95 shadow-xl shadow-blue-500/20"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Add Shipment</span>
              </button>
            </div>
          )}
        </div>
      </div>

      <motion.div 
        variants={PAGE_ENTER}
        initial="hidden"
        animate="visible"
        className="flex-1 overflow-y-auto custom-scrollbar relative z-10"
      >
        {!isLoading && shipments.length === 0 ? (
          <EmptyState onAdd={openAdd} />
        ) : (
          <div className="p-6">
            {activeTab === 'overview' && (
              <ErrorBoundary fallback={<MinimalErrorFallback name="Overview Tab" />}>
                <OverviewTab shipments={shipments} isLoading={isLoading} />
              </ErrorBoundary>
            )}
            {activeTab === 'shipments' && (
              <ErrorBoundary fallback={<MinimalErrorFallback name="Shipments Tab" />}>
                <ShipmentsTab shipments={shipments} isLoading={isLoading} onEdit={openEdit} />
              </ErrorBoundary>
            )}
          </div>
        )}
      </motion.div>

      {modalState.open && (
        <ErrorBoundary fallback={<MinimalErrorFallback name="Shipment Modal" />}>
          <ShipmentModal
            shipment={modalState.shipment}
            onClose={closeModal}
            onDelete={closeModal}
          />
        </ErrorBoundary>
      )}
      {isImportModalOpen && (
        <ErrorBoundary fallback={<MinimalErrorFallback name="Shipment Import Modal" />}>
          <ShipmentImportModal onClose={() => setIsImportModalOpen(false)} />
        </ErrorBoundary>
      )}
    </div>
  );
}

function EmptyState({ onAdd }) {
  return (
    <div className="h-full flex flex-col items-center justify-center p-8 text-center">
      <div className="relative mb-6">
        <div className="absolute inset-0 bg-[var(--accent-cyan)]/10 blur-3xl rounded-full" />
        <ShipWheel className="w-24 h-24 text-[var(--text-muted)] opacity-20 relative animate-pulse-slow" />
      </div>
      <h3 className="text-xl font-bold tracking-tight mb-2">No shipments yet</h3>
      <p className="text-sm text-[var(--text-secondary)] max-w-sm mb-8">
        Add your first shipment to start tracking cargo in real time across global trade corridors.
      </p>
      <button
        onClick={onAdd}
        className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-[var(--accent-blue)] text-white text-xs font-bold uppercase tracking-widest hover:brightness-110 transition-all active:scale-95 shadow-xl shadow-[var(--accent-blue)]/20"
      >
        <Plus className="w-4 h-4" />
        Add your first shipment
      </button>
    </div>
  );
}

function ShipmentsPageSkeleton() {
  return (
    <div className="flex-1 p-6 space-y-8">
      <div className="h-10 w-72 rounded-xl bg-[var(--bg-elevated)] animate-pulse" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-6">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-24 rounded-2xl glass-panel !bg-[var(--bg-elevated)]/40 animate-pulse" />
        ))}
      </div>
      <div className="glass-panel glass-edge !bg-[var(--bg-elevated)]/20 p-6 space-y-6">
        <div className="flex justify-between items-center">
          <div className="h-9 w-64 rounded-xl bg-[var(--bg-elevated)] animate-pulse" />
          <div className="h-9 w-32 rounded-xl bg-[var(--bg-elevated)] animate-pulse" />
        </div>
        <div className="h-[400px] rounded-2xl bg-[var(--bg-elevated)]/40 animate-pulse border border-[var(--border-subtle)]" />
      </div>
    </div>
  );
}
