'use client';

import { useEffect, useState } from 'react';

export function usePortCongestion() {
  const [ports, setPorts] = useState([]);

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch('/api/port-congestion', { cache: 'no-store' });
        if (!response.ok) {
          return;
        }

        const payload = await response.json();
        setPorts(Array.isArray(payload.data) ? payload.data : []);
      } catch {
        // Keep previous state on transient failures.
      }
    }

    load();
    const intervalId = setInterval(load, 60 * 60_000);
    return () => clearInterval(intervalId);
  }, []);

  return ports;
}
