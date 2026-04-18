import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import * as XLSX from 'xlsx';
import { adminDb } from '../../../../lib/firebase-admin.js';

export const runtime = 'nodejs';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const REQUIRED_FIELDS = [
  'origin',
  'destination',
  'originLat',
  'originLng',
  'destLat',
  'destLng',
  'status',
  'carrier',
  'cargoValueUSD',
  'eta',
  'corridor',
];

const VALID_STATUS = new Set(['active', 'delayed', 'rerouted', 'disrupted']);
const VALID_MODE = new Set(['sea-freight', 'air-freight', 'rail', 'road']);
const VALID_PAYMENT = new Set(['pending', 'paid', 'overdue', 'partial']);
const VALID_IMPORT_EXPORT = new Set(['import', 'export', 'transit']);

const FIELD_MAP = {
  id: 'id',
  shipmentid: 'id',
  origin: 'origin',
  destination: 'destination',
  originlat: 'originLat',
  originlng: 'originLng',
  destlat: 'destLat',
  destlng: 'destLng',
  destinationlat: 'destLat',
  destinationlng: 'destLng',
  currentlat: 'currentLat',
  currentlng: 'currentLng',
  status: 'status',
  carrier: 'carrier',
  cargovalueusd: 'cargoValueUSD',
  eta: 'eta',
  corridor: 'corridor',
  mode: 'mode',
  paymentamountusd: 'paymentAmountUSD',
  paymentstatus: 'paymentStatus',
  importexport: 'importExport',
  departuredate: 'departureDate',
  trackingnumber: 'trackingNumber',
};

export async function POST(req) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');

    if (!file || typeof file.arrayBuffer !== 'function') {
      return NextResponse.json({ error: 'Missing Excel file upload', data: null }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const firstSheetName = workbook.SheetNames[0];

    if (!firstSheetName) {
      return NextResponse.json({ error: 'Excel file has no sheets', data: null }, { status: 400 });
    }

    const sheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, {
      defval: '',
      raw: false,
      blankrows: false,
    });

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'Excel sheet is empty', data: null }, { status: 400 });
    }

    const errors = [];
    const shipments = [];
    let skippedEmptyRows = 0;

    rows.forEach((rawRow, idx) => {
      const rowNumber = idx + 2;
      const mapped = normalizeRow(rawRow);

      if (isEmptyRow(mapped)) {
        skippedEmptyRows += 1;
        return;
      }

      const rowErrors = validateRow(mapped);
      if (rowErrors.length > 0) {
        errors.push({ row: rowNumber, errors: rowErrors });
        return;
      }

      shipments.push(toShipment(mapped));
    });

    if (errors.length > 0) {
      return NextResponse.json(
        {
          error: 'Validation failed for one or more rows',
          data: null,
          details: errors,
        },
        { status: 400 }
      );
    }

    if (shipments.length === 0) {
      return NextResponse.json(
        {
          error: 'No valid shipment rows found to import',
          data: null,
        },
        { status: 400 }
      );
    }

    const { error: supabaseError } = await supabase
      .from('shipments')
      .upsert(shipments.map(toSupabaseRow), { onConflict: 'id' });

    if (supabaseError) {
      console.error('[API/shipments/import] Supabase upsert failed:', supabaseError.message);
      return NextResponse.json(
        {
          error: `Supabase import failed: ${supabaseError.message}`,
          data: null,
        },
        { status: 500 }
      );
    }

    for (let i = 0; i < shipments.length; i += 400) {
      const batch = adminDb.batch();
      const chunk = shipments.slice(i, i + 400);
      chunk.forEach((shipment) => {
        const ref = adminDb.collection('shipments').doc(shipment.id);
        batch.set(ref, shipment, { merge: true });
      });
      await batch.commit();
    }

    return NextResponse.json({
      data: {
        insertedCount: shipments.length,
        skippedEmptyRows,
        shipments,
      },
      error: null,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message, data: null }, { status: 500 });
  }
}

function normalizeRow(row) {
  const mapped = {};
  Object.entries(row).forEach(([key, value]) => {
    const normalizedKey = String(key)
      .trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, '');
    const targetKey = FIELD_MAP[normalizedKey] || key;
    mapped[targetKey] = value;
  });
  return mapped;
}

function isEmptyRow(row) {
  return Object.values(row).every((value) => {
    if (value === null || value === undefined) return true;
    return String(value).trim() === '';
  });
}

function validateRow(row) {
  const errors = [];

  REQUIRED_FIELDS.forEach((field) => {
    if (!hasValue(row[field])) {
      errors.push(`Missing required field: ${field}`);
    }
  });

  const numericFields = ['originLat', 'originLng', 'destLat', 'destLng', 'cargoValueUSD'];
  numericFields.forEach((field) => {
    if (hasValue(row[field]) && Number.isNaN(Number(row[field]))) {
      errors.push(`Field ${field} must be a number`);
    }
  });

  if (hasValue(row.currentLat) && Number.isNaN(Number(row.currentLat))) {
    errors.push('Field currentLat must be a number');
  }

  if (hasValue(row.currentLng) && Number.isNaN(Number(row.currentLng))) {
    errors.push('Field currentLng must be a number');
  }

  if (hasValue(row.paymentAmountUSD) && Number.isNaN(Number(row.paymentAmountUSD))) {
    errors.push('Field paymentAmountUSD must be a number');
  }

  const status = toLower(row.status);
  if (status && !VALID_STATUS.has(status)) {
    errors.push('Field status must be one of: active, delayed, rerouted, disrupted');
  }

  const mode = toLower(row.mode);
  if (mode && !VALID_MODE.has(mode)) {
    errors.push('Field mode must be one of: sea-freight, air-freight, rail, road');
  }

  const paymentStatus = toLower(row.paymentStatus);
  if (paymentStatus && !VALID_PAYMENT.has(paymentStatus)) {
    errors.push('Field paymentStatus must be one of: pending, paid, overdue, partial');
  }

  const importExport = toLower(row.importExport);
  if (importExport && !VALID_IMPORT_EXPORT.has(importExport)) {
    errors.push('Field importExport must be one of: import, export, transit');
  }

  if (hasValue(row.eta) && !isValidDate(row.eta)) {
    errors.push('Field eta must be a valid date/datetime');
  }

  if (hasValue(row.departureDate) && !isValidDate(row.departureDate)) {
    errors.push('Field departureDate must be a valid date/datetime');
  }

  return errors;
}

function toShipment(row) {
  const now = new Date().toISOString();
  return {
    id: hasValue(row.id) ? String(row.id).trim() : `ship-${uuidv4()}`,
    origin: String(row.origin).trim(),
    destination: String(row.destination).trim(),
    originLat: Number(row.originLat),
    originLng: Number(row.originLng),
    destLat: Number(row.destLat),
    destLng: Number(row.destLng),
    currentLat: hasValue(row.currentLat) ? Number(row.currentLat) : Number(row.originLat),
    currentLng: hasValue(row.currentLng) ? Number(row.currentLng) : Number(row.originLng),
    status: toLower(row.status) || 'active',
    carrier: String(row.carrier).trim(),
    cargoValueUSD: Number(row.cargoValueUSD),
    eta: new Date(row.eta).toISOString(),
    corridor: String(row.corridor).trim(),
    mode: toLower(row.mode) || 'sea-freight',
    paymentAmountUSD: hasValue(row.paymentAmountUSD) ? Number(row.paymentAmountUSD) : null,
    paymentStatus: toLower(row.paymentStatus) || 'pending',
    importExport: toLower(row.importExport) || 'export',
    departureDate: hasValue(row.departureDate) ? new Date(row.departureDate).toISOString() : null,
    trackingNumber: hasValue(row.trackingNumber) ? String(row.trackingNumber).trim() : null,
    createdAt: now,
    updatedAt: now,
  };
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

function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function toLower(value) {
  return hasValue(value) ? String(value).trim().toLowerCase() : '';
}

function isValidDate(value) {
  return !Number.isNaN(new Date(value).getTime());
}
