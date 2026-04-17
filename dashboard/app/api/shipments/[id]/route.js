import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { adminDb } from '../../../../lib/firebase-admin.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function PATCH(req, context) {
  try {
    const { id } = await context.params;
    const body = await req.json();
    const now = new Date().toISOString();

    const NUMS = ['originLat', 'originLng', 'destLat', 'destLng', 'currentLat', 'currentLng', 'cargoValueUSD', 'paymentAmountUSD'];
    const updates = { ...body, updatedAt: now };
    NUMS.forEach((k) => {
      if (updates[k] !== undefined && updates[k] !== null) {
        updates[k] = Number(updates[k]);
      }
    });
    delete updates.id;

    const ref = adminDb.collection('shipments').doc(id);
    const existing = await ref.get();
    if (!existing.exists) {
      return NextResponse.json({ error: `Shipment not found: ${id}`, data: null }, { status: 404 });
    }

    await ref.update(updates);
    const updated = { id, ...existing.data(), ...updates };

    await supabase
      .from('shipments')
      .update({ ...toSupabaseUpdateRow(updates), id: undefined })
      .eq('id', id)
      .then(({ error }) => {
        if (error) {
          console.error('[API/shipments/:id] Supabase update failed:', error.message);
        }
      });

    return NextResponse.json({ data: updated, error: null });
  } catch (err) {
    return NextResponse.json({ error: err.message, data: null }, { status: 500 });
  }
}

export async function DELETE(_, context) {
  try {
    const { id } = await context.params;

    await adminDb.collection('shipments').doc(id).delete();
    await supabase
      .from('shipments')
      .delete()
      .eq('id', id)
      .then(({ error }) => {
        if (error) {
          console.error('[API/shipments/:id] Supabase delete failed:', error.message);
        }
      });

    return NextResponse.json({ data: { id }, error: null });
  } catch (err) {
    return NextResponse.json({ error: err.message, data: null }, { status: 500 });
  }
}

function toSupabaseUpdateRow(updates) {
  return {
    origin: updates.origin,
    destination: updates.destination,
    origin_lat: updates.originLat,
    origin_lng: updates.originLng,
    dest_lat: updates.destLat,
    dest_lng: updates.destLng,
    current_lat: updates.currentLat,
    current_lng: updates.currentLng,
    status: updates.status,
    carrier: updates.carrier,
    cargo_value_usd: updates.cargoValueUSD,
    eta: updates.eta,
    corridor: updates.corridor,
    mode: updates.mode,
    payment_amount_usd: updates.paymentAmountUSD,
    payment_status: updates.paymentStatus,
    import_export: updates.importExport,
    departure_date: updates.departureDate,
    tracking_number: updates.trackingNumber,
    updated_at: updates.updatedAt,
  };
}
