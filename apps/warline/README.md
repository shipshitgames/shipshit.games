# Warline — War for the Lanes

The persistent OGame/Foxhole-style strategy hub that links every Ship Shit Game.
One shared planet front (regions / lanes / breaches); three factions — **Pyre** and
**Wardens** under **The Pact** vs the **Scourge** — four resources, and a
build / raise-army loop. Each mini-game is an **operation** that credits the shared war.

This is the **web hub** (`apps/warline`): a Vite + React 19 + Tailwind v4 app. It renders
the living front, lets you issue build/deploy commands, and demos the game→operation loop.
The pure simulation lives in the `@shipshitgames/warline` package; the authoritative server is
the PartyKit Durable Object in `party/warline.ts`.

## Dual runtime — LIVE vs LOCAL

The hub is fully playable with **no backend deployed**. The store (`src/store.ts`) tries to
connect to a PartyKit server via `connectWarline`:

- **LIVE** — a socket opened: the hub mirrors authoritative server state, and
  `command()` / `simulate()` are sent over the wire.
- **LOCAL** — no `VITE_WARLINE_HOST` (and not dev), or the socket never opened in time:
  the hub seeds `createInitialWorld(Date.now())`, runs `tick()` every `TICK_MS` via
  `setInterval`, and applies `applyCommand` / `applyOperation` in the browser. Great for the
  Vercel-only demo.

Status is shown as a pill in the header (`LIVE` / `LOCAL` / `CONNECTING`).

## Run

```bash
bun run dev        # web hub only (Vite, port 5174) — LOCAL mode by default
bun run dev:all    # web hub + PartyKit server together (LIVE mode)
bun run build      # tsc + vite build
bun run preview    # preview the production build
```

`dev:all` runs `vite` and `partykit dev` concurrently. The PartyKit server is owned by
`party/warline.ts` + `partykit.json`.

## Environment

| var | where | meaning |
|-----|-------|---------|
| `VITE_WARLINE_HOST` | web build | PartyKit host, e.g. `warline.<user>.partykit.dev`. Empty ⇒ LOCAL mode. In dev it defaults to `localhost:1999`. |
| `WARLINE_TOKEN` | server | bearer token games must present to `POST {type:'report'}`. |
| `WARLINE_ADMIN_TOKEN` | server | bearer token required to reset the world. |

## Game → operation contract

Every game reports exactly one operation kind (`@shipshitgames/warline` `GAME_OPERATIONS`):

| game | operation | effect on the front | primary credits |
|------|-----------|---------------------|-----------------|
| scourge-survivors | Purge a Breach | burns down the hottest active breach, cools its region; can seal it | biomass, intel |
| deadlane | Hold the Lane | chokes a Scourge supply lane, fortifies its human endpoints | scrap, fuel |
| pactfall | Contest Territory | seizes a contested neutral region for the Pact | intel |
| starblight | Orbital Intercept | bleeds every active breach and the worst region | fuel, intel |
| redline | Run Logistics | pushes convoys to muster the Pact war effort | scrap, fuel |
| rothulk | Sabotage a Breach | cripples the hottest breach and hardens its region | biomass |

## Commands (open shared-front actions)

Costs come from `COMMAND_COSTS`; buttons disable when `!canAfford`:

- **Fortify** (region, held) — `+defense`, `−pressure`.
- **Muster** — `+army strength`.
- **Deploy** (region) — `−pressure`; recaptures a weakened Scourge region or claims a neutral one.
- **Recon** (region) — reveals an unknown sector.

## Deploy

- Web hub: deploys as a static Vite build (`base: './'` so it works under
  `games.shipshit.dev/warline/` as well as standalone). Set `VITE_WARLINE_HOST` to point at
  the deployed PartyKit server for LIVE mode.
- Server: `bun run party:deploy` (PartyKit). Configure `WARLINE_TOKEN` /
  `WARLINE_ADMIN_TOKEN` as PartyKit secrets.

## Design

DOOM visual identity (see `/DESIGN.md`): void/coal/iron/gunmetal surfaces, blood/hellfire CTAs,
bone uppercase Oswald headings, ember glow used sparingly, hard 2px corners. Toxic-green is
reserved for the Scourge (region fill, pulsing breach markers).
