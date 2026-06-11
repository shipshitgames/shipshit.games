# api.shipshit.games — build from the REPO ROOT so workspace deps resolve:
#   docker build -f apps/api/Dockerfile -t shipshit-api .
# The same image serves any brand (deadrot etc.) — all config is env-driven,
# see README.md for the variables.

FROM oven/bun:1 AS builder
WORKDIR /repo

# Workspace manifests first so dependency layers cache across source changes.
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
COPY packages/assetgen/package.json packages/assetgen/
RUN bun install --ignore-scripts

COPY apps/api apps/api
COPY packages/shared packages/shared
COPY packages/assetgen packages/assetgen

ENV NEXT_TELEMETRY_DISABLED=1
RUN cd apps/api && bunx prisma generate && bun run next build

FROM node:24-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3003 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1

COPY --from=builder /repo/apps/api/.next/standalone ./
COPY --from=builder /repo/apps/api/.next/static ./apps/api/.next/static

USER node
EXPOSE 3003
CMD ["node", "apps/api/server.js"]
