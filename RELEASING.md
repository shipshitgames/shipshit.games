# Releasing & Production Deploys

Production deploys are driven by **GitHub Releases**, not by pushes to `master`.
This mirrors the proven genfeed.ai architecture, collapsed to shipshit's four
surfaces.

> **Golden rule:** nothing reaches production on a merge to `master`. A surface
> ships only when you cut a Release (or run a manual `workflow_dispatch`), and
> only the surfaces that actually changed since the previous release are
> deployed.

---

## 1. What deploys, and how

| Surface | Domain | Target | Mechanism |
| --- | --- | --- | --- |
| `web`  | shipshit.games      | Vercel | `vercel deploy --prod` (project `prj_rgAwd80VdYDiT3adfMlmOAAnKVqN`) |
| `app`  | app.shipshit.games  | Vercel | `vercel deploy --prod` (project `prj_g7ItrkBV2QeXTYBqYIetTjrz0gpZ`) |
| `docs` | docs.shipshit.games | Vercel | `vercel deploy --prod` (project `prj_KcglQPTZJFj6Nn5oUj04OE0oXm8y`) |
| `api`  | api.shipshit.games  | **EC2 (Docker)** | image → ghcr → SSH-over-Tailscale → `docker compose` on the host, in the RDS VPC |

The `api` runs on a single EC2 host **inside the RDS VPC**, allow-listed on the
RDS security group. That is the fix for the original problem: a Vercel-hosted
api could never reach the private RDS instance. The host pulls a prebuilt image
from ghcr and reads its secrets from AWS SSM via its instance role — **no AWS
credentials ever touch GitHub Actions.**

Workflow: [`.github/workflows/deploy-production.yml`](.github/workflows/deploy-production.yml)
Host scripts: [`docker/`](docker/) (`deploy-production.sh`, `deploy-common.sh`,
`render-ssm-env.sh`, `docker-compose.production.yml`).

### Trigger & change-detection

- **Release published** with a semver `v*` tag whose commit is on `master`.
- The job diffs `previous-v*-tag..HEAD` and deploys only changed surfaces.
  - First release ever (no prior tag) → deploys everything.
  - Pre-releases (`v1.2.0-rc1`, GitHub "pre-release" checkbox) → **deploy
    nothing**, finishes green.
- Repo-wide infra changes (`bun.lock`, root `package.json`, `turbo.json`,
  `tsconfig*.json`) → redeploy **all** surfaces.
- Shared package fan-out: `packages/shared` → all; `packages/ui|engine|
  ressources|game-tester|assets` → web+app; `packages/assetgen` → api.
- `api` deploys before the frontends. If `api` was part of the release and its
  build/deploy fails, the frontends are **blocked** (they only ship when api
  succeeded or wasn't in the release).

---

## 2. Cutting a release (the happy path)

1. Make sure `master` is green and carries everything you want to ship.
2. Create a Release on GitHub with a semver tag:
   ```bash
   gh release create v1.4.0 --target master --title "v1.4.0" --notes "…"
   ```
   (Tag **must** start with `v`. Target **must** be `master`.)
3. Watch the run:
   ```bash
   gh run watch "$(gh run list --workflow=deploy-production.yml -L1 --json databaseId -q '.[0].databaseId')"
   ```
4. The run summary lists which surfaces deployed.

### Manual hotfix / re-deploy

`Actions → Deploy Production → Run workflow` (must be on `master`). Toggle
`force_*` inputs to force specific surfaces (or `force_all`). Use this when you
need to redeploy without cutting a new tag.

---

## 3. One-time provisioning

### 3a. GitHub Actions — Secrets

`Settings → Secrets and variables → Actions → Secrets`:

| Secret | Purpose |
| --- | --- |
| `TAILSCALE_CLIENT_ID`     | Tailscale OAuth client id (ephemeral CI node, `tag:ci`) |
| `TAILSCALE_CLIENT_SECRET` | Tailscale OAuth client secret |
| `EC2_SSH_KEY`             | Private SSH key (PEM) for the deploy user on the EC2 host |
| `EC2_USER`                | SSH user on the host (e.g. `ubuntu` / `ec2-user`) |
| `VERCEL_TOKEN`            | Vercel token with deploy rights to the three projects |

> `GITHUB_TOKEN` is provided automatically. The `deploy-api` job is granted
> `packages: read` so the token it forwards to the host can pull the private
> ghcr image.

### 3b. GitHub Actions — Variables

`Settings → Secrets and variables → Actions → Variables`:

| Variable | Example | Purpose |
| --- | --- | --- |
| `TAILSCALE_INSTANCE_API_IP` | `100.x.y.z` | Tailnet IP of the EC2 host |
| `AWS_REGION`                | `us-east-1` | Region for SSM lookups (host can also resolve via IMDS) |
| `SSM_PARAMETER_PATH_PREFIX` | `/shipshit` | SSM path prefix (params live at `<prefix>/production/*`) |
| `VERCEL_ORG_ID`             | `team_hFVCbNU4RnfEpQOeSWRxmhEJ` | Vercel org/team id |
| `VERCEL_PROJECT_ID_WEB`     | `prj_rgAwd80VdYDiT3adfMlmOAAnKVqN` | web project |
| `VERCEL_PROJECT_ID_APP`     | `prj_g7ItrkBV2QeXTYBqYIetTjrz0gpZ` | app project |
| `VERCEL_PROJECT_ID_DOCS`    | `prj_KcglQPTZJFj6Nn5oUj04OE0oXm8y` | docs project |

### 3c. EC2 host

- Amazon Linux / Ubuntu in the **same VPC** as RDS `shipshit-api`.
- Install **Docker + Docker Compose v2**. Deploy user in the `docker` group.
- Working dir `~/cloud` (the workflow scps scripts to `~/cloud/docker/` and runs
  `~/cloud/docker/deploy-production.sh`).
- **Tailscale** installed and joined with `tag:ci` reachable (the CI node uses
  `tag:ci`; ACLs must allow `tag:ci → host` over SSH/22).
- **Instance role** granting, on `<prefix>/production/*`:
  - `ssm:GetParametersByPath`
  - `kms:Decrypt` (for SecureString params)
- **RDS security group**: add an inbound rule allowing this host (its SG or
  private IP) on Postgres `5432`.
- Open the **api port** (`3003`) only as needed (front it with the existing
  reverse proxy / DNS for `api.shipshit.games`).

### 3d. SSM parameters (`<prefix>/production/<KEY>`, SecureString)

Single-line values only (`render-ssm-env.sh` rejects multiline). Required, from
the api source:

| Key | Notes |
| --- | --- |
| `DATABASE_URL`            | Postgres URL to RDS `shipshit-api` (the whole point) |
| `CLERK_SECRET_KEY`        | Clerk backend key |
| `CLERK_AUTHORIZED_PARTIES`| Clerk authorized parties |
| `CLERK_WEBHOOK_SECRET`    | Clerk webhook signing secret |
| `STRIPE_WEBHOOK_SECRET`   | Stripe webhook signing secret |
| `GITHUB_WEBHOOK_SECRET`   | GitHub webhook signing secret |
| `REPLICATE_API_TOKEN`     | Replicate token (asset generation) |
| `GENERATE_HOURLY_LIMIT`   | Hourly generate rate limit |

> If production exercises assetgen providers beyond Replicate (FAL / Meshy /
> Tripo / Suno / Beatoven), add their credentials here too — see
> `packages/assetgen` for the authoritative list. `SERVICE_NAME` and `NODE_ENV`
> are injected by compose and need not be in SSM.

`SERVICE_NAME`/`PORT`/`HOSTNAME`/`NODE_ENV` come from
`docker-compose.production.yml`, not SSM.

### 3e. Vercel projects — stop git auto-deploy

Today **only the `web` project is git-connected**; it auto-deploys to Production
on every push to `master` (its `rootDirectory` is `apps/web`). `app`/`docs`/`api`
are linked for **CLI deploys only** and do not auto-deploy on a push.

So the file that actually satisfies "nothing on merge to master" is
**[`apps/web/vercel.json`](apps/web/vercel.json)** — it sets
`git.deploymentEnabled.master = false` for the web project. The other files —
repo-root [`vercel.json`](vercel.json) and
[`apps/app`](apps/app/vercel.json) / [`apps/docs`](apps/docs/vercel.json) /
[`apps/api`](apps/api/vercel.json) — are **safety nets**: harmless today, and
they take effect immediately if any of those projects is ever git-connected (or
re-rooted at the repo root). `git.deploymentEnabled` blocks only git-triggered
deploys; PR previews and our CLI `--prod` deploys still work.

Verify in the dashboard for each project:
- **Root Directory** (`web` → `apps/web`; `app` → `apps/app`;
  `docs` → `apps/docs`; `api` → `apps/api`).
- **Production Branch** is `master`.
- For any project you intend to keep off `master`, confirm it is **not**
  git-connected, or that its `master` deployments are disabled.

> **api on Vercel is being retired.** `prj_Q4af3gdjLAZ8vgs9wG6lICLBBR6w`
> (api.shipshit.games) used to auto-deploy a build that could not reach RDS.
> `apps/api/vercel.json` now disables its `master` auto-deploy. After the EC2
> host is serving and DNS for `api.shipshit.games` points at it, delete or fully
> disconnect that Vercel project.

---

## 4. Rollback & troubleshooting

- **api health-check fails on deploy:** `deploy-common.sh` automatically rolls
  the container back to the previously-running image and the job fails (frontends
  are then blocked). Migrations are **not** rolled back — write
  backward-compatible (expand/contract) migrations so the previous image
  tolerates the new schema.
- **Manual api rollback:** on the host, `cd ~/cloud` and
  `API_IMAGE=ghcr.io/shipshitgames/shipshit.games/api:<good-sha> docker compose
  --env-file .env.production -f docker/docker-compose.production.yml up -d api`.
- **Vercel rollback:** promote a previous deployment in the project dashboard.
- **Cannot reach host over Tailscale:** check the `Verify host reachability`
  step; confirm `TAILSCALE_INSTANCE_API_IP` and that `tag:ci` ACLs permit the
  host. Tailnet IPs are stable per node but re-check after host replacement.
- **ghcr pull 403 on host:** confirm `deploy-api` has `packages: read` and the
  image package visibility allows the org token.
- **Nothing deployed after a release:** the diff found no changed surfaces, or it
  was a pre-release. Use `workflow_dispatch` with `force_*` to force a deploy.

---

## 5. Architecture notes

- **Two api images** are built from the same `apps/api/Dockerfile`:
  - runtime (`api:<sha>`) — `node:24-slim`, pruned standalone, serves traffic.
  - migrate (`api-migrate:<sha>`, the `builder` target) — `oven/bun` with the
    Prisma CLI + schema + migrations, used once per deploy to run
    `bunx prisma migrate deploy` (the runtime image has no bun/CLI).
- **Health** is liveness-only (`/health` returns 200 without touching the DB).
  DB reachability is guaranteed by the VPC + SG topology, not the health probe.
- **CI holds zero AWS credentials.** All SSM/RDS access happens on the host via
  its instance role; CI only needs Tailscale OAuth + the EC2 SSH key + the
  auto-provided `GITHUB_TOKEN`.
