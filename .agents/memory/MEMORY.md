# Ship Shit Games Studio Repo - Repo Memory

last_verified: 2026-07-09

## What this is
The studio/tooling monorepo (Turborepo + Bun), GitHub
`shipshitgames/shipshit.games`.

This repo owns the studio products and tooling used to build Deadrot:

- `apps/web` - Ship Shit Games studio/build-in-public site.
- `apps/app` - hosted account, entitlement, Asset Lab, and future project/job
  history control plane.
- `apps/desktop` - local-first macOS studio cockpit for project folders,
  CLI/terminal execution, keychain providers, streamed logs, generated asset
  previews, gyms, and promotion workflows.
- `apps/cli` - npm/npx command-line entrypoint for non-GUI workflows.
- `packages/assetgen` - reusable asset generation core and CLI entrypoint.
  This stays here so the studio can ship a CLI ASAP and dogfood it against
  Deadrot.
- `packages/engine` / `@shipshitgames/engine` - the canonical org-level
  reusable game engine package. It stays in this repo because the package is for
  Ship Shit Games as a platform, not only the Deadrot IP.
- Studio-only shared packages such as research, shared utilities, and studio UI.

## Repo Boundary
This repo does not own shipped Deadrot games, Deadrot-specific runtime assets,
audio, soundtrack, generated source archives, or Deadrot-specific runtime
packages consumed by games.

Exception: `packages/engine` is intentionally owned here as
`@shipshitgames/engine`. Deadrot games should consume that canonical org-level
engine through the published package in CI/release builds or a temporary local
`bun link` bridge for unpublished cross-repo development, not own a divergent
`@deadrot/engine` fork.

Those live in the sibling Deadrot repo:

```txt
../deadrotcom
```

Tools in this repo should read from and write to the Deadrot asset package:

```txt
../deadrotcom/packages/assets
```

For example, `packages/assetgen` defaults to that package and accepts
`--assets-dir <path>` when a different target is needed.

Do not move `packages/assetgen` into `deadrotcom`. It is the studio/product CLI.

If a game ships to players, it belongs in `../deadrotcom/apps/games`. If a
package is Deadrot-specific runtime data, content, or assets, it belongs in
`../deadrotcom/packages`, especially `../deadrotcom/packages/assets`.

## Conventions
The generator/tooling product lives in `shipshitgames`; generated outputs ship
from `deadrotcom`. Do not treat Deadrot-specific runtime package copies in this
repo as the Deadrot shipping source of truth unless the user explicitly says
otherwise. Do treat `@shipshitgames/engine` as a studio/org package that can be
reused by Deadrot and future IPs. The package/link workflow and temporary
duplicate-package handling are documented in
`packages/engine/CANONICAL-ENGINE.md`. The engine package intentionally exports
`assets-manifest.schema.json`; Deadrot asset files and generated source history
still belong in `../deadrotcom/packages/assets`.

Deadrot canon lives in the sibling repo at `../deadrotcom/apps/lore/content`,
which is the Obsidian vault root.

## Product Architecture

Planning epic: GitHub issue #301. Canonical roadmap:
`docs/shipshitcode-roadmap.md`.

- `apps/app` is the hosted source of truth for account, entitlement, and future
  cross-device project/job history.
- `apps/desktop` is an independent local-first cockpit, not a fork or embedded
  copy of the hosted portal. Hosted account/control-plane capabilities may be
  linked or synchronized explicitly, while filesystem/provider/terminal/game
  workflows remain desktop-owned.
- The desktop bridge owns privileged local actions: choosing project folders,
  resolving Deadrot asset package paths, running local CLIs, streaming logs,
  storing provider keys in the macOS keychain, and previewing generated files.
- Hosted `apps/app` must degrade cleanly when the desktop bridge is absent:
  show account/content/tool state, but disable or hide local filesystem actions.
- `apps/cli` is the npm-distributed CLI. It must support `npx
  @shipshitgames/cli` and global npm/Bun installs.
- `apps/desktop` is a macOS app. It should be distributed as a signed/notarized
  DMG via Homebrew cask (`brew install --cask shipshitgames-studio`), not as an
  npm package.

## Infra
Studio web/app surfaces deploy separately from the Deadrot player-facing hub.

### Production deploy pipeline
Full runbook: `RELEASING.md` (repo root). Mirrors genfeed.ai's architecture.

- Trigger: a **GitHub Release** with a semver `v*` tag on `master`. **Nothing**
  deploys on merge/push to `master` — Vercel git auto-deploy is disabled via
  `vercel.json` (`git.deploymentEnabled.master = false`) at the repo root and in
  `apps/{web,app,docs,api}`. Workflow: `.github/workflows/deploy-production.yml`.
- Change-detection deploys only surfaces changed since the previous `v*` tag
  (`git diff prev..HEAD`); infra files (`bun.lock`/root manifests) → all;
  pre-releases deploy nothing.
- `api` (api.shipshit.games) runs as **Docker on a single EC2 host inside the
  RDS VPC** (allow-listed on the RDS SG) — the fix for "Vercel build can't reach
  RDS". CI ships the image to ghcr, then SSHes over **Tailscale** (`tag:ci`) and
  runs `docker/deploy-production.sh`; the host reads secrets from **AWS SSM**
  (`/shipshit/production/*`) via its **instance role**. CI holds zero AWS creds.
- Two images from `apps/api/Dockerfile`: runtime (`api:<sha>`, node-slim) and
  migrate (`api-migrate:<sha>`, the `builder` target with bun+Prisma CLI) that
  runs `prisma migrate deploy` once per deploy.
- web/app/docs deploy via `vercel deploy --prod` (run from repo root, project
  selected by `VERCEL_PROJECT_ID` env). The old api Vercel project
  `prj_Q4af…` is being retired once the EC2 host serves api DNS.
- Vercel projects: web `prj_rgAwd…` (root `.`), app `prj_g7It…` (`apps/app`),
  docs `prj_Kcgl…` (`apps/docs`), api `prj_Q4af…` (`apps/api`); org
  `team_hFVCbNU4RnfEpQOeSWRxmhEJ`.
