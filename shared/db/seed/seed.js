import { db } from '../firebase.js';
import { v4 as uuidv4 } from 'uuid';
import 'dotenv/config';

const CARRIERS = ['Maersk', 'MSC', 'COSCO', 'Evergreen', 'Hapag-Lloyd'];
const STATUSES = ['active', 'active', 'active', 'active', 'delayed']; // weight toward active

function generateShipment(index) {
  const isPacific = index < 10;
  const originLat = isPacific ? 20 + Math.random() * 15 : Math.random() * 60 - 10;
  const originLng = isPacific ? 120 + Math.random() * 20 : Math.random() * 200 - 80;
  const destLat = isPacific ? 30 + Math.random() * 15 : Math.random() * 60 - 10;
  const destLng = isPacific ? -120 + Math.random() * -20 : Math.random() * 60 - 20;
  const currentLat = (originLat + destLat) / 2 + (Math.random() * 4 - 2);
  const currentLng = (originLng + destLng) / 2 + (Math.random() * 4 - 2);
  const eta = new Date(Date.now() + (3 + Math.random() * 25) * 24 * 60 * 60 * 1000).toISOString();

  return {
    id: `ship-${uuidv4()}`,
    origin: isPacific ? 'Shanghai' : ['Rotterdam', 'Singapore', 'Mumbai', 'Dubai'][Math.floor(Math.random() * 4)],
    destination: isPacific ? 'Los Angeles' : ['New York', 'Hamburg', 'Colombo', 'Jeddah'][Math.floor(Math.random() * 4)],
    originLat,
    originLng,
    destLat,
    destLng,
    currentLat,
    currentLng,
    status: STATUSES[Math.floor(Math.random() * STATUSES.length)],
    carrier: CARRIERS[Math.floor(Math.random() * CARRIERS.length)],
    cargoValueUSD: Math.floor(500000 + Math.random() * 9500000),
    eta,
    corridor: isPacific ? 'Pacific' : ['Atlantic', 'Suez', 'Indian Ocean'][Math.floor(Math.random() * 3)],
    createdAt: new Date().toISOString(),
  };
}

async function seed() {
  console.log('[Seed] Starting Firestore seed...');
  const batch = db.batch();

  for (let i = 0; i < 50; i++) {
    const shipment = generateShipment(i);
    const ref = db.collection('shipments').doc(shipment.id);
    batch.set(ref, shipment);
  }

  await batch.commit();
  console.log('[Seed] ✅ 50 shipments written to Firestore (10 in Pacific corridor)');
  process.exit(0);
}

seed().catch((err) => {
  console.error('[Seed] ❌ Failed:', err);
  process.exit(1);
});
