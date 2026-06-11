/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone server output so the Docker image ships only traced files.
  output: "standalone",
  // Prisma's native query engines load dynamically; tracing can't see them.
  outputFileTracingIncludes: {
    "/**/*": ["./generated/client/**"],
  },
};

export default nextConfig;
