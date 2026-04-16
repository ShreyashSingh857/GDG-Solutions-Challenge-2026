import test from 'node:test';
import assert from 'node:assert/strict';

import { detectScenario } from '../tools/routingTool.js';
import {
  buildDisruptionContextFromImpactReport,
  pickSupplierRegion,
} from '../api/options.service.js';

test('maps STRIKE disruption type to port_strike scenario', () => {
  const report = {
    disruptionType: 'STRIKE',
    disruptionLocation: 'Port of Los Angeles',
    affectedZones: [],
    affectedShipments: [],
  };

  const context = buildDisruptionContextFromImpactReport(report);
  assert.equal(detectScenario(context), 'port_strike');
});

test('maps Suez zone to suez_closure scenario', () => {
  const report = {
    disruptionType: 'GEOPOLITICAL',
    disruptionLocation: 'Suez Canal',
    affectedZones: ['Suez', 'Red Sea'],
    affectedShipments: [],
  };

  const context = buildDisruptionContextFromImpactReport(report);
  assert.equal(detectScenario(context), 'suez_closure');
});

test('derives supplier region from affected zones first', () => {
  const report = {
    disruptionType: 'WEATHER',
    disruptionLocation: 'Pacific Ocean',
    affectedZones: [],
    affectedShipments: [{ corridor: 'Indian Ocean' }],
  };

  const context = buildDisruptionContextFromImpactReport(report);
  assert.equal(pickSupplierRegion(context), 'Indian Ocean');
});

test('falls back to disruption location when no zones exist', () => {
  const report = {
    disruptionType: 'GEOPOLITICAL',
    disruptionLocation: 'Suez Canal',
    affectedZones: [],
    affectedShipments: [],
  };

  const context = buildDisruptionContextFromImpactReport(report);
  assert.equal(pickSupplierRegion(context), 'Suez Canal');
});
