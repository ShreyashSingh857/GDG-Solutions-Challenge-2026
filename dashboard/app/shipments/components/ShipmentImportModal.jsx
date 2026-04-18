'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, Download, Upload } from 'lucide-react';
import { useShipmentStore } from '../../store/shipmentStore.js';

/**
 * @param {{ onClose:()=>void }} props
 */
export default function ShipmentImportModal({ onClose }) {
  const [file, setFile] = useState(null);
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [validationDetails, setValidationDetails] = useState([]);

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
          <button
            onClick={handleImport}
            disabled={!canImport || isImporting}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isImporting && <span className="w-3.5 h-3.5 rounded-full border-2 border-white/50 border-t-transparent animate-spin" />}
            {!isImporting && <Upload className="w-4 h-4" aria-hidden="true" />}
            {isImporting ? 'Importing...' : 'Import File'}
          </button>
        </div>
      </div>
    </div>
  );
}
