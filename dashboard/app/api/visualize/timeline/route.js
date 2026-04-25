import { NextResponse } from 'next/server';
import { adminDb } from '../../../../lib/firebase-admin.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function clamp(value, min, max) {
	if (!Number.isFinite(value)) return min;
	return Math.max(min, Math.min(max, value));
}

function toIso(value) {
	if (!value) return null;
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function GET(req) {
	try {
		const { searchParams } = new URL(req.url);
		const limit = clamp(Number.parseInt(searchParams.get('limit') || '18', 10), 5, 40);

		const resolutionsSnap = await adminDb
			.collection('resolutions')
			.orderBy('createdAt', 'desc')
			.limit(limit)
			.get();

		const resolutions = resolutionsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
		const disruptionIds = [...new Set(resolutions.map((item) => item.disruptionId).filter(Boolean))];
		const impactReportIds = [...new Set(resolutions.map((item) => item.impactReportId).filter(Boolean))];

		const disruptionRefs = disruptionIds.map((id) => adminDb.collection('disruptions').doc(id));
		const impactRefs = impactReportIds.map((id) => adminDb.collection('impactReports').doc(id));

		const disruptionDocs = disruptionRefs.length ? await adminDb.getAll(...disruptionRefs) : [];
		const impactDocs = impactRefs.length ? await adminDb.getAll(...impactRefs) : [];

		const disruptionsById = new Map(
			disruptionDocs
				.filter((doc) => doc.exists)
				.map((doc) => [doc.id, { id: doc.id, ...doc.data() }])
		);
		const impactById = new Map(
			impactDocs
				.filter((doc) => doc.exists)
				.map((doc) => [doc.id, { id: doc.id, ...doc.data() }])
		);

		const data = resolutions.map((resolution) => {
			const disruption = disruptionsById.get(resolution.disruptionId) || null;
			const impact = impactById.get(resolution.impactReportId) || null;

			return {
				traceId: resolution.traceId || resolution.id,
				createdAt: toIso(resolution.createdAt) || new Date().toISOString(),
				status: resolution.status || 'pending',
				resolvedAt: toIso(resolution.resolvedAt),
				disruption: disruption
					? {
						id: disruption.id,
						type: disruption.type || 'UNKNOWN',
						location: disruption.location || 'Unknown location',
						severity: Number(disruption.severity || 0),
						detectedAt: toIso(disruption.detectedAt),
					}
					: null,
				impact: impact
					? {
						id: impact.id,
						cascadeRisk: impact.cascadeRisk || 'UNKNOWN',
						urgency: Number(impact.urgency || 0),
						totalCargoAtRiskUSD: Number(impact.totalCargoAtRiskUSD || 0),
					}
					: null,
				resolution: {
					optionCount: Number(resolution.optionCount || 0),
					selectedRank: resolution.selectedRank || null,
					validationStatus: resolution.validationStatus || null,
				},
			};
		});

		return NextResponse.json({ data, error: null });
	} catch (err) {
		return NextResponse.json({ data: null, error: err.message }, { status: 500 });
	}
}
