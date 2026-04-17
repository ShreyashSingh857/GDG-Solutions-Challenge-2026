'use client';

import { useShipmentStore } from '../../store/shipmentStore.js';

const API = '/api/shipments';

export function useShipmentMutations() {
  const { updateShipment: storeUpdate } = useShipmentStore();

  async function createShipment(data) {
    const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error ?? `HTTP ${res.status}`);
    }

    const { data: created } = await res.json();
    useShipmentStore.setState((s) => ({
      shipments: [created, ...s.shipments],
    }));
    return created;
  }

  async function updateShipment(id, data) {
    const res = await fetch(`${API}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error ?? `HTTP ${res.status}`);
    }

    const { data: updated } = await res.json();
    storeUpdate(updated);
    return updated;
  }

  return { createShipment, updateShipment };
}
