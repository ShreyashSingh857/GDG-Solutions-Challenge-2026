import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { NextResponse } from 'next/server';
import { adminDb } from '../../../../../lib/firebase-admin.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function readPrompt(agentName) {
	const candidates = [
		resolve(process.cwd(), '..', agentName, 'agent', 'prompt.md'),
		resolve(process.cwd(), agentName, 'agent', 'prompt.md'),
	];

	for (const path of candidates) {
		if (existsSync(path)) {
			return readFileSync(path, 'utf-8');
		}
	}
	return '';
}

function normalizeValidationStatus(status) {
	if (status && typeof status === 'object') {
		return {
			valid: Boolean(status.valid),
			errors: Array.isArray(status.errors) ? status.errors : [],
			repairedCount: Number(status.repairedCount || 0),
			parseRetries: Number(status.parseRetries || 0),
			corroboratingSources: Number(status.corroboratingSources || 0),
		};
	}
	return { valid: true, errors: [], repairedCount: 0, parseRetries: 0, corroboratingSources: 0 };
}

function compactDisruption(disruption) {
	if (!disruption) return null;
	return {
		id: disruption.id,
		type: disruption.type,
		severity: disruption.severity,
		location: disruption.location,
		epicenterLat: disruption.epicenterLat,
		epicenterLng: disruption.epicenterLng,
		affectedZones: disruption.affectedZones,
		confidence: disruption.confidence,
		rawDescription: disruption.rawDescription,
		detectedAt: disruption.detectedAt,
	};
}

function compactImpact(impact) {
	if (!impact) return null;
	return {
		id: impact.id,
		disruptionId: impact.disruptionId,
		cascadeRisk: impact.cascadeRisk,
		urgency: impact.urgency,
		totalCargoAtRiskUSD: impact.totalCargoAtRiskUSD,
		analysisText: impact.analysisText,
		affectedShipments: Array.isArray(impact.affectedShipments)
			? impact.affectedShipments.slice(0, 15)
			: [],
		createdAt: impact.createdAt,
	};
}

function compactResolution(resolution, options) {
	if (!resolution) return null;
	return {
		traceId: resolution.traceId || resolution.id,
		impactReportId: resolution.impactReportId,
		disruptionId: resolution.disruptionId,
		cascadeRisk: resolution.cascadeRisk,
		urgency: resolution.urgency,
		totalCargoAtRiskUSD: resolution.totalCargoAtRiskUSD,
		analysisText: resolution.analysisText,
		optionCount: resolution.optionCount,
		status: resolution.status,
		selectedRank: resolution.selectedRank || null,
		createdAt: resolution.createdAt,
		resolvedAt: resolution.resolvedAt || null,
		options,
	};
}

export async function GET(_req, context) {
	try {
		const { traceId } = await context.params;
		if (!traceId) {
			return NextResponse.json({ data: null, error: 'traceId is required' }, { status: 400 });
		}

		let resolutionDoc = await adminDb.collection('resolutions').doc(traceId).get();
		if (!resolutionDoc.exists) {
			const fallback = await adminDb
				.collection('resolutions')
				.where('traceId', '==', traceId)
				.limit(1)
				.get();
			resolutionDoc = fallback.docs[0];
		}

		if (!resolutionDoc?.exists) {
			return NextResponse.json({ data: null, error: 'Trace not found' }, { status: 404 });
		}

		const resolution = { id: resolutionDoc.id, ...resolutionDoc.data() };
		const optionsSnap = await resolutionDoc.ref.collection('options').orderBy('rank', 'asc').get();
		const options = optionsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

		const [impactDoc, disruptionDoc] = await Promise.all([
			resolution.impactReportId ? adminDb.collection('impactReports').doc(resolution.impactReportId).get() : null,
			resolution.disruptionId ? adminDb.collection('disruptions').doc(resolution.disruptionId).get() : null,
		]);

		const impact = impactDoc?.exists ? { id: impactDoc.id, ...impactDoc.data() } : null;
		const disruption = disruptionDoc?.exists ? { id: disruptionDoc.id, ...disruptionDoc.data() } : null;

		const monitorPrompt = disruption?.systemPromptSnapshot || readPrompt('disruption').slice(0, 2000);
		const impactPrompt = impact?.systemPromptSnapshot || readPrompt('impact').slice(0, 2000);
		const resolutionPrompt = resolution?.systemPromptSnapshot || readPrompt('resolution').slice(0, 2000);

		const tabs = {
			monitor: {
				agent: 'monitor',
				systemPrompt: monitorPrompt,
				inputPayload:
					disruption?.inputPayloadSnapshot ||
					JSON.stringify({ rawDescription: disruption?.rawDescription || '' }, null, 2),
				streamOutput: disruption?.modelOutputSnapshot || '',
				finalJson: compactDisruption(disruption),
				validationStatus: normalizeValidationStatus(disruption?.validationStatus),
			},
			impact: {
				agent: 'impact',
				systemPrompt: impactPrompt,
				inputPayload:
					impact?.inputPayloadSnapshot ||
					JSON.stringify({
						disruption: compactDisruption(disruption),
						totalCargoAtRiskUSD: impact?.totalCargoAtRiskUSD,
					}, null, 2),
				streamOutput: impact?.modelOutputSnapshot || '',
				finalJson: compactImpact(impact),
				validationStatus: normalizeValidationStatus(impact?.validationStatus),
			},
			resolution: {
				agent: 'resolution',
				systemPrompt: resolutionPrompt,
				inputPayload:
					resolution?.inputPayloadSnapshot ||
					JSON.stringify(compactImpact(impact), null, 2),
				streamOutput: resolution?.modelOutputSnapshot || '',
				finalJson: {
					options,
					status: resolution.status,
					selectedRank: resolution.selectedRank || null,
				},
				validationStatus: normalizeValidationStatus(resolution?.validationStatus),
			},
		};

		return NextResponse.json({
			data: {
				traceId: resolution.traceId || resolution.id,
				disruption: compactDisruption(disruption),
				impact: compactImpact(impact),
				resolution: compactResolution(resolution, options),
				tabs,
			},
			error: null,
		});
	} catch (err) {
		return NextResponse.json({ data: null, error: err.message }, { status: 500 });
	}
}
