import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
turbopack: {
root: __dirname,
},
webpack: (config) => {
config.module.unknownContextCritical = false;
return config;
},
images: {
remotePatterns: [{ protocol: 'https', hostname: 'unpkg.com' }],
},
};

export default nextConfig;