# Ship Shit Games Studio Repo - Repo Memory

last_verified: 2026-06-05

## What this is
The studio/tooling monorepo (Turborepo + Bun), GitHub
`shipshitgames/shipshitgames`.

This repo owns the studio products and tooling used to build Deadrot:

- `apps/web` - Ship Shit Games studio/build-in-public site.
- `apps/app` - members portal.
- `apps/desktop` - studio generator surface.
- Future `apps/cli` or equivalent CLI surfaces for the same tooling product.
- `packages/assetgen` - reusable asset generation core and CLI entrypoint.
  This stays here so the studio can ship a CLI ASAP and dogfood it against
  Deadrot.
- Studio-only shared packages such as research, shared utilities, and studio UI.

## Repo Boundary
This repo does not own shipped Deadrot games, runtime assets, audio,
soundtrack, generated source archives, or canonical runtime packages consumed by
games.

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
package is imported by shipped Deadrot games at runtime, it belongs in
`../deadrotcom/packages`.

## Conventions
The generator/tooling product lives in `shipshitgames`; generated outputs ship
from `deadrotcom`. Do not treat runtime package copies in this repo as the
Deadrot shipping source of truth unless the user explicitly says otherwise.

Deadrot canon lives in the sibling repo at `../deadrotcom/apps/lore/content`,
which is the Obsidian vault root.

## Infra
Studio web/app surfaces deploy separately from the Deadrot player-facing hub.
