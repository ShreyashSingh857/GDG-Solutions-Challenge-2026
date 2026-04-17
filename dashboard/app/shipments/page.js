'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { PackageSearch, Plus, ShipWheel } from 'lucide-react';
import NavBar from '../components/NavBar.jsx';
import { useShipments } from '../hooks/useShipments.js';
import { useShipmentStore } from '../store/shipmentStore.js';

const OverviewTab = dynamic(() => import('./components/OverviewTab.jsx'), {
  ssr: false,
  loading: () => <div className="p-8 text-white/40 text-sm">Loading overview...</div>,
});

const ShipmentsTab = dynamic(() => import('./components/ShipmentsTab.jsx'), {
  ssr: false,
  loading: () => <div className="p-8 text-white/40 text-sm">Loading shipments...</div>,
});

const ShipmentModal = dynamic(() => import('./components/ShipmentModal.jsx'), {
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
              <tab.icon className="w-4 h-4" aria-hidden="true" />
              {tab.label}
            </button>
          ))}
        </div>
        {activeTab === 'shipments' && (
          <button
            onClick={openAdd}
            className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
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
