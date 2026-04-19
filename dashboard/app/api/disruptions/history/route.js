import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { adminDb } from '../../../../lib/firebase-admin.js';

function parseDate(value, fallback) {
	if (!value) return fallback;
	const parsed = new Date(value);
	return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function normalizeDisruption(record) {
	return {
		id: record.id,
		type: record.type || record.disruptionType || 'UNKNOWN',
		severity: Number(record.severity ?? record.severityScore ?? 0),
		location: record.location || record.disruptionLocation || 'Unknown location',
		epicenterLat: record.epicenterLat ?? record.epicenter_lat ?? null,
		epicenterLng: record.epicenterLng ?? record.epicenter_lng ?? null,
		detectedAt: record.detectedAt || record.detected_at || record.receivedAt || record.timestamp || new Date().toISOString(),
		confidence: Number(record.confidence ?? 0),
		rawDescription: record.rawDescription || record.description || '',
		affectedZones: record.affectedZones || record.affected_zones || [],
	};
}

function inRange(record, from, to) {
	const detectedAt = new Date(record.detectedAt || record.receivedAt || 0);
	if (Number.isNaN(detectedAt.getTime())) return false;
	return detectedAt >= from && detectedAt <= to;
}

function getSupabaseClient() {
	const url = process.env.SUPABASE_URL;
	const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
	if (!url || !key) return null;
	return createClient(url, key, {
		auth: { autoRefreshToken: false, persistSession: false },
	});
}

export async function GET(req) {
	try {
		const { searchParams } = new URL(req.url);
		const to = parseDate(searchParams.get('to'), new Date());
		const from = parseDate(searchParams.get('from'), new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000));
		const supabase = getSupabaseClient();
		let rows = [];

		if (supabase) {
			const query = supabase
				.from('disruptions')
				.select('id,type,severity,location,epicenter_lat,epicenter_lng,detected_at,confidence,raw_description,affected_zones')
				.gte('detected_at', from.toISOString())
				.lte('detected_at', to.toISOString())
				.order('detected_at', { ascending: false })
				.limit(200);
			const { data, error } = await query;
			if (!error && Array.isArray(data)) {
				rows = data;
			}
		}

		if (!rows.length) {
			const snap = await adminDb.collection('disruptions').orderBy('detectedAt', 'desc').limit(200).get();
			rows = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
		}

		const data = rows
			.map(normalizeDisruption)
			.filter((record) => inRange(record, from, to))
			.sort((a, b) => new Date(a.detectedAt) - new Date(b.detectedAt));

		return NextResponse.json({ data, error: null, range: { from: from.toISOString(), to: to.toISOString() } });
	} catch (err) {
		return NextResponse.json({ data: null, error: err.message }, { status: 500 });
	}
}