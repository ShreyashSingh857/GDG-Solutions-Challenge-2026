import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { adminDb } from '../../../../lib/firebase-admin.js';
import { verifyApiKey } from '../_auth.js';
import { handleOptions, withCors } from '../_cors.js';

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

function toResponseShipment(id, data) {
  return {
    id,
    origin: data.origin,
    destination: data.destination,
    originLat: Number(data.originLat ?? 0),
    originLng: Number(data.originLng ?? 0),
    destLat: Number(data.destLat ?? 0),
    destLng: Number(data.destLng ?? 0),
    currentLat: Number(data.currentLat ?? data.originLat ?? 0),
    currentLng: Number(data.currentLng ?? data.originLng ?? 0),
    status: data.status || 'active',
    carrier: data.carrier || 'Unknown',
    cargoValueUSD: Number(data.cargoValueUSD ?? 0),
    eta: data.eta || null,
    corridor: data.corridor || 'Unknown',
    mode: data.mode || 'sea-freight',
    trackingNumber: data.trackingNumber || null,
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null,
  };
}

export async function OPTIONS(req) {
  return handleOptions(req);
}

export async function GET(req) {
  const auth = await verifyApiKey(req);
  if (!auth.ok) return withCors(NextResponse.json({ error: auth.error }, { status: auth.status }), req);

  const { searchParams } = new URL(req.url);
  const pageSize = Math.min(Number(searchParams.get('pageSize') || DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
  const cursor = searchParams.get('cursor');

  let query = adminDb
    .collection('shipments')
    .where('orgId', '==', auth.auth.orgId)
    .orderBy('createdAt', 'desc')
    .limit(pageSize);

  if (cursor) {
    query = query.startAfter(cursor);
  }

  const snap = await query.get();
  const shipments = snap.docs.map((doc) => toResponseShipment(doc.id, doc.data()));
  const nextCursor = snap.docs.length ? snap.docs[snap.docs.length - 1].data().createdAt || null : null;

  return withCors(NextResponse.json({ data: shipments, pagination: { pageSize, nextCursor } }), req);
}

export async function POST(req) {
  const auth = await verifyApiKey(req);
  if (!auth.ok) return withCors(NextResponse.json({ error: auth.error }, { status: auth.status }), req);

  const body = await req.json();
  const required = ['origin', 'destination', 'originLat', 'originLng', 'destLat', 'destLng', 'carrier', 'cargoValueUSD'];
  for (const field of required) {
    if (body[field] === undefined || body[field] === null || body[field] === '') {
      return withCors(NextResponse.json({ error: `Missing required field: ${field}` }, { status: 400 }), req);
    }
  }

  const now = new Date().toISOString();
  const id = `ship-${uuidv4()}`;
  const shipment = {
    id,
    orgId: auth.auth.orgId,
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
    eta: body.eta || null,
    corridor: body.corridor || 'Unknown',
    mode: body.mode || 'sea-freight',
    trackingNumber: body.trackingNumber || null,
    createdAt: now,
    updatedAt: now,
  };

  await adminDb.collection('shipments').doc(id).set(shipment);

  await auth.supabase.from('shipments').upsert({
    id,
    org_id: auth.auth.orgId,
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
    tracking_number: shipment.trackingNumber,
    created_at: shipment.createdAt,
    updated_at: shipment.updatedAt,
  }, { onConflict: 'id' }).then(() => null).catch(() => null);

  return withCors(NextResponse.json({ data: toResponseShipment(id, shipment) }, { status: 201 }), req);
}
