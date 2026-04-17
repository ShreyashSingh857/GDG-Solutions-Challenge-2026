import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import { adminDb } from '../../../lib/firebase-admin.js';

export async function GET() {
  try {
    const snap = await adminDb
      .collection('shipments')
      .orderBy('createdAt', 'desc')
      .get();

    const shipments = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ data: shipments, error: null });
  } catch (err) {
    return NextResponse.json({ error: err.message, data: null }, { status: 500 });
  }
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(req) {
  try {
    const body = await req.json();

    const required = ['origin', 'destination', 'originLat', 'originLng', 'destLat', 'destLng', 'status', 'carrier', 'cargoValueUSD', 'eta', 'corridor'];
    for (const field of required) {
      if (body[field] === undefined || body[field] === null || body[field] === '') {
        return NextResponse.json({ error: `Missing required field: ${field}`, data: null }, { status: 400 });
      }
    }

    const now = new Date().toISOString();
    const shipment = {
      id: `ship-${uuidv4()}`,
      origin: body.origin,
      destination: body.destination,
      originLat: Number(body.originLat),
      originLng: Number(body.originLng),
      destLat: Number(body.destLat),
      destLng: Number(body.destLng),
      currentLat: Number(body.currentLat ?? body.originLat),
      currentLng: Number(body.currentLng ?? body.originLng),
      status: body.status ?? 'active',
      carrier: body.carrier,
      cargoValueUSD: Number(body.cargoValueUSD),
      eta: body.eta,
      corridor: body.corridor,
      mode: body.mode ?? 'sea-freight',
      paymentAmountUSD: body.paymentAmountUSD ? Number(body.paymentAmountUSD) : null,
      paymentStatus: body.paymentStatus ?? 'pending',
      importExport: body.importExport ?? 'export',
      departureDate: body.departureDate ?? null,
      trackingNumber: body.trackingNumber ?? null,
      createdAt: now,
      updatedAt: now,
    };

    await adminDb.collection('shipments').doc(shipment.id).set(shipment);

    await supabase
      .from('shipments')
      .insert([toSupabaseRow(shipment)])
      .then(({ error }) => {
        if (error) {
          console.error('[API/shipments] Supabase insert failed:', error.message);
        }
      });

    return NextResponse.json({ data: shipment, error: null }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message, data: null }, { status: 500 });
  }
}

function toSupabaseRow(shipment) {
  return {
    id: shipment.id,
    origin: shipment.origin,
    destination: shipment.destination,
    origin_lat: shipment.originLat,
    origin_lng: shipment.originLng,
    dest_lat: shipment.destLat,
    dest_lng: shipment.destLng,
    current_lat: shipment.currentLat,
    current_lng: shipment.currentLng,
    status: shipment.status,
    carrier: shipment.carrier,
    cargo_value_usd: shipment.cargoValueUSD,
    eta: shipment.eta,
    corridor: shipment.corridor,
    mode: shipment.mode,
    payment_amount_usd: shipment.paymentAmountUSD,
    payment_status: shipment.paymentStatus,
    import_export: shipment.importExport,
    departure_date: shipment.departureDate,
    tracking_number: shipment.trackingNumber,
    created_at: shipment.createdAt,
    updated_at: shipment.updatedAt,
  };
}
