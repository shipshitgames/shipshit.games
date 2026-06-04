# @shipshitgames/assets

Shared, game-agnostic assets plus the **canon asset catalog** for the Scourge
universe. One source of truth for what entities exist in the lore and which
assets every game shares identically.

## What lives here

- **`assets-catalog.json`** — the canon catalog (schema: `assets-catalog.schema.json`).
  Two parts:
  - `entities` — the canonical roster (22 entities) pulled from the lore vault:
    the Scourge bestiary (`scourge-swarm`, `scourge-spitter`, `scourge-elite`,
    `graft-breacher`, `rot-engine`, `breach-boss`, `trucebreaker`,
    `scourge-fighter`, `orbital-breach-carrier`) and the human factions
    (`pyre-*`, `warden-*`). Each entity carries its `faction`, Scourge
    `hostFamily` (or `null`), one-line `canon`, a generation `promptBase`, the
    `games` it renders in (**the matrix row**), and a `variants` map of per-game
    render paths (`null` until rendered).
  - `shared` — truly game-agnostic assets used **identically** by every game:
    FX (blood / ember / muzzle / breach-glow), UI icons (Pyre / Warden / Scourge
    / breach / lane), fonts (Oswald / Inter), and audio.
- **`entities/<id>/<game>.webp`** — the per-game entity renders, produced by the
  variant-matrix generator (see below). This is what makes the catalog's
  `variants` paths resolve.
- **`shared/{fx,ui,fonts,audio}/`** — the game-agnostic binary assets.
- **`src/index.ts`** — TypeScript types (`Asset`, `AssetCatalog`, `EntityAsset`,
  `Faction`, `HostFamily`, `GameSlug`, ...), the `getAsset(catalog, id, game)`
  resolver, and matrix helpers (`gamesFor`, `renderedGames`, `pendingGames`,
  `matrixRows`).

## The variant matrix (issue #6)

Each entity is **one canon id** rendered per game. `entity.games` declares which
games render it (the matrix's intent); `entity.variants[game]` holds the actual
render path once produced. The renders are generated from the single roster by
[`@shipshitgames/assetgen`](../assetgen):

```bash
# Populate the whole matrix with placeholders (no API keys):
bun packages/assetgen/src/cli.ts matrix --provider mock

# Real art into the identical paths (swap the provider; codex needs no key):
bun packages/assetgen/src/cli.ts matrix --provider codex

# One row or one column, only what's missing:
bun packages/assetgen/src/cli.ts matrix --id scourge-swarm --only-missing
bun packages/assetgen/src/cli.ts matrix --game deadlane
```

Inspect coverage in code with `matrixRows(catalog)` — per entity, which games are
`intended` vs already `rendered`.

## The rule: entities are per-game renders

> **ENTITY sprites are per-game RENDERS** — shared canon, per-game variants.
> This package is the companion to issue #6.

A monster like the Scourge Swarm is **one canon entity** in the lore, but each
game renders it in its own style and resolution. So the catalog stores the canon
once and a `variants` path per game. `getAsset(catalog, id, game)` returns the
requested game's variant; if you ask for an entity without a `game`, you get the
canon record with a `null` path (there is no single "shared" sprite for an
entity by design).

Only **truly game-agnostic** assets (FX, UI, fonts, shared audio) live in
`shared/` and resolve the same for every game.

## Usage

```ts
import { catalog, getAsset, GAME_SLUGS } from "@shipshitgames/assets";

// Per-game entity render (companion to issue #6):
getAsset(catalog, "scourge-swarm", "deadlane");
//   { id, kind: "entity", name, path: "entities/scourge-swarm/deadlane.webp", game: "deadlane" }

// A game the entity does not render in -> path is null:
getAsset(catalog, "scourge-swarm", "starblight");
//   { ..., path: null, game: "starblight" }

// A shared, game-agnostic asset (game arg is ignored):
getAsset(catalog, "fx-blood-splatter");
//   { id, kind: "fx", name, path: "shared/fx/blood-splatter.png", game: null }
```

## Distribution

Two supported ways to consume this package in a game repo:

1. **Git submodule** — vendor this directory into a game repo (the same pattern
   used for lore as `.agents/lore`), e.g. as `.agents/assets`. The game reads
   `assets-catalog.json` and the `shared/` files directly.
2. **Published npm package** — once stable, publish `@shipshitgames/assets` and
   import the catalog + `getAsset` resolver from it like any other dependency.

Inside this monorepo it is just a workspace package; games depend on
`@shipshitgames/assets` directly.

## Design canon

DOOM, not neon. Blood `#c1121f`, hellfire `#ff6a00`, gunmetal, bone; Oswald
display + Inter body. See `lore/DESIGN.md`.
