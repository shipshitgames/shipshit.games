# api.shipshit.games — build from the REPO ROOT so workspace deps resolve:
#   docker build -f apps/api/Dockerfile -t shipshit-api .
# The same image serves any brand (deadrot etc.) — all config is env-driven,
# see README.md for the variables.

# Builder works at /app so absolute paths Prisma bakes into the client match
# the runner's layout (engine lookup is path-sensitive).
FROM oven/bun:1 AS builder
WORKDIR /app

# Every workspace manifest must be present for a frozen-lockfile install
# (bun.lock covers the whole monorepo).
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/app/package.json apps/app/
COPY apps/cli/package.json apps/cli/
COPY apps/desktop/package.json apps/desktop/
COPY apps/docs/package.json apps/docs/
COPY apps/web/package.json apps/web/
COPY packages/assetgen/package.json packages/assetgen/
COPY packages/engine/package.json packages/engine/
COPY packages/game-tester/package.json packages/game-tester/
COPY packages/ressources/package.json packages/ressources/
COPY packages/shared/package.json packages/shared/
COPY packages/ui/package.json packages/ui/
RUN bun install --frozen-lockfile --ignore-scripts

COPY apps/api apps/api
COPY packages/shared packages/shared
COPY packages/assetgen packages/assetgen

ENV NEXT_TELEMETRY_DISABLED=1
RUN cd apps/api && bunx prisma generate && bun run next build

# The API does zero image processing, but Next auto-traces sharp (assetgen's
# sprite-sheet slicer dep) into the standalone bundle. Drop it + node-pty so
# the runtime image carries no asset-toolchain native binaries.
RUN cd apps/api/.next/standalone/node_modules \
  && rm -rf sharp @img node-pty \
            .bun/sharp@* .bun/@img+* .bun/node-pty@*

FROM node:24-slim AS runner
# Prisma probes the system OpenSSL to pick its engine; slim ships without it.
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3005 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1

COPY --from=builder /app/apps/api/.next/standalone ./
COPY --from=builder /app/apps/api/.next/static ./apps/api/.next/static

USER node
EXPOSE 3005
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3005)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "apps/api/server.js"]
