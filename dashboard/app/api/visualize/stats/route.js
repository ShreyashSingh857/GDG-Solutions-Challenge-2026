import { NextResponse } from 'next/server';
import { adminDb } from '../../../../lib/firebase-admin.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_STATS = {
	totalResolutions: 0,
	humanHoursSaved: 0,
	totalCargoAnalyzedUSD: 0,
	updatedAt: null,
};

export async function GET() {
	try {
		const snap = await adminDb.collection('stats').doc('global').get();
		const data = snap.exists ? snap.data() || {} : {};

		return NextResponse.json({
			data: {
				totalResolutions: Number(data.totalResolutions || 0),
				humanHoursSaved: Number(data.humanHoursSaved || 0),
				totalCargoAnalyzedUSD: Number(data.totalCargoAnalyzedUSD || 0),
				updatedAt: data.updatedAt || null,
			},
			error: null,
		});
	} catch (err) {
		return NextResponse.json({ data: DEFAULT_STATS, error: err.message }, { status: 200 });
	}
}
