# Ship Shit Games — Monorepo (`shipshitgames/shipshitgames`)

The studio platform: marketing + gallery, the members portal, the desktop studio, and docs.
**Turborepo + Bun.** Part of the Ship Shit Games universe (canon in
[shipshitgames/lore](https://github.com/shipshitgames/lore)).

## Apps
- **`apps/web`** — marketing site + open-source game **gallery** (→ games.shipshit.dev)
- **`apps/app`** — members **portal** (one-time **lifetime** All Access + gated content)
- **`apps/desktop`** — the **Studio**: an Electron generator hub (maps / sprites / 3D / music + SFX)
  that drives the **Codex CLI locally** plus **fal.ai / Replicate / Suno** integrations, and the
  codegen orchestrator (shipcode-style Plan → Review → Execute → Verify → Ship)
- **`apps/docs`** — Nextra docs (engine, skills, getting started, open-core)

## Packages
- **`packages/ui`** — shared React + Tailwind + shadcn components
- **`packages/shared`** — shared types / utilities
- consumes **`@shipshit/engine`** (separate repo) for game code

## Games (separate repos, shown in the gallery)
`scourge-survivors` (FPS) · `deadlane` (TD) · `bloodlane` (MOBA, concept)

## Status
Repo initialized — apps scaffolding is tracked on the **Monorepo** project board.
Default branch `master`. Open-core (web/gallery/docs public; portal sells lifetime access).
