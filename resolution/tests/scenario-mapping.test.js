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
    disruptionLocation: 'Port of Mumbai',
    affectedZones: [],
    affectedShipments: [],
  };

  const context = buildDisruptionContextFromImpactReport(report);
  assert.equal(detectScenario(context), 'port_strike');
});

test('maps european strike keywords to europe_port_strike scenario', () => {
  const context = {
    type: 'STRIKE',
    location: 'Rotterdam Port',
    affectedZones: ['Europe Corridor'],
  };
  assert.equal(detectScenario(context), 'europe_port_strike');
});

test('maps west coast strike keywords to us_west_port_strike scenario', () => {
  const context = {
    type: 'STRIKE',
    location: 'Port of Los Angeles',
    affectedZones: ['US West Coast'],
  };
  assert.equal(detectScenario(context), 'us_west_port_strike');
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

test('maps panama disruptions to panama_closure scenario', () => {
  const context = {
    type: 'INFRASTRUCTURE',
    location: 'Panama Canal',
    affectedZones: ['Panama'],
  };
  assert.equal(detectScenario(context), 'panama_closure');
});

test('maps malacca disruptions to malacca_disruption scenario', () => {
  const context = {
    type: 'INFRASTRUCTURE',
    location: 'Strait of Malacca',
    affectedZones: ['Singapore Strait'],
  };
  assert.equal(detectScenario(context), 'malacca_disruption');
});

test('maps atlantic storms to atlantic_storm scenario', () => {
  const context = {
    type: 'WEATHER',
    location: 'Gulf of Mexico',
    affectedZones: ['Atlantic', 'Caribbean'],
  };
  assert.equal(detectScenario(context), 'atlantic_storm');
});

test('maps sanctions events to geopolitical scenario', () => {
  const context = {
    type: 'GEOPOLITICAL',
    location: 'Indian Ocean',
    affectedZones: ['Trade embargo notice'],
  };
  assert.equal(detectScenario(context), 'geopolitical');
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
