'use client';

import { useMemo, useState } from 'react';

const DEFAULT_VALUES = {
  origin: '',
  destination: '',
  originLat: 0,
  originLng: 0,
  destLat: 0,
  destLng: 0,
  currentLat: 0,
  currentLng: 0,
  status: 'active',
  mode: 'sea',
  carrier: '',
  cargoValueUSD: 0,
  paymentAmountUSD: 0,
  paymentStatus: 'pending',
  importExport: 'import',
  departureDate: '',
  trackingNumber: '',
  eta: '',
  corridor: 'Pacific',
};

const NUMBER_FIELDS = ['originLat', 'originLng', 'destLat', 'destLng', 'currentLat', 'currentLng', 'cargoValueUSD', 'paymentAmountUSD'];

/**
 * @param {{ open:boolean, initialShipment:any, onClose:()=>void, onSubmit:(payload:any)=>Promise<void>, isSaving:boolean, errorMessage:string|null }} props
 */
export default function ShipmentModal({ open, initialShipment, onClose, onSubmit, isSaving, errorMessage }) {
  const [form, setForm] = useState(() => ({ ...DEFAULT_VALUES, ...(initialShipment || {}) }));

  const title = useMemo(() => (initialShipment?.id ? 'Edit Shipment' : 'Add Shipment'), [initialShipment?.id]);

  if (!open) return null;

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const submit = async (e) => {
    e.preventDefault();
    const payload = { ...form };

    for (const key of NUMBER_FIELDS) {
      payload[key] = Number(payload[key]);
      if (Number.isNaN(payload[key])) payload[key] = 0;
    }

    await onSubmit(payload);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-end md:items-center justify-center p-3 md:p-6">
      <form onSubmit={submit} className="w-full max-w-5xl max-h-[90vh] overflow-auto rounded-2xl border border-white/15 bg-[#081224] p-4 md:p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">{title}</h2>
            {initialShipment?.id ? <p className="text-xs text-white/50 mt-0.5">{initialShipment.id}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="w-8 h-8 rounded-full border border-white/20 hover:bg-white/10"
            aria-label="Close modal"
          >
            x
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          <Field label="Tracking Number" value={form.trackingNumber} onChange={(v) => updateField('trackingNumber', v)} required />
          <Field label="Carrier" value={form.carrier} onChange={(v) => updateField('carrier', v)} required />
          <Field label="Corridor" value={form.corridor} onChange={(v) => updateField('corridor', v)} required />

          <Field label="Origin" value={form.origin} onChange={(v) => updateField('origin', v)} required />
          <Field label="Destination" value={form.destination} onChange={(v) => updateField('destination', v)} required />
          <SelectField
            label="Mode"
            value={form.mode}
            onChange={(v) => updateField('mode', v)}
            options={[
              { value: 'sea', label: 'Sea' },
              { value: 'air', label: 'Air' },
              { value: 'rail', label: 'Rail' },
              { value: 'road', label: 'Road' },
            ]}
          />

          <SelectField
            label="Shipment Status"
            value={form.status}
            onChange={(v) => updateField('status', v)}
            options={[
              { value: 'active', label: 'Active' },
              { value: 'delayed', label: 'Delayed' },
              { value: 'rerouted', label: 'Rerouted' },
              { value: 'disrupted', label: 'Disrupted' },
            ]}
          />
          <SelectField
            label="Payment Status"
            value={form.paymentStatus}
            onChange={(v) => updateField('paymentStatus', v)}
            options={[
              { value: 'pending', label: 'Pending' },
              { value: 'paid', label: 'Paid' },
              { value: 'failed', label: 'Failed' },
              { value: 'refunded', label: 'Refunded' },
            ]}
          />
          <SelectField
            label="Import / Export"
            value={form.importExport}
            onChange={(v) => updateField('importExport', v)}
            options={[
              { value: 'import', label: 'Import' },
              { value: 'export', label: 'Export' },
            ]}
          />

          <NumberField label="Cargo Value (USD)" value={form.cargoValueUSD} onChange={(v) => updateField('cargoValueUSD', v)} min={0} />
          <NumberField label="Payment Amount (USD)" value={form.paymentAmountUSD} onChange={(v) => updateField('paymentAmountUSD', v)} min={0} />
          <Field label="Departure Date" value={form.departureDate} onChange={(v) => updateField('departureDate', v)} type="datetime-local" />
          <Field label="ETA" value={form.eta} onChange={(v) => updateField('eta', v)} type="datetime-local" />

          <NumberField label="Origin Latitude" value={form.originLat} onChange={(v) => updateField('originLat', v)} step="any" />
          <NumberField label="Origin Longitude" value={form.originLng} onChange={(v) => updateField('originLng', v)} step="any" />
          <NumberField label="Destination Latitude" value={form.destLat} onChange={(v) => updateField('destLat', v)} step="any" />
          <NumberField label="Destination Longitude" value={form.destLng} onChange={(v) => updateField('destLng', v)} step="any" />
          <NumberField label="Current Latitude" value={form.currentLat} onChange={(v) => updateField('currentLat', v)} step="any" />
          <NumberField label="Current Longitude" value={form.currentLng} onChange={(v) => updateField('currentLng', v)} step="any" />
        </div>

        {errorMessage ? <p className="mt-4 text-sm text-red-300">{errorMessage}</p> : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="px-4 py-2 rounded-lg border border-white/20 text-white/80 hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="px-4 py-2 rounded-lg border border-cyan-400/40 bg-cyan-500/20 text-cyan-200 hover:bg-cyan-500/30 disabled:opacity-60"
          >
            {isSaving ? 'Saving...' : 'Save Shipment'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', required = false }) {
  const formattedValue = type === 'datetime-local' ? toDateTimeLocal(value) : value;

  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-white/60">{label}</span>
      <input
        type={type}
        required={required}
        value={formattedValue}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400/30"
      />
    </label>
  );
}

function NumberField({ label, value, onChange, min, step = 1 }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-white/60">{label}</span>
      <input
        type="number"
        min={min}
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400/30"
      />
    </label>
  );
}

function SelectField({ label, value, onChange, options }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-white/60">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400/30"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function toDateTimeLocal(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
