import { Cartesian3 } from 'cesium';

export function generateArcPositions(originLng, originLat, destLng, destLat, samples = 64, maxAltM = 4_500_000) {
	const start = Cartesian3.fromDegrees(originLng, originLat);
	const end = Cartesian3.fromDegrees(destLng, destLat);
	const angle = Cartesian3.angleBetween(start, end);
	const peakAlt = Math.min(angle * 6371000 * 0.6, maxAltM);
	const positions = [];
	const scratch = new Cartesian3();

	for (let i = 0; i <= samples; i += 1) {
		const t = i / samples;
		Cartesian3.lerp(start, end, t, scratch);
		Cartesian3.normalize(scratch, scratch);
		const altitude = peakAlt * Math.sin(Math.PI * t);
		const scale = Cartesian3.magnitude(start) + altitude;
		Cartesian3.multiplyByScalar(scratch, scale, scratch);
		positions.push(Cartesian3.clone(scratch));
	}

	return positions;
}