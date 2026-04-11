'use client';

import { useShipments } from './hooks/useShipments.js';
import { useDisruptions } from './hooks/useDisruptions.js';
import { useShipmentStore } from './store/shipmentStore.js';

export default function Home() {
  // Calling these hooks starts the Firestore real-time listeners
  useShipments();
  useDisruptions();

  const shipments = useShipmentStore((s) => s.shipments);
  const isLoading = useShipmentStore((s) => s.isLoading);

  return (
    <main className="flex flex-col items-center justify-center min-h-screen gap-6 p-8">
      <h1 className="text-2xl font-semibold text-white">
        AI Supply Chain - Command Center
      </h1>
      <p className="text-gray-400 text-sm">Phase 1: Infrastructure Verification</p>

      {isLoading ? (
        <p className="text-gray-500">Connecting to Firestore...</p>
      ) : (
        <div className="bg-gray-900 rounded-lg p-6 w-full max-w-xl">
          <p className="text-green-400 font-medium mb-2">
            ✅ Firestore connected - {shipments.length} shipments loaded
          </p>
          <ul className="text-gray-400 text-xs space-y-1 max-h-64 overflow-y-auto">
            {shipments.slice(0, 10).map((s) => (
              <li key={s.id}>
                {s.origin} → {s.destination} | {s.status} | {s.corridor}
              </li>
            ))}
          </ul>
          {shipments.length > 10 && (
            <p className="text-gray-600 text-xs mt-2">...and {shipments.length - 10} more</p>
          )}
        </div>
      )}
    </main>
  );
}
