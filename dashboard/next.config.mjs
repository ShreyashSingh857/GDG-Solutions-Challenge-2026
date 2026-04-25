import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import CopyWebpackPlugin from 'copy-webpack-plugin';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const cesiumRoot = dirname(require.resolve('cesium/package.json'));
const cspHeader = `
	default-src 'self';
	script-src 'self' 'unsafe-eval' 'unsafe-inline' https://cesium.com;
	style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
	img-src 'self' data: blob: https://*.tile.openstreetmap.org https://ion.cesium.com https://dev.virtualearth.net https://*.virtualearth.net;
	connect-src 'self' https://*.supabase.co https://firestore.googleapis.com https://*.googleapis.com https://api.cesium.com https://ion.cesium.com https://assets.ion.cesium.com https://dev.virtualearth.net https://*.virtualearth.net wss: ws: http://localhost:*;
	font-src 'self' https://fonts.gstatic.com;
	worker-src 'self' blob:;
	frame-src 'none';
`.replace(/\n/g, ' ').trim();

/** @type {import('next').NextConfig} */
const nextConfig = {
	outputFileTracingRoot: resolve(__dirname, '..'),
	async headers() {
		return [
			{
				source: '/(.*)',
				headers: [{ key: 'Content-Security-Policy', value: cspHeader }],
			},
		];
	},
	webpack: (config, { webpack }) => {
		config.plugins.push(
			new CopyWebpackPlugin({
				patterns: [
					{ from: resolve(cesiumRoot, 'Build/Cesium/Workers'), to: 'static/cesium/Workers' },
					{ from: resolve(cesiumRoot, 'Build/Cesium/Assets'), to: 'static/cesium/Assets' },
					{ from: resolve(cesiumRoot, 'Build/Cesium/Widgets'), to: 'static/cesium/Widgets' },
					{ from: resolve(cesiumRoot, 'Build/Cesium/ThirdParty'), to: 'static/cesium/ThirdParty', noErrorOnMissing: true },
				],
			})
		);

		config.module.unknownContextCritical = false;

		config.plugins.push(
			new webpack.DefinePlugin({
				CESIUM_BASE_URL: JSON.stringify('/_next/static/cesium'),
			})
		);

		return config;
	},
	images: {
		remotePatterns: [{ protocol: 'https', hostname: 'unpkg.com' }],
	},
};

export default nextConfig;