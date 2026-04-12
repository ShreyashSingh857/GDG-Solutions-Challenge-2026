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

  const suppliers = [
    ['sup-001','Pacific Air Express','Pacific',['air-freight','express','refrigerated'],94,2.5,'ops@pacificairexpress.com'],
    ['sup-002','Trans-Pacific Shipping Co.','Pacific',['sea-freight','bulk','containers'],88,0.12,'ops@transpacific.com'],
    ['sup-003','Alaska Northern Route Ltd.','Pacific',['sea-freight','containers','cold-storage'],79,0.18,'ops@alaskanorthern.com'],
    ['sup-004','Suez Alternative Carriers','Suez',['sea-freight','containers','bulk'],85,0.15,'ops@suezalt.com'],
    ['sup-005','Cape Route Logistics','Suez',['sea-freight','containers','tankers'],82,0.2,'ops@caperoute.com'],
    ['sup-006','Middle East Air Freight','Suez',['air-freight','express','high-value'],91,2.8,'ops@meaf.com'],
    ['sup-007','Mumbai Alternative Port Authority','Indian Ocean',['sea-freight','containers','port-handling'],76,0.14,'ops@mumbaialternative.com'],
    ['sup-008','Indian Ocean Air Cargo','Indian Ocean',['air-freight','express','refrigerated'],89,2.6,'ops@ioac.com'],
    ['sup-009','Atlantic Ocean Freight','Atlantic',['sea-freight','containers','bulk'],87,0.13,'ops@atlanticfreight.com'],
    ['sup-010','European Express Logistics','Atlantic',['air-freight','express','high-value'],93,2.4,'ops@eurexpress.com'],
    ['sup-011','Southeast Asia Freight Co.','Pacific',['sea-freight','containers','refrigerated'],81,0.11,'ops@seafreight.com'],
    ['sup-012','Global Emergency Logistics','Pacific',['air-freight','sea-freight','express','emergency'],96,3.2,'ops@globalemergency.com'],
  ];
  const supplierBatch = db.batch();
  for (const [id,name,region,capabilities,reliabilityScore,baseCostPerKm,contactEmail] of suppliers) {
    supplierBatch.set(db.collection('suppliers').doc(id), { id, name, region, capabilities, reliabilityScore, baseCostPerKm, contactEmail });
  }
  await supplierBatch.commit();
  console.log('[Seed] ✅ 12 suppliers written to Firestore');
  process.exit(0);
}

seed().catch((err) => {
  console.error('[Seed] ❌ Failed:', err);
  process.exit(1);
});
