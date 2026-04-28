import WebSocket from 'ws';
import { db } from '../shared/db/firebase.js';
import { resilientUpsert } from '../shared/db/supabase.js';

const AIS_WS_URL = 'wss://stream.aisstream.io/v0/stream';
let ws = null;
const pendingVesselWrites = new Map();
let vesselFlushTimer = null;
let reconnectTimer = null;
const MAX_PENDING_VESSEL_WRITES = Number.parseInt(process.env.AIS_MAX_PENDING_WRITES ?? '5000', 10);

function scheduleReconnect(connect) {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, 10000);
}

function scheduleVesselFlush() {
  if (vesselFlushTimer) return;
  vesselFlushTimer = setTimeout(async () => {
    vesselFlushTimer = null;
    if (!pendingVesselWrites.size) return;

    const entries = [...pendingVesselWrites.entries()];
    pendingVesselWrites.clear();

    try {
      const batch = db.batch();
      for (const [mmsi, position] of entries) {
        batch.set(db.collection('vesselPositions').doc(mmsi), position, { merge: true });
      }
      await batch.commit();
    } catch (err) {
      console.warn('[AIS] Batch flush failed:', err.message);
    }
  }, 5000);
  vesselFlushTimer.unref?.();
}

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
		const position = {
          mmsi,
          lat: Number(pos.Latitude),
          lng: Number(pos.Longitude),
          speed: Number(pos.Sog || 0),
          heading: Number(pos.TrueHeading || 0),
          status: Number(pos.NavigationalStatus || 0),
          updatedAt: new Date().toISOString(),
        };
        if (pendingVesselWrites.size >= MAX_PENDING_VESSEL_WRITES) {
          const oldestKey = pendingVesselWrites.keys().next().value;
          if (oldestKey) pendingVesselWrites.delete(oldestKey);
        }
		pendingVesselWrites.set(mmsi, position);
		scheduleVesselFlush();
        await resilientUpsert('vessel_positions', {
          mmsi,
          lat: Number(pos.Latitude),
          lng: Number(pos.Longitude),
          speed: Number(pos.Sog || 0),
          heading: Number(pos.TrueHeading || 0),
          nav_status: Number(pos.NavigationalStatus || 0),
          updated_at: new Date().toISOString(),
        });
      } catch (err) {
        console.warn('[AIS] Message parse/store failed:', err.message);
      }
    });

    ws.on('close', () => {
      console.warn('[AIS] Disconnected; reconnecting in 10s');
      scheduleReconnect(connect);
    });

    ws.on('error', (err) => {
      console.warn('[AIS] Socket error:', err.message);
      scheduleReconnect(connect);
    });
  }

  connect();
}
