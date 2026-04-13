import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import CopyWebpackPlugin from 'copy-webpack-plugin';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
	turbopack: {
		root: __dirname,
	},
	webpack: (config, { webpack }) => {
		config.plugins.push(
			new CopyWebpackPlugin({
				patterns: [
					{ from: 'node_modules/cesium/Build/Cesium/Workers', to: 'static/cesium/Workers' },
					{ from: 'node_modules/cesium/Build/Cesium/Assets', to: 'static/cesium/Assets' },
					{ from: 'node_modules/cesium/Build/Cesium/Widgets', to: 'static/cesium/Widgets' },
					{ from: 'node_modules/cesium/Build/Cesium/ThirdParty', to: 'static/cesium/ThirdParty', noErrorOnMissing: true },
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