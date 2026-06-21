# api — the Ship Shit platform API

Next.js (route handlers only) + Prisma/Postgres. Serves `api.shipshit.dev` as a
self-contained Docker image on an EC2 host co-located with its RDS Postgres, so
other brands (deadrot) can run the same image with different env on the same host.

## Surface

| Route | Auth | Purpose |
| --- | --- | --- |
| `GET /health` | public | liveness + brand name |
| `GET /v1/assets` | Clerk JWT | Asset Lab gallery (metadata) |
| `GET /v1/assets/:id/file` | Clerk JWT | asset PNG |
| `POST /v1/assets/generate` | Clerk JWT | nano-banana-2 sprite generation |
| `GET /v1/stats/commits` | Clerk JWT | commit activity from GitHub pushes |
| `POST /webhooks/stripe` | Stripe signature | verified event log |
| `POST /webhooks/clerk` | svix signature | User mirror sync + event log |
| `POST /webhooks/github` | HMAC sha256 | commit ingestion + event log |

`/v1/*` expects `Authorization: Bearer <Clerk session JWT>`; apps/app proxies
server-side and forwards the caller's token (see `apps/app/lib/api.ts`).

## Env

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres; `sslmode=require` against RDS |
| `CLERK_SECRET_KEY` | yes | verifies session JWTs |
| `CLERK_AUTHORIZED_PARTIES` | no | extra allowed `azp` origins, comma-separated |
| `CLERK_WEBHOOK_SECRET` | for webhook | svix signing secret from Clerk dashboard |
| `STRIPE_WEBHOOK_SECRET` | for webhook | from Stripe dashboard endpoint config |
| `GITHUB_WEBHOOK_SECRET` | for webhook | repo/org webhook shared secret |
| `REPLICATE_API_TOKEN` | for generate | falls back to the `shipshit-replicate` keychain entry locally |
| `SERVICE_NAME` | no | brand label in `/health` (e.g. `api.deadrot.com`) |

## Local dev

```sh
docker compose up postgres   # Postgres 17 on :5432
bun run db:migrate           # prisma migrate dev
bun run dev                  # next dev on :3003
```

## Container

```sh
# from the repo root
docker build -f apps/api/Dockerfile -t shipshit-api .
docker run -p 3003:3003 -e DATABASE_URL=... -e CLERK_SECRET_KEY=... shipshit-api
```

The runtime image does not ship the prisma CLI — run migrations against the
target database before (or alongside) rollout, e.g. `bun run db:deploy` from a
checkout, or the `migrate` one-shot service in docker-compose.yml (compose
runs it automatically before the API starts).

A deadrot deployment is the same image with deadrot's Clerk instance,
database, webhook secrets, and `SERVICE_NAME=api.deadrot.com`.

## Migrations

Schema lives in `prisma/schema.prisma`. `bun run db:migrate` for dev,
`bun run db:deploy` against RDS/production.
