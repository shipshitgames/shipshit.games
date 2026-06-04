# Ship Shit Games (`shipshitgames/shipshitgames`)

The studio platform: marketing + gallery, the members portal, the desktop studio, and docs.
**Turborepo + Bun.** Part of the Ship Shit Games universe (canon in
[shipshitgames/lore](https://github.com/shipshitgames/lore)).

## Apps
- **`apps/web`** — marketing site + open-source game **gallery** (→ games.shipshit.dev)
- **`apps/warline`** — **Warline**, the persistent *War for the Lanes* strategy hub (EPIC #34): a
  Vite/React front map over a PartyKit Durable Object. Every game is an **operation** that credits
  one shared front. Runs standalone (local sim) or live (shared server). Hosted at
  games.shipshit.dev/warline/
- **`apps/app`** — members **portal** (one-time **lifetime** All Access + gated content)
- **`apps/desktop`** — the **Studio**: an Electron generator hub (maps / sprites / 3D / music + SFX)
  that drives the **Codex CLI locally** plus **fal.ai / Replicate / Suno** integrations, and the
  codegen orchestrator (shipcode-style Plan → Review → Execute → Verify → Ship)
- **`apps/docs`** — Nextra docs (engine, skills, getting started, open-core)

## Packages
- **`packages/ui`** — shared React + Tailwind + shadcn components
- **`packages/shared`** — shared types / utilities
- **`packages/warline`** — `@shipshitgames/warline`: the pure world-state model + reducers + per-game
  operation contract + client SDK shared by the Warline server, hub, and (eventually) each game
- consumes **`@shipshitgames/engine`** (separate repo) for game code

## Games
Local game repos live under `../games/<slug>` by default.

`scourge-survivors` (FPS) · `deadlane` (TD) · `pactfall` (MOBA, concept) · `starblight` (arcade shooter, concept)

## Status
Repo initialized — apps scaffolding is tracked on the **Ship Shit Games** project board.
Default branch `master`. Open-core (web/gallery/docs public; portal sells lifetime access).
