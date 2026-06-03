# @shipshit/assets

Shared, game-agnostic assets plus the **canon asset catalog** for the Scourge
universe. One source of truth for what entities exist in the lore and which
assets every game shares identically.

## What lives here

- **`assets-catalog.json`** — the canon catalog. Two parts:
  - `entities` — canonical universe entities (`scourge-swarm`, `scourge-elite`,
    `breach-boss`, ...). Each entity has shared canon plus a `variants` map of
    per-game render paths (one per game slug), where a path may be `null` when a
    game has no render yet.
  - `shared` — truly game-agnostic assets used **identically** by every game:
    FX (blood / ember / muzzle), UI icons, fonts (Oswald / Inter), and audio.
- **`shared/{fx,ui,fonts,audio}/`** — the binary assets themselves (placeholder
  READMEs for now).
- **`src/index.ts`** — TypeScript types (`Asset`, `AssetCatalog`, `GameSlug`,
  `AssetKind`, ...) and the `getAsset(catalog, id, game)` resolver.

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
import { catalog, getAsset, GAME_SLUGS } from "@shipshit/assets";

// Per-game entity render (companion to issue #6):
getAsset(catalog, "scourge-swarm", "deadlane");
//   { id, kind: "entity", name, path: "entities/scourge-swarm/deadlane.png", game: "deadlane" }

// A game with no render yet -> path is null:
getAsset(catalog, "scourge-elite", "pactfall");
//   { ..., path: null, game: "pactfall" }

// A shared, game-agnostic asset (game arg is ignored):
getAsset(catalog, "fx-blood-splatter");
//   { id, kind: "fx", name, path: "shared/fx/blood-splatter.png", game: null }
```

## Distribution

Two supported ways to consume this package in a game repo:

1. **Git submodule** — vendor this directory into a game repo (the same pattern
   used for lore as `.agents/lore`), e.g. as `.agents/assets`. The game reads
   `assets-catalog.json` and the `shared/` files directly.
2. **Published npm package** — once stable, publish `@shipshit/assets` and
   import the catalog + `getAsset` resolver from it like any other dependency.

Inside this monorepo it is just a workspace package; games depend on
`@shipshit/assets` directly.

## Design canon

DOOM, not neon. Blood `#c1121f`, hellfire `#ff6a00`, gunmetal, bone; Oswald
display + Inter body. See `lore/DESIGN.md`.
