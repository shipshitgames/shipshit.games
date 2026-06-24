/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone server output so the Docker image ships only traced files.
  output: "standalone",
  // Prisma's native query engines load dynamically; tracing can't see them.
  outputFileTracingIncludes: {
    "/**/*": ["./generated/client/**"],
  },
  // NOTE: Asset Lab sheet slicing reuses assetgen's sharp-backed sprite-sheet
  // normalizer, so the Docker runtime must keep sharp. node-pty is still CLI
  // only and can be pruned from the standalone output.
};

export default nextConfig;
