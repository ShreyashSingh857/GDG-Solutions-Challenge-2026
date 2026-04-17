'use client';

import { useState } from 'react';
import NavBar from '../components/NavBar.jsx';
import { useShipments } from '../hooks/useShipments.js';
import { useShipmentStore } from '../store/shipmentStore.js';
import OverviewTab from './components/OverviewTab.jsx';
import ShipmentsTab from './components/ShipmentsTab.jsx';
import ShipmentModal from './components/ShipmentModal.jsx';

const TABS = [
  { id: 'overview', label: 'Overview', icon: '📊' },
  { id: 'shipments', label: 'Shipments', icon: '🚢' },
];

export default function DetailsPage() {
  const [activeTab, setActiveTab] = useState('overview');
  const [modalState, setModalState] = useState({ open: false, shipment: null });

  // Mount Firestore subscription (same hook as Globe page)
  useShipments();
  const shipments = useShipmentStore((s) => s.shipments);
  const isLoading = useShipmentStore((s) => s.isLoading);

  const openAdd = () => setModalState({ open: true, shipment: null });
  const openEdit = (shipment) => setModalState({ open: true, shipment });
  const closeModal = () => setModalState({ open: false, shipment: null });

  return (
    <div className="flex flex-col h-screen bg-[#020617] text-white overflow-hidden">
      <NavBar />
      <div className="flex items-center justify-between px-6 py-3 border-b border-white/5 bg-black/40">
        <div className="flex gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={[
                'px-4 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2',
                activeTab === tab.id
                  ? 'bg-blue-600/30 border border-blue-500/40 text-blue-200'
                  : 'text-white/40 hover:text-white/70 hover:bg-white/5',
              ].join(' ')}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
        {activeTab === 'shipments' && (
          <button
            onClick={openAdd}
            className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors"
          >
            <svg viewBox="0 0 16 16" className="w-4 h-4" fill="currentColor" aria-hidden="true">
              <path d="M8 2a1 1 0 0 1 1 1v4h4a1 1 0 0 1 0 2H9v4a1 1 0 0 1-2 0V9H3a1 1 0 0 1 0-2h4V3a1 1 0 0 1 1-1z" />
            </svg>
            Add Shipment
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {activeTab === 'overview' && <OverviewTab shipments={shipments} isLoading={isLoading} />}
        {activeTab === 'shipments' && (
          <ShipmentsTab shipments={shipments} isLoading={isLoading} onEdit={openEdit} />
        )}
      </div>

      {modalState.open && (
        <ShipmentModal
          shipment={modalState.shipment}
          onClose={closeModal}
        />
      )}
    </div>
  );
}
