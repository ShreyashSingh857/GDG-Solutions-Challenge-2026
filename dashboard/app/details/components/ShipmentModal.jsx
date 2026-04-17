'use client';

import { useState } from 'react';
import { useShipmentMutations } from '../hooks/useShipmentMutations.js';

const EMPTY = {
  origin: '',
  destination: '',
  originLat: 0,
  originLng: 0,
  destLat: 0,
  destLng: 0,
  currentLat: 0,
  currentLng: 0,
  status: 'active',
  carrier: '',
  cargoValueUSD: '',
  eta: '',
  corridor: 'Pacific',
  mode: 'sea-freight',
  paymentAmountUSD: '',
  paymentStatus: 'pending',
  importExport: 'export',
  departureDate: '',
  trackingNumber: '',
};

/**
 * @param {{ shipment:any, onClose:()=>void }} props
 */
export default function ShipmentModal({ shipment, onClose }) {
  const isEdit = Boolean(shipment);
  const [form, setForm] = useState(isEdit ? { ...EMPTY, ...shipment } : EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const { createShipment, updateShipment } = useShipmentMutations();

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);

    try {
      const payload = {
        ...form,
        originLat: parseFloat(form.originLat),
        originLng: parseFloat(form.originLng),
        destLat: parseFloat(form.destLat),
        destLng: parseFloat(form.destLng),
        currentLat: parseFloat(form.currentLat),
        currentLng: parseFloat(form.currentLng),
        cargoValueUSD: parseInt(form.cargoValueUSD, 10),
        paymentAmountUSD: form.paymentAmountUSD ? parseInt(form.paymentAmountUSD, 10) : null,
      };

      if (isEdit) {
        await updateShipment(shipment.id, payload);
      } else {
        await createShipment(payload);
      }

      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl bg-gray-950 border border-white/10 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
          <h2 className="text-base font-semibold text-white">
            {isEdit ? `Edit Shipment - ${shipment.trackingNumber ?? shipment.id.slice(-8)}` : 'Add New Shipment'}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors text-white/50"
          >
            X
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 grid grid-cols-2 gap-4">
          <Field label="Origin Port" k="origin" form={form} set={set} />
          <Field label="Destination Port" k="destination" form={form} set={set} />
          <Field label="Origin Lat" k="originLat" form={form} set={set} type="number" />
          <Field label="Origin Lng" k="originLng" form={form} set={set} type="number" />
          <Field label="Dest Lat" k="destLat" form={form} set={set} type="number" />
          <Field label="Dest Lng" k="destLng" form={form} set={set} type="number" />
          <Field label="Current Lat" k="currentLat" form={form} set={set} type="number" />
          <Field label="Current Lng" k="currentLng" form={form} set={set} type="number" />
          <Field
            label="Corridor"
            k="corridor"
            form={form}
            set={set}
            options={['Pacific', 'Suez', 'Indian Ocean', 'Atlantic', 'Malacca Strait']}
          />
          <Field
            label="Mode"
            k="mode"
            form={form}
            set={set}
            options={['sea-freight', 'air-freight', 'rail', 'road']}
          />
          <Field
            label="Import / Export"
            k="importExport"
            form={form}
            set={set}
            options={['import', 'export', 'transit']}
          />
          <Field
            label="Status"
            k="status"
            form={form}
            set={set}
            options={['active', 'delayed', 'rerouted', 'disrupted']}
          />
          <Field label="Carrier" k="carrier" form={form} set={set} />
          <Field label="Tracking Number" k="trackingNumber" form={form} set={set} />
          <Field label="Cargo Value (USD)" k="cargoValueUSD" form={form} set={set} type="number" />
          <Field label="Payment Amount (USD)" k="paymentAmountUSD" form={form} set={set} type="number" />
          <Field
            label="Payment Status"
            k="paymentStatus"
            form={form}
            set={set}
            options={['pending', 'paid', 'overdue', 'partial']}
          />
          <Field label="ETA" k="eta" form={form} set={set} type="datetime-local" />
          <Field label="Departure Date" k="departureDate" form={form} set={set} type="datetime-local" />
        </div>

        {error && <p className="px-6 py-2 text-sm text-red-400 bg-red-950/30 border-t border-red-500/10">{error}</p>}

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-white/5">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white/50 hover:bg-white/5 border border-white/10 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-5 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {saving && <span className="w-3.5 h-3.5 rounded-full border-2 border-white/50 border-t-transparent animate-spin" />}
            {isEdit ? 'Save Changes' : 'Create Shipment'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, k, type = 'text', options, form, set }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-semibold uppercase tracking-wide text-white/40">{label}</label>
      {options ? (
        <select
          value={form[k]}
          onChange={set(k)}
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-400/50"
        >
          {options.map((option) => (
            <option key={option} value={option} className="bg-gray-900">
              {option}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={type}
          value={formatDateValue(type, form[k])}
          onChange={set(k)}
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-blue-400/50"
        />
      )}
    </div>
  );
}

function formatDateValue(type, value) {
  if (type !== 'datetime-local' || !value) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
