'use client';

import { useShipments } from '../hooks/useShipments.js';
import { useDisruptions } from '../hooks/useDisruptions.js';
import { useResolutions } from '../hooks/useResolutions.js';
import { useNewsAlerts } from '../hooks/useNewsAlerts.js';

export default function DataProvider({ children }) {
  useShipments();
  useDisruptions();
  useResolutions();
  useNewsAlerts();

  return children;
}
