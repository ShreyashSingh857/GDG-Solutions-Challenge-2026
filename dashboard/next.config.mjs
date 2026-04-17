import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import CopyWebpackPlugin from 'copy-webpack-plugin';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const cesiumRoot = dirname(require.resolve('cesium/package.json'));

/** @type {import('next').NextConfig} */
const nextConfig = {
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