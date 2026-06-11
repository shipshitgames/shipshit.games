/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone server output so the Docker image ships only traced files.
  output: "standalone",
  // Prisma's native query engines load dynamically; tracing can't see them.
  outputFileTracingIncludes: {
    "/**/*": ["./generated/client/**"],
  },
  // NOTE: assetgen drags sharp + node-pty (its sprite-sheet slicer / PTY
  // toolchain) into the install, and Next auto-traces sharp for the image
  // optimizer. The API does zero image work, so the Dockerfile prunes those
  // native binaries from the standalone output (glob excludes don't reliably
  // match bun's flattened .bun store layout).
};

export default nextConfig;
