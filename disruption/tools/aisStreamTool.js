import WebSocket from 'ws';
import { db } from '../../shared/db/firebase.js';

const AIS_WS_URL = 'wss://stream.aisstream.io/v0/stream';
let ws = null;

export const MAJOR_CORRIDORS = [
  [[20, 25], [32, 45]],
  [[-5, 99], [5, 105]],
  [[35, 127], [40, 132]],
  [[-35, 15], [-25, 35]],
  [[7, -82], [10, -78]],
];

export function startAISStream(boundingBoxes = MAJOR_CORRIDORS) {
  const apiKey = process.env.AIS_STREAM_API_KEY;
  if (!apiKey) {
    console.warn('[AIS] AIS_STREAM_API_KEY not set; stream disabled');
    return;
  }

  function connect() {
    ws = new WebSocket(AIS_WS_URL);

    ws.on('open', () => {
      console.log('[AIS] Connected');
      ws.send(JSON.stringify({ APIKey: apiKey, BoundingBoxes: boundingBoxes, FilterMessageTypes: ['PositionReport'] }));
    });

    ws.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg?.MessageType !== 'PositionReport') return;
        const pos = msg?.Message?.PositionReport;
        if (!pos) return;
        const mmsi = String(pos.UserID || '');
        if (!mmsi) return;
        await db.collection('vesselPositions').doc(mmsi).set({
          mmsi,
          lat: Number(pos.Latitude),
          lng: Number(pos.Longitude),
          speed: Number(pos.Sog || 0),
          heading: Number(pos.TrueHeading || 0),
          status: Number(pos.NavigationalStatus || 0),
          updatedAt: new Date().toISOString(),
        }, { merge: true });
      } catch (err) {
        console.warn('[AIS] Message parse/store failed:', err.message);
      }
    });

    ws.on('close', () => {
      console.warn('[AIS] Disconnected; reconnecting in 10s');
      setTimeout(connect, 10000);
    });

    ws.on('error', (err) => {
      console.warn('[AIS] Socket error:', err.message);
    });
  }

  connect();
}
