# Ship Shit Games

![Ship Shit Games wordmark](apps/web/public/brand/shipshit-games-wordmark.png)

**The studio monorepo for building games with AI in public.**

[shipshit.games](https://shipshit.games) |
[deadrot.com](https://deadrot.com)

## Current Stage

This repo is the studio side of Ship Shit Games: the public site, docs, CLI,
desktop studio, asset-generation tooling, ressources library, and shared packages
used to build and explain the DEADROT pipeline.

The player-facing DEADROT hub, lore app, games, runtime assets, and shipped game
packages now live in
[`shipshitgames/deadrotcom`](https://github.com/shipshitgames/deadrotcom).

## Apps

- `apps/web` - live Next 16 studio site for Skills Pro, DEADROT proof, the asset
  pipeline, pricing, and public calls to action.
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
- `packages/ui` / `@shipshitgames/ui` - shared React UI primitives, Tailwind
  styles, and game-flavored component shells.

## Repo Map

```txt
apps/
  web/       # shipshit.games
  docs/      # docs.shipshit.games
  cli/       # shipshitgames / ssg binary
  desktop/   # Electron studio
packages/
  assetgen/
  engine/
  ressources/
  shared/
  ui/
scripts/
```

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
- Release automation starts at `bun run release`; use `bun run release:run` to
  execute the planned release.

## Related Repos

- [`shipshitgames/deadrotcom`](https://github.com/shipshitgames/deadrotcom) -
  DEADROT hub, lore, games, assets, and runtime packages.
- [`shipshitgames/skills`](https://github.com/shipshitgames/skills) - agent
  skills used by the studio.
- [`shipshitdev/v0`](https://github.com/shipshitdev/v0) - product scaffolder
  used for new Bun/Turbo/Next workspaces.
