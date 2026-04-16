import { Cartesian3, Quaternion, Math as CesiumMath } from 'cesium';

export function generateArcPositions(originLng, originLat, destLng, destLat, samples = 64, maxAltM = 1_000_000, maxAltFactor = 0.55) {
	const start = Cartesian3.fromDegrees(originLng, originLat);
	const end = Cartesian3.fromDegrees(destLng, destLat);
	const startUnit = Cartesian3.normalize(start, new Cartesian3());
	const endUnit = Cartesian3.normalize(end, new Cartesian3());
	const angle = Cartesian3.angleBetween(start, end);
	const peakAlt = Math.min(angle * 6371000 * maxAltFactor, maxAltM);
	const radius = Cartesian3.magnitude(start);
	const positions = [];
	const dir = new Cartesian3();
	const left = new Cartesian3();
	const right = new Cartesian3();
	const omegaQ = new Quaternion();
	const dot = CesiumMath.clamp(Cartesian3.dot(startUnit, endUnit), -1.0, 1.0);
	omegaQ.w = Math.acos(dot);
	const omega = omegaQ.w;
	const sinOmega = Math.sin(omega);

	for (let i = 0; i <= samples; i += 1) {
		const t = i / samples;
		if (sinOmega < CesiumMath.EPSILON7) {
			Cartesian3.clone(startUnit, dir);
		} else {
			Cartesian3.multiplyByScalar(startUnit, Math.sin((1 - t) * omega) / sinOmega, left);
			Cartesian3.multiplyByScalar(endUnit, Math.sin(t * omega) / sinOmega, right);
			Cartesian3.add(left, right, dir);
			Cartesian3.normalize(dir, dir);
		}
		const altitude = peakAlt * Math.sin(CesiumMath.PI * t);
		Cartesian3.multiplyByScalar(dir, radius + altitude, dir);
		positions.push(Cartesian3.clone(dir));
	}

	return positions;
}

export function generateArcFromWaypoints(waypoints, samplesPerSegment = 48) {
	if (!Array.isArray(waypoints) || waypoints.length < 2) return [];
	const merged = [];
	for (let i = 0; i < waypoints.length - 1; i += 1) {
		const a = waypoints[i];
		const b = waypoints[i + 1];
		const seg = generateArcPositions(a.lng, a.lat, b.lng, b.lat, samplesPerSegment);
		if (i > 0 && seg.length) seg.shift();
		merged.push(...seg);
	}
	return merged;
}