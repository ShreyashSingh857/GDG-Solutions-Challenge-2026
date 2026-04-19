import { NextResponse } from 'next/server';

const PORT_COORDS = {
  CNSHA: { lat: 31.23, lng: 121.47, name: 'Shanghai' },
  SGSIN: { lat: 1.35, lng: 103.82, name: 'Singapore' },
  NLRTM: { lat: 51.92, lng: 4.48, name: 'Rotterdam' },
  USLAX: { lat: 33.74, lng: -118.25, name: 'Los Angeles' },
  DEHAM: { lat: 53.55, lng: 9.99, name: 'Hamburg' },
  AEJEA: { lat: 25.01, lng: 55.14, name: 'Jebel Ali' },
  EGPSD: { lat: 31.26, lng: 32.3, name: 'Port Said' },
  KRPUS: { lat: 35.1, lng: 129.04, name: 'Busan' },
  CNNGB: { lat: 29.87, lng: 121.55, name: 'Ningbo' },
  USNYC: { lat: 40.66, lng: -74.04, name: 'New York' },
};

export async function GET() {
  const results = await Promise.allSettled(
    Object.entries(PORT_COORDS).map(async ([locode, meta]) => {
      try {
        const response = await fetch(
          `https://portwatch.imf.org/api/port?portCode=${locode}`,
          { signal: AbortSignal.timeout(8000), next: { revalidate: 3600 } }
        );
        if (!response.ok) {
          return { locode, ...meta, congestionScore: 0, avgWaitHours: 0, vesselCount: 0, ok: false };
        }

        const data = await response.json();
        return {
          locode,
          ...meta,
          congestionScore: Number(data.congestionIndex ?? 0),
          avgWaitHours: Number(data.averageWaitingTime ?? 0),
          vesselCount: Number(data.vesselCount ?? 0),
          ok: true,
        };
      } catch {
        return { locode, ...meta, congestionScore: 0, avgWaitHours: 0, vesselCount: 0, ok: false };
      }
    })
  );

  const ports = results
    .filter((result) => result.status === 'fulfilled')
    .map((result) => result.value);

  return NextResponse.json({ data: ports });
}
