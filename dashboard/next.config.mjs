/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    config.module.unknownContextCritical = false;
    return config;
  },
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'unpkg.com' }],
  },
};

export default nextConfig;
