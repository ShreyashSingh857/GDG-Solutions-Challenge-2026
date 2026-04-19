'use client';

import { useEffect, useState } from 'react';

export function useCorridorWeather() {
  const [corridors, setCorridors] = useState([]);

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch('/api/corridor-weather', { cache: 'no-store' });
        if (!response.ok) {
          return;
        }

        const payload = await response.json();
        setCorridors(Array.isArray(payload.data) ? payload.data : []);
      } catch {
        // Keep previous state on transient failures.
      }
    }

    load();
    const intervalId = setInterval(load, 3 * 60 * 60_000);
    return () => clearInterval(intervalId);
  }, []);

  return corridors;
}
