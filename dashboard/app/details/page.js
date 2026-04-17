'use client';

import { useMemo, useState } from 'react';
import { Toaster } from 'sonner';
import NavBar from '../components/NavBar.jsx';
import { useShipments } from '../hooks/useShipments.js';
import { useShipmentStore } from '../store/shipmentStore.js';
import { useShipmentMutations } from './hooks/useShipmentMutations.js';
import OverviewTab from './components/OverviewTab.jsx';
import ShipmentsTab from './components/ShipmentsTab.jsx';
import ShipmentModal from './components/ShipmentModal.jsx';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'shipments', label: 'Shipments' },
];

export default function DetailsPage() {
  useShipments();

  const shipments = useShipmentStore((s) => s.shipments);
  const [activeTab, setActiveTab] = useState('overview');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingShipment, setEditingShipment] = useState(null);
  const [modalVersion, setModalVersion] = useState(0);

  const { isSaving, saveError, createShipment, updateShipment, deleteShipment } = useShipmentMutations();

  const sortedShipments = useMemo(() => {
    return [...shipments].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  }, [shipments]);

  const onCreate = () => {
    setEditingShipment(null);
    setModalVersion((v) => v + 1);
    setModalOpen(true);
  };

  const onEdit = (shipment) => {
    setEditingShipment(shipment);
    setModalVersion((v) => v + 1);
    setModalOpen(true);
  };

  const onSave = async (payload) => {
    if (editingShipment?.id) {
      await updateShipment(editingShipment.id, payload);
    } else {
      await createShipment(payload);
    }
    setModalOpen(false);
    setEditingShipment(null);
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#040B18] text-white">
      <Toaster position="bottom-right" theme="dark" />
      <NavBar />
      <main className="flex-1 overflow-auto p-4 md:p-6">
        <div className="mx-auto max-w-350">
          <header className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Shipment Intelligence</h1>
              <p className="text-sm text-white/60 mt-1">
                Operational visibility, payment health, and corridor risk at shipment level.
              </p>
            </div>
            <button
              onClick={onCreate}
              className="self-start md:self-auto px-4 py-2 rounded-xl bg-cyan-500/20 border border-cyan-400/40 text-cyan-200 hover:bg-cyan-500/30 transition-colors"
            >
              Add Shipment
            </button>
          </header>

          <div className="mb-5 inline-flex rounded-xl p-1 bg-white/5 border border-white/10">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 text-sm rounded-lg transition-colors ${
                  activeTab === tab.id ? 'bg-white/15 text-white' : 'text-white/60 hover:text-white hover:bg-white/10'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === 'overview' && <OverviewTab shipments={sortedShipments} />}
          {activeTab === 'shipments' && (
            <ShipmentsTab
              shipments={sortedShipments}
              onCreate={onCreate}
              onEdit={onEdit}
              onDelete={deleteShipment}
              isSaving={isSaving}
            />
          )}

          <ShipmentModal
            key={`shipment-modal-${modalVersion}`}
            open={modalOpen}
            initialShipment={editingShipment}
            onClose={() => {
              if (!isSaving) {
                setModalOpen(false);
                setEditingShipment(null);
              }
            }}
            onSubmit={onSave}
            isSaving={isSaving}
            errorMessage={saveError}
          />
        </div>
      </main>
    </div>
  );
}
