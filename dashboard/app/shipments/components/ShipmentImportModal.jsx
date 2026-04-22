'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, Download, Upload } from 'lucide-react';
import { useShipmentStore } from '../../store/shipmentStore.js';

/**
 * @param {{ onClose:()=>void }} props
 */
export default function ShipmentImportModal({ onClose }) {
  const [activeTab, setActiveTab] = useState('excel');
  const [file, setFile] = useState(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isSubmittingManual, setIsSubmittingManual] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [validationDetails, setValidationDetails] = useState([]);
  const [manualForm, setManualForm] = useState({
    origin: '',
    destination: '',
    originLat: '',
    originLng: '',
    destLat: '',
    destLng: '',
    carrier: 'Maersk',
    mode: 'sea-freight',
    cargoValueUSD: '',
    corridor: 'Pacific',
    trackingNumber: '',
  });

  const canImport = useMemo(() => {
    if (!file) return false;
    return /\.(xlsx|xls)$/i.test(file.name);
  }, [file]);

  const handleFileChange = (event) => {
    const nextFile = event.target.files?.[0] ?? null;
    setFile(nextFile);
    setError(null);
    setResult(null);
    setValidationDetails([]);
  };

  const handleImport = async () => {
    if (!file) return;

    setIsImporting(true);
    setError(null);
    setResult(null);
    setValidationDetails([]);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/shipments/import', {
        method: 'POST',
        body: formData,
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (Array.isArray(payload?.details)) {
          setValidationDetails(payload.details.slice(0, 10));
        }
        throw new Error(payload.error ?? `Import failed with HTTP ${res.status}`);
      }

      const importedShipments = payload?.data?.shipments ?? [];
      const insertedCount = payload?.data?.insertedCount ?? importedShipments.length;

      if (importedShipments.length > 0) {
        useShipmentStore.setState((state) => {
          const deduped = new Map(state.shipments.map((shipment) => [shipment.id, shipment]));
          importedShipments.forEach((shipment) => deduped.set(shipment.id, shipment));
          return {
            shipments: Array.from(deduped.values()),
            isLoading: false,
          };
        });
      }

      setResult({
        insertedCount,
        skippedEmptyRows: payload?.data?.skippedEmptyRows ?? 0,
      });
    } catch (err) {
      setError(err.message || 'Import failed');
    } finally {
      setIsImporting(false);
    }
  };

  const handleManualField = (key, value) => {
    setManualForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleManualSubmit = async (event) => {
    event.preventDefault();

    setIsSubmittingManual(true);
    setError(null);
    setResult(null);

    try {
      const payload = {
        origin: manualForm.origin.trim(),
        destination: manualForm.destination.trim(),
        originLat: Number(manualForm.originLat),
        originLng: Number(manualForm.originLng),
        destLat: Number(manualForm.destLat),
        destLng: Number(manualForm.destLng),
        currentLat: Number(manualForm.originLat),
        currentLng: Number(manualForm.originLng),
        status: 'active',
        carrier: manualForm.carrier.trim(),
        mode: manualForm.mode,
        cargoValueUSD: Number(manualForm.cargoValueUSD),
        corridor: manualForm.corridor.trim(),
        trackingNumber: manualForm.trackingNumber.trim() || null,
        eta: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      };

      const requiredFields = ['origin', 'destination', 'carrier', 'corridor'];
      for (const field of requiredFields) {
        if (!payload[field]) {
          throw new Error(`Please provide ${field}`);
        }
      }

      if (
        !Number.isFinite(payload.originLat) ||
        !Number.isFinite(payload.originLng) ||
        !Number.isFinite(payload.destLat) ||
        !Number.isFinite(payload.destLng) ||
        !Number.isFinite(payload.cargoValueUSD)
      ) {
        throw new Error('Latitude, longitude, and cargo value must be valid numbers');
      }

      const res = await fetch('/api/shipments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) {
        throw new Error(json.error || `Manual shipment creation failed: HTTP ${res.status}`);
      }

      if (json.data) {
        useShipmentStore.setState((state) => ({
          shipments: [json.data, ...state.shipments.filter((s) => s.id !== json.data.id)],
          isLoading: false,
        }));
      }

      setResult({ insertedCount: 1, skippedEmptyRows: 0 });
      setManualForm({
        origin: '',
        destination: '',
        originLat: '',
        originLng: '',
        destLat: '',
        destLng: '',
        carrier: 'Maersk',
        mode: 'sea-freight',
        cargoValueUSD: '',
        corridor: 'Pacific',
        trackingNumber: '',
      });
    } catch (err) {
      setError(err.message || 'Failed to create shipment');
    } finally {
      setIsSubmittingManual(false);
    }
  };

  const handleDownloadTemplate = async () => {
    const XLSX = await import('xlsx');
    const templateRows = [
      {
        origin: 'Shanghai',
        destination: 'Los Angeles',
        originLat: 31.2304,
        originLng: 121.4737,
        destLat: 34.0522,
        destLng: -118.2437,
        currentLat: 30.1,
        currentLng: 145.6,
        status: 'active',
        carrier: 'Maersk',
        cargoValueUSD: 150000,
        eta: '2026-05-15T12:00:00Z',
        corridor: 'Pacific',
        mode: 'sea-freight',
        paymentAmountUSD: 75000,
        paymentStatus: 'pending',
        importExport: 'import',
        departureDate: '2026-04-10T08:00:00Z',
        trackingNumber: 'TRK-SAMPLE-001',
      },
      {
        origin: 'Hamburg',
        destination: 'Dubai',
        originLat: 53.5511,
        originLng: 9.9937,
        destLat: 25.2048,
        destLng: 55.2708,
        currentLat: 42.5,
        currentLng: 18.2,
        status: 'delayed',
        carrier: 'Hapag-Lloyd',
        cargoValueUSD: 98000,
        eta: '2026-05-21T16:30:00Z',
        corridor: 'Suez',
        mode: 'sea-freight',
        paymentAmountUSD: 98000,
        paymentStatus: 'partial',
        importExport: 'export',
        departureDate: '2026-04-12T06:15:00Z',
        trackingNumber: 'TRK-SAMPLE-002',
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Shipments Template');
    XLSX.writeFile(workbook, 'shipments-import-template.xlsx');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-xl bg-gray-950 border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
          <h2 className="text-base font-semibold text-white">Import Shipments From Excel</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors text-white/50"
          >
            X
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex gap-2 rounded-xl border border-white/10 bg-white/3 p-1">
            <button
              type="button"
              onClick={() => setActiveTab('excel')}
              className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${activeTab === 'excel' ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/30' : 'text-white/55 hover:bg-white/5'}`}
            >
              Import Excel
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('manual')}
              className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${activeTab === 'manual' ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/30' : 'text-white/55 hover:bg-white/5'}`}
            >
              Add Manually
            </button>
          </div>

          {activeTab === 'excel' ? (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <label className="block text-sm font-medium text-white/80 mb-2">Excel file (.xlsx or .xls)</label>
              <input
                type="file"
                accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                onChange={handleFileChange}
                className="block w-full text-sm text-white/80 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border file:border-white/20 file:bg-white/10 file:text-white file:cursor-pointer"
              />
              <p className="mt-2 text-xs text-white/40">
                Required columns: origin, destination, originLat, originLng, destLat, destLng, status, carrier, cargoValueUSD, eta, corridor.
              </p>
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border border-cyan-400/30 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20 transition-colors"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                Download Sample Template
              </button>
            </div>
          ) : (
            <form onSubmit={handleManualSubmit} className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <InputField label="Origin" value={manualForm.origin} onChange={(value) => handleManualField('origin', value)} />
                <InputField label="Destination" value={manualForm.destination} onChange={(value) => handleManualField('destination', value)} />
                <InputField label="Origin Lat" type="number" value={manualForm.originLat} onChange={(value) => handleManualField('originLat', value)} />
                <InputField label="Origin Lng" type="number" value={manualForm.originLng} onChange={(value) => handleManualField('originLng', value)} />
                <InputField label="Dest Lat" type="number" value={manualForm.destLat} onChange={(value) => handleManualField('destLat', value)} />
                <InputField label="Dest Lng" type="number" value={manualForm.destLng} onChange={(value) => handleManualField('destLng', value)} />
                <InputField label="Carrier" value={manualForm.carrier} onChange={(value) => handleManualField('carrier', value)} />
                <InputField label="Mode" value={manualForm.mode} onChange={(value) => handleManualField('mode', value)} />
                <InputField label="Cargo Value (USD)" type="number" value={manualForm.cargoValueUSD} onChange={(value) => handleManualField('cargoValueUSD', value)} />
                <InputField label="Corridor" value={manualForm.corridor} onChange={(value) => handleManualField('corridor', value)} />
                <div className="md:col-span-2">
                  <InputField label="Tracking Number" value={manualForm.trackingNumber} onChange={(value) => handleManualField('trackingNumber', value)} />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmittingManual}
                className="w-full rounded-lg bg-cyan-600 hover:bg-cyan-500 px-4 py-2.5 text-sm font-medium text-white transition-colors disabled:opacity-60"
              >
                {isSubmittingManual ? 'Adding Shipment...' : 'Add Shipment'}
              </button>
            </form>
          )}

          {result && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/30 p-3 text-sm text-emerald-200">
              Successfully imported {result.insertedCount} shipments.
              {result.skippedEmptyRows > 0 ? ` Skipped ${result.skippedEmptyRows} empty rows.` : ''}
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-500/20 bg-red-950/30 p-3 text-sm text-red-300 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
              <div className="space-y-2">
                <p>{error}</p>
                {validationDetails.length > 0 && (
                  <ul className="text-xs text-red-200/90 space-y-1 list-disc pl-4">
                    {validationDetails.map((detail) => (
                      <li key={detail.row}>
                        Row {detail.row}: {Array.isArray(detail.errors) ? detail.errors.join('; ') : 'Invalid row'}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-white/5">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white/50 hover:bg-white/5 border border-white/10 transition-colors"
          >
            Close
          </button>
          {activeTab === 'excel' ? (
            <button
              onClick={handleImport}
              disabled={!canImport || isImporting}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isImporting && <span className="w-3.5 h-3.5 rounded-full border-2 border-white/50 border-t-transparent animate-spin" />}
              {!isImporting && <Upload className="w-4 h-4" aria-hidden="true" />}
              {isImporting ? 'Importing...' : 'Import File'}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function InputField({ label, value, onChange, type = 'text' }) {
  return (
    <label className="block">
      <span className="block text-[11px] uppercase tracking-[0.16em] text-white/45 mb-1">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-cyan-300/50"
      />
    </label>
  );
}
