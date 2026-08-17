/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // Assets are already delivered by the configured CDN/origin.
    unoptimized: true,
  },
};

export default nextConfig;
