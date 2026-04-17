'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useShipmentStore } from '../../store/shipmentStore.js';

async function parseJson(res) {
  const json = await res.json().catch(() => ({ data: null, error: 'Invalid JSON response' }));
  return json;
}

export function useShipmentMutations() {
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const setShipments = useShipmentStore((s) => s.setShipments);
  const shipments = useShipmentStore((s) => s.shipments);

  const createShipment = async (payload) => {
    setIsSaving(true);
    setSaveError(null);
    try {
      const res = await fetch('/api/shipments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const body = await parseJson(res);
      if (!res.ok || body.error) throw new Error(body.error || 'Failed to create shipment');

      setShipments([body.data, ...shipments]);
      toast.success('Shipment created');
      return body.data;
    } catch (err) {
      const message = err.message || 'Failed to create shipment';
      setSaveError(message);
      toast.error(message);
      throw err;
    } finally {
      setIsSaving(false);
    }
  };

  const updateShipment = async (id, payload) => {
    setIsSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/shipments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const body = await parseJson(res);
      if (!res.ok || body.error) throw new Error(body.error || 'Failed to update shipment');

      setShipments(shipments.map((s) => (s.id === id ? body.data : s)));
      toast.success('Shipment updated');
      return body.data;
    } catch (err) {
      const message = err.message || 'Failed to update shipment';
      setSaveError(message);
      toast.error(message);
      throw err;
    } finally {
      setIsSaving(false);
    }
  };

  const deleteShipment = async (id) => {
    setIsSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/shipments/${id}`, {
        method: 'DELETE',
      });

      const body = await parseJson(res);
      if (!res.ok || body.error) throw new Error(body.error || 'Failed to delete shipment');

      setShipments(shipments.filter((s) => s.id !== id));
      toast.success('Shipment deleted');
      return body.data;
    } catch (err) {
      const message = err.message || 'Failed to delete shipment';
      setSaveError(message);
      toast.error(message);
      throw err;
    } finally {
      setIsSaving(false);
    }
  };

  return {
    isSaving,
    saveError,
    createShipment,
    updateShipment,
    deleteShipment,
  };
}
