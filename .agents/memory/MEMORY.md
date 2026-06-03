# Ship Shit Games Monorepo — Repo Memory

last_verified: 2026-06-03

## What this is
The studio platform monorepo (Turborepo + Bun), GitHub `shipshitgames/shipshitgames`:
- `apps/web` — marketing + open-source gallery (games.shipshit.dev)
- `apps/app` — members portal (one-time LIFETIME All Access + gated content)
- `apps/desktop` — the Studio (generator hub + codegen cockpit)
- `apps/docs` — Nextra docs
- `packages/ui`, `packages/shared`
Modeled on shipshitdev/shipcode (Electron + Vite + React + a Plan→Review→Execute→Verify→Ship pipeline).

## Desktop Studio (apps/desktop)
Electron + node-pty + xterm.js. Generators: maps, sprite/2D, 3D-model, music + SFX. Asset
generation drives the **local Codex CLI** plus **fal.ai / Replicate / Suno** API integrations
(bring-your-own-key), and a codegen orchestrator per game repo. Everything writes into each
game's `assets.json`.

## Conventions
Imperative Three.js games consume `@shipshit/engine`; UI in React/Tailwind/shadcn; general dev
skills come from `shipshitdev/skills`; canon from `shipshitgames/lore`.

## Infra
Web/gallery + games on Vercel. Multiplayer on PartyKit (Cloudflare). AWS only enters later for
the persistent "War for the Lanes" / Dofus-like server + asset storage/CDN.
