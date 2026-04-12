'use client';

import { useShipments } from './hooks/useShipments.js';
import { useDisruptions } from './hooks/useDisruptions.js';
import { useResolutions } from './hooks/useResolutions.js';
import { useShipmentStore } from './store/shipmentStore.js';
import { useAlertStore } from './store/alertStore.js';

export default function Home() {
  useShipments();
  useDisruptions();
  useResolutions();

  const shipments = useShipmentStore((s) => s.shipments);
  const isLoading = useShipmentStore((s) => s.isLoading);
  const disruptions = useAlertStore((s) => s.disruptions);
  const resolutionOptions = useAlertStore((s) => s.resolutionOptions);

  return (
    <main className="flex flex-col items-center justify-center min-h-screen gap-6 p-8">
      <h1 className="text-2xl font-semibold text-white">
        AI Supply Chain - Command Center
      </h1>
      <p className="text-gray-400 text-sm">Phase 2: Agent Pipeline Active</p>

      {isLoading ? (
        <p className="text-gray-500">Connecting to Firestore...</p>
      ) : (
        <div className="flex flex-col gap-4 w-full max-w-2xl">
          <div className="bg-gray-900 rounded-lg p-4">
            <p className="text-green-400 font-medium mb-2">
              ✅ {shipments.length} shipments | {shipments.filter(s => s.status === 'delayed').length} delayed | {shipments.filter(s => s.status === 'rerouted').length} rerouted
            </p>
          </div>
          {disruptions.length > 0 && <div className="bg-red-950 border border-red-800 rounded-lg p-4"><p className="text-red-400 font-medium mb-2">🚨 {disruptions.length} disruption(s) detected</p>{disruptions.slice(0, 3).map((d) => <div key={d.id} className="text-red-300 text-xs mt-1">{d.type} — {d.location} — Severity {d.severity}/10</div>)}</div>}
          {resolutionOptions.length > 0 && <div className="bg-blue-950 border border-blue-800 rounded-lg p-4"><p className="text-blue-400 font-medium">✅ Resolution options ready — {resolutionOptions.length} resolution(s)</p><p className="text-blue-300 text-xs mt-1">Phase 3 will render DecisionModal here</p></div>}
        </div>
      )}
      <p className="text-gray-600 text-xs mt-4">Run: <code className="text-gray-400">node resolution/simulation/inject.js pacific_storm</code> to test the pipeline</p>
    </main>
  );
}
