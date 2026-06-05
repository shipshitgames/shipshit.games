# Ship Shit Games (`shipshitgames/shipshitgames`)

The **studio** side: the build-in-public site that sells the playbook (newsletter, course,
templates, sponsorships), the members portal, and the desktop studio. **Turborepo + Bun.**
The player-facing **game hub** ([DEADROT](https://deadrot.com)) now lives in the
[shipshitgames/deadrotcom](https://github.com/shipshitgames/deadrotcom) repo; canon in
[shipshitgames/lore](https://github.com/shipshitgames/lore).

## Apps
- **`apps/web`** — **shipshitgames.com**: the lessons / build-in-public site — newsletter,
  course, templates &amp; tooling, sponsorships. (The universe gallery moved to the deadrotcom
  hub.)
- **`apps/warline`** — **Warline**, the persistent *War for the Lanes* strategy hub (EPIC #34): a
  Vite/React front map over a PartyKit Durable Object. Every game is an **operation** that credits
  one shared front. Runs standalone (local sim) or live (shared server). Hosted at
  games.shipshit.dev/warline/
- **`apps/app`** — members **portal** (one-time **lifetime** All Access + gated content)
- **`apps/desktop`** — the **Studio**: an Electron generator hub (maps / sprites / 3D / music + SFX)
  that drives the **Codex CLI locally** plus **fal.ai / Replicate / Suno** integrations, and the
  codegen orchestrator (shipcode-style Plan → Review → Execute → Verify → Ship)
## Packages
- **`packages/ui`** — shared React + Tailwind + shadcn components
- **`packages/shared`** — shared types / utilities
- **`packages/warline`** — `@shipshitgames/warline`: the pure world-state model + reducers + per-game
  operation contract + client SDK shared by the Warline server, hub, and (eventually) each game
- consumes **`@shipshitgames/engine`** (separate repo) for game code

## Games &amp; hub
The games and the player-facing **hub** live in the **deadrotcom** repo (→ deadrot.com).
Local game repos currently sit under `../games/<slug>`; they move into `deadrotcom/apps/*`
as they are consolidated.

`scourge-survivors` (FPS) · `deadlane` (TD) · `pactfall` (MOBA, concept) · `starblight` (arcade shooter, concept)

## Status
Default branch `master`. Open-core. `apps/web` repositioned to the studio/lessons site; the
universe gallery + game loader moved to [deadrotcom](https://github.com/shipshitgames/deadrotcom).
