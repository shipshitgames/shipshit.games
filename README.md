# Ship Shit Games

![Ship Shit Games wordmark](apps/web/public/brand/shipshit-games-wordmark.png)

**The open-source gaming SaaS/tooling platform for building games with AI in
public.**

[shipshit.games](https://shipshit.games) |
[deadrot.com](https://deadrot.com)

## Current Stage

This repo is the Ship Shit Games product/tooling platform: the public site,
hosted app, API, docs, CLI, desktop studio, asset-generation core, provider
adapters, ressources library, game-testing tools, engine/runtime packages, and
templates used to build browser-first games.

DEADROT is the flagship proof-of-concept universe built with this tooling. The
tools and workflow are the product; DEADROT proves they can ship real games.

The player-facing DEADROT hub, lore app, games, runtime assets, and shipped game
packages now live in
[`shipshitgames/deadrotcom`](https://github.com/shipshitgames/deadrotcom).

## Apps

- `apps/web` - live Next 16 studio site for Skills Pro, DEADROT proof, the asset
  pipeline, pricing, and public calls to action.
- `apps/app` - authenticated Studio Pass portal and hosted Asset Lab.
- `apps/api` - studio billing/webhook, generation, storage, and metadata API.
- `apps/docs` - Nextra docs for studio tools, asset generation, ressources,
  shared packages, canon rules, and deployment notes.
- `apps/cli` - `shipshitgames` / `ssg` command-line entrypoint.
- `apps/desktop` - Electron + Vite + React studio cockpit for maps, sprites, 3D,
  music/SFX, local Codex CLI flows, and provider integrations.

## Packages

- `packages/assetgen` / `@shipshitgames/assetgen` - reusable asset-generation
  core and CLI. Reads/writes `../deadrotcom/packages/assets` by default.
- `packages/engine` / `@shipshitgames/engine` - open-source embodied Three.js
  game engine primitives shared by studio titles.
- `packages/ressources` / `@shipshitgames/ressources` - source/transcript
  library, distillation CLI, and derivative rule/skill/app/tool candidates.
- `packages/shared` / `@shipshitgames/shared` - shared TypeScript utilities and
  types.
- `packages/tester` / `@shipshitgames/tester` - Playwright browser-game QA,
  blank-canvas detection, screenshots, and agent-readable reports.
- `packages/ui` / `@shipshitgames/ui` - shared React UI primitives, Tailwind
  styles, and game-flavored component shells.

## Repo Map

```txt
apps/
  web/       # shipshit.games
  app/       # app.shipshit.games
  api/       # api.shipshit.games
  docs/      # docs.shipshit.games
  cli/       # shipshitgames / ssg binary
  desktop/   # Electron studio
packages/
  assetgen/
  engine/
  ressources/
  shared/
  tester/
  ui/
scripts/
```

## Product Direction

- [`STUDIO-ARCHITECTURE.md`](STUDIO-ARCHITECTURE.md) defines Ship Shit Games as
  the SaaS/tooling platform and DEADROT as downstream dogfood.
- [`docs/shipshitcode-roadmap.md`](docs/shipshitcode-roadmap.md) defines the
  local-first "Cursor for games" roadmap: open an IP repo, generate assets,
  launch gyms, run QA, and promote changes back into the downstream game repo.
- [`docs/asset-generation-roadmap.md`](docs/asset-generation-roadmap.md) lays out
  the provider-backed MVP, self-hosted/open model adapters, export targets, and
  next `assetgen model` implementation slice.
- [`docs/deadrot-dogfood-loop.md`](docs/deadrot-dogfood-loop.md) documents the
  loop from generated draft to Deadrot runtime asset.

## Develop

```bash
bun install
bun run dev
bun run build
bun run typecheck
```

CI runs the same local checks from GitHub Actions:

```bash
bun run ci:scaffold
bun run ci:engine
bun run lint
bun run typecheck
bun run build
```

Common focused commands:

```bash
bun --filter web dev
bun --filter docs dev
bun --filter @shipshitgames/desktop dev
```

## Operating Notes

- Default branch: `master`.
- Runtime DEADROT games ship from `../deadrotcom/apps/games/<slug>`.
- Warline ships from `../deadrotcom/apps/games/warline` with its runtime package
  in `../deadrotcom/packages/warline`.
- Generated game assets belong in `../deadrotcom/packages/assets`.
- Deployed studio consumers can resolve those package-relative assets through
  `NEXT_PUBLIC_ASSET_BASE_URL` / `ASSET_BASE_URL`; local web snapshots and the
  desktop Gallery keep public/local fallbacks for offline development.
- `packages/engine` is intentionally different from Deadrot-specific runtime
  packages: it is the canonical org-level source for `@shipshitgames/engine`.
  Deadrot games should depend on the package release or use a temporary local
  `bun link` bridge during cross-repo engine development.
- Studio learning material, source manifests, raw transcript sidecars, and
  distilled rules belong in `packages/ressources`.
- Package publishing starts with the dry-run `bun run release:packages`; the
  execute form only publishes already-versioned packages from a clean, synced
  `master`. Application deployment remains GitHub-Release-driven.

## Related Repos

- [`shipshitgames/deadrotcom`](https://github.com/shipshitgames/deadrotcom) -
  DEADROT hub, lore, games, assets, and runtime packages.
- [`shipshitgames/skills`](https://github.com/shipshitgames/skills) - agent
  skills used by the studio.
- [`shipshitdev/v0`](https://github.com/shipshitdev/v0) - product scaffolder
  used for new Bun/Turbo/Next workspaces.
