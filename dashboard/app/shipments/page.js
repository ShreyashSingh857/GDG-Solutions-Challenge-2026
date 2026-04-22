'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Download, PackageSearch, Plus, ShipWheel, Upload } from 'lucide-react';
import { motion } from 'framer-motion';
import NavBar from '../components/NavBar.jsx';
import { useShipmentStore } from '../store/shipmentStore.js';
import { PAGE_ENTER } from '../lib/motion.js';

const OverviewTab = dynamic(() => import('./components/OverviewTab.jsx'), {
  ssr: false,
  loading: () => <div className="p-8 text-[var(--text-muted)] text-sm">Loading overview...</div>,
});

const ShipmentsTab = dynamic(() => import('./components/ShipmentsTab.jsx'), {
  ssr: false,
  loading: () => <div className="p-8 text-[var(--text-muted)] text-sm">Loading shipments...</div>,
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
    <div className="flex flex-col h-screen bg-[var(--bg-base)] text-[var(--text-primary)] overflow-hidden">
      <NavBar />
      
      <div className="flex items-center justify-between px-6 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-overlay)] backdrop-blur-md z-30">
        <div className="flex bg-[var(--bg-elevated)] p-1 rounded-xl border border-[var(--border-subtle)] gap-0.5">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={[
                'px-4 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2',
                activeTab === tab.id
                  ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-overlay)]/40',
              ].join(' ')}
            >
              <tab.icon className="w-4 h-4" aria-hidden="true" />
              {tab.label}
            </button>
          ))}
        </div>
        
        {activeTab === 'shipments' && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsImportModalOpen(true)}
              className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] transition-colors"
            >
              <Upload className="w-4 h-4" />
              Import
            </button>
            <button
              onClick={handleExport}
              disabled={isExporting || isLoading || shipments.length === 0}
              className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] transition-colors disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              {isExporting ? 'Exporting...' : 'Export'}
            </button>
            <button
              onClick={openAdd}
              className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium bg-[var(--accent-blue)] hover:brightness-110 text-white transition-all shadow-lg shadow-blue-500/20"
            >
              <Plus className="w-4 h-4" />
              Add Shipment
            </button>
          </div>
        )}
      </div>

      <motion.div 
        variants={PAGE_ENTER}
        initial="hidden"
        animate="visible"
        className="flex-1 overflow-y-auto custom-scrollbar"
      >
        {activeTab === 'overview' && <OverviewTab shipments={shipments} isLoading={isLoading} />}
        {activeTab === 'shipments' && (
          <ShipmentsTab shipments={shipments} isLoading={isLoading} onEdit={openEdit} />
        )}
      </motion.div>

      {modalState.open && (
        <ShipmentModal
          shipment={modalState.shipment}
          onClose={closeModal}
          onDelete={closeModal}
        />
      )}
      {isImportModalOpen && (
        <ShipmentImportModal onClose={() => setIsImportModalOpen(false)} />
      )}
    </div>
  );
}
