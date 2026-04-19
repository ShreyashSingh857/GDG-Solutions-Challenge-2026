import test from 'node:test';
import assert from 'node:assert/strict';

import { fetchFlexportTracking, syncFlexportShipments } from '../tools/flexportTracker.js';

test('fetchFlexportTracking maps scraper output', async () => {
  const calls = [];
  const scraper = async (url) => {
    calls.push(url);
    return {
      status: 'IN_TRANSIT',
      origin: 'Shanghai',
      destination: 'Long Beach',
      eta: '2026-04-25',
      lastEvent: 'Departed origin port',
      allEvents: ['Booked', 'Loaded', 'Departed'],
      carrier: 'MAERSK',
    };
  };

  const tracking = await fetchFlexportTracking('MAEU1234567', { scraper });

  assert.match(calls[0], /flexport\.com\/tracking\/MAEU1234567/);
  assert.equal(tracking.status, 'IN_TRANSIT');
  assert.equal(tracking.source, 'flexport-public-tracking');
  assert.equal(tracking.carrier, 'MAERSK');
});

test('syncFlexportShipments updates active shipments', async () => {
  const updates = [];

  const docA = {
    id: 'ship-a',
    data: () => ({ status: 'active', flexportTrackingNumber: 'AA123' }),
    ref: {
      update: async (payload) => updates.push({ id: 'ship-a', payload }),
    },
  };

  const docB = {
    id: 'ship-b',
    data: () => ({ status: 'delayed', flexportTrackingNumber: 'BB456' }),
    ref: {
      update: async (payload) => updates.push({ id: 'ship-b', payload }),
    },
  };

  const db = {
    collection: () => ({
      where: () => ({
        where: () => ({
          limit: () => ({
            get: async () => ({ docs: [docA, docB] }),
          }),
        }),
      }),
    }),
  };

  const scraper = async (url) => ({
    status: url.includes('AA123') ? 'IN_TRANSIT' : 'DELAYED',
    allEvents: ['A', 'B', 'C', 'D', 'E', 'F'],
  });

  const result = await syncFlexportShipments(db, { scraper, pauseMs: 0 });

  assert.equal(result.length, 2);
  assert.equal(updates.length, 2);
  assert.equal(updates[0].payload.externalStatus, 'IN_TRANSIT');
  assert.equal(updates[1].payload.externalStatus, 'DELAYED');
  assert.equal(updates[0].payload.trackingEvents.length, 5);
});
