/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone server output so the Docker image ships only traced files.
  output: "standalone",
};

export default nextConfig;
