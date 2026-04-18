import { db } from '../firebase.js';
import { supabase, assertNoSupabaseError } from '../supabase.js';
import { v4 as uuidv4 } from 'uuid';
import 'dotenv/config';

const CARRIERS = ['Maersk', 'MSC', 'COSCO', 'Evergreen', 'Hapag-Lloyd'];
const STATUSES = ['active', 'active', 'active', 'active', 'delayed'];
const MODES = ['sea-freight', 'sea-freight', 'sea-freight', 'air-freight', 'rail'];
const PAYMENT_STATUSES = ['pending', 'paid', 'paid', 'paid', 'overdue', 'partial'];
const IMPORT_EXPORT_TYPES = ['import', 'export', 'export', 'export', 'transit'];

function generateShipment(index) {
  const isPacific = index < 10;
  const isSuez = index >= 10 && index < 22;

  let originLat, originLng, destLat, destLng, origin, destination, originCode, destCode, corridor;

  if (isPacific) {
    originLat = 20 + Math.random() * 15; originLng = 120 + Math.random() * 20;
    destLat = 33 + Math.random() * 5; destLng = -118 + Math.random() * -10;
    origin = 'Shanghai'; destination = 'Los Angeles'; originCode = 'PVG'; destCode = 'LAX'; corridor = 'Pacific';
  } else if (isSuez) {
    originLat = 1 + Math.random() * 5; originLng = 103 + Math.random() * 4;
    destLat = 51 + Math.random() * 3; destLng = 0 + Math.random() * 4;
    origin = 'Singapore'; destination = 'Rotterdam'; originCode = 'SIN'; destCode = 'RTM'; corridor = 'Suez';
  } else {
    originLat = 18 + Math.random() * 4; originLng = 72 + Math.random() * 3;
    destLat = 25 + Math.random() * 5; destLng = 55 + Math.random() * 5;
    origin = 'Mumbai'; destination = 'Dubai'; originCode = 'BOM'; destCode = 'DXB'; corridor = 'Indian Ocean';
  }

  const currentLat = (originLat + destLat) / 2 + (Math.random() * 4 - 2);
  const currentLng = (originLng + destLng) / 2 + (Math.random() * 4 - 2);
  const departureDate = new Date(Date.now() - (1 + Math.random() * 20) * 24 * 60 * 60 * 1000).toISOString();
  const eta = new Date(Date.now() + (3 + Math.random() * 25) * 24 * 60 * 60 * 1000).toISOString();
  const cargoValueUSD = Math.floor(500000 + Math.random() * 9500000);
  const paymentAmountUSD = Math.floor(100000 + Math.random() * 5000000);
  const importExport = IMPORT_EXPORT_TYPES[Math.floor(Math.random() * IMPORT_EXPORT_TYPES.length)];
  const trackingNumber = `MAEU${String(Math.floor(Math.random() * 9000000 + 1000000))}`;

  return {
    id: `ship-${uuidv4()}`,
    origin,
    destination,
    originCode,
    destCode,
    originLat,
    originLng,
    destLat,
    destLng,
    currentLat,
    currentLng,
    status: STATUSES[Math.floor(Math.random() * STATUSES.length)],
    mode: MODES[Math.floor(Math.random() * MODES.length)],
    carrier: CARRIERS[Math.floor(Math.random() * CARRIERS.length)],
    cargoValueUSD,
    paymentAmountUSD,
    paymentStatus: PAYMENT_STATUSES[Math.floor(Math.random() * PAYMENT_STATUSES.length)],
    importExport,
    departureDate,
    trackingNumber,
    eta,
    corridor,
    createdAt: new Date().toISOString(),
  };
}

const SUPPLIER_DATA = [
  ['sup-001', 'Pacific Air Express', 'Pacific', 2.50, 94, 'ops@pacificairexpress.com', ['air-freight', 'express', 'refrigerated']],
  ['sup-002', 'Trans-Pacific Shipping Co.', 'Pacific', 0.12, 88, 'ops@transpacific.com', ['sea-freight', 'bulk', 'containers']],
  ['sup-003', 'Alaska Northern Route Ltd.', 'Pacific', 0.18, 79, 'ops@alaskanorthern.com', ['sea-freight', 'containers', 'cold-storage']],
  ['sup-004', 'Suez Alternative Carriers', 'Suez', 0.15, 85, 'ops@suezalt.com', ['sea-freight', 'containers', 'bulk']],
  ['sup-005', 'Cape Route Logistics', 'Suez', 0.20, 82, 'ops@caperoute.com', ['sea-freight', 'containers', 'tankers']],
  ['sup-006', 'Middle East Air Freight', 'Suez', 2.80, 91, 'ops@meaf.com', ['air-freight', 'express', 'high-value']],
  ['sup-007', 'Mumbai Alternative Port Authority', 'Indian Ocean', 0.14, 76, 'ops@mumbaialternative.com', ['sea-freight', 'containers', 'port-handling']],
  ['sup-008', 'Indian Ocean Air Cargo', 'Indian Ocean', 2.60, 89, 'ops@ioac.com', ['air-freight', 'express', 'refrigerated']],
  ['sup-009', 'Atlantic Ocean Freight', 'Atlantic', 0.13, 87, 'ops@atlanticfreight.com', ['sea-freight', 'containers', 'bulk']],
  ['sup-010', 'European Express Logistics', 'Atlantic', 2.40, 93, 'ops@eurexpress.com', ['air-freight', 'express', 'high-value']],
  ['sup-011', 'Southeast Asia Freight Co.', 'Pacific', 0.11, 81, 'ops@seafreight.com', ['sea-freight', 'containers', 'refrigerated']],
  ['sup-012', 'Global Emergency Logistics', 'Pacific', 3.20, 96, 'ops@globalemergency.com', ['air-freight', 'sea-freight', 'express', 'emergency']],
];

async function seedFirestoreShipments() {
  console.log('[Seed] Writing 50 shipments to Firestore...');
  const batch = db.batch();

  for (let i = 0; i < 50; i++) {
    const s = generateShipment(i);
    batch.set(db.collection('shipments').doc(s.id), s);
  }
  await batch.commit();
  console.log('[Seed] ✅ 50 shipments in Firestore (10 Pacific, 12 Suez, 28 Indian Ocean)');
}

async function seedSupabaseSuppliers() {
  console.log('[Seed] Writing suppliers to Supabase...');
  const { data: capRows, error: capErr } = await supabase.from('capabilities').select('id, name');
  assertNoSupabaseError(capErr, 'fetch capabilities');
  const capMap = Object.fromEntries(capRows.map((c) => [c.name, c.id]));

  const supplierRows = SUPPLIER_DATA.map(([id, name, region, base_cost_per_km, reliability_score, contact_email]) => ({
    id, name, region, base_cost_per_km, reliability_score, contact_email, is_active: true,
  }));
  const { error: supErr } = await supabase.from('suppliers').upsert(supplierRows, { onConflict: 'id' });
  assertNoSupabaseError(supErr, 'upsert suppliers');

  const capJunctionRows = [];
  for (const [id, , , , , , capabilities] of SUPPLIER_DATA) {
    for (const capName of capabilities) {
      const capId = capMap[capName];
      if (!capId) {
        console.warn(`[Seed] Warning: capability '${capName}' not in capabilities table - add it and re-run`);
        continue;
      }
      capJunctionRows.push({ supplier_id: id, capability_id: capId });
    }
  }

  const { error: juncErr } = await supabase
    .from('supplier_capabilities')
    .upsert(capJunctionRows, { onConflict: 'supplier_id,capability_id' });
  assertNoSupabaseError(juncErr, 'upsert supplier_capabilities');

  console.log(`[Seed] ✅ ${SUPPLIER_DATA.length} suppliers + ${capJunctionRows.length} capability links written to Supabase`);
}

async function seed() {
  await seedFirestoreShipments();
  await seedSupabaseSuppliers();
  console.log('[Seed] All seed data written successfully');
  process.exit(0);
}

seed().catch((err) => {
  const msg = String(err?.message || 'Unknown error');
  const code = err?.code ? ` (code: ${err.code})` : '';
  if (msg.includes('NOT_FOUND')) {
    console.error('[Seed] Failed: Firestore database was not found in the configured Firebase project.' + code);
    console.error('[Seed] Action: Open Firebase Console -> Firestore Database -> Create database (Native mode) for project:', process.env.FIREBASE_PROJECT_ID);
  } else if (msg.includes('PERMISSION_DENIED')) {
    console.error('[Seed] Failed: Firestore API or IAM permission issue.' + code);
    console.error('[Seed] Action: Enable Firestore API and verify service account access for project:', process.env.FIREBASE_PROJECT_ID);
  } else {
    console.error('[Seed] Failed:', msg + code);
  }
  process.exit(1);
});
