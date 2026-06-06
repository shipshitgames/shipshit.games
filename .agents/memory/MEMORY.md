# Ship Shit Games Studio Repo - Repo Memory

last_verified: 2026-06-06

## What this is
The studio/tooling monorepo (Turborepo + Bun), GitHub
`shipshitgames/shipshitgames`.

This repo owns the studio products and tooling used to build Deadrot:

- `apps/web` - Ship Shit Games studio/build-in-public site.
- `apps/app` - hosted members portal, auth, entitlement, premium access, and
  tool dashboard. It is the web surface that desktop should embed rather than
  fork.
- `apps/desktop` - macOS studio generator surface. It embeds the app/portal UI
  and adds local capabilities through Electron IPC: local folders, CLI/terminal
  execution, keychain, streamed logs, and generated asset previews.
- `apps/cli` - npm/npx command-line entrypoint for non-GUI workflows.
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

## Product Architecture

Planning epic: GitHub issue #108.

- `apps/app` is the hosted source of truth for account, entitlement, and the
  tools dashboard.
- `apps/desktop` should load/embed `apps/app` and expose a typed desktop bridge
  for local-only capabilities. Do not duplicate the tools dashboard in desktop
  unless it is temporary scaffolding on the way to embedding the app.
- The desktop bridge owns privileged local actions: choosing project folders,
  resolving Deadrot asset package paths, running local CLIs, streaming logs,
  storing provider keys in the macOS keychain, and previewing generated files.
- Hosted `apps/app` must degrade cleanly when the desktop bridge is absent:
  show account/content/tool state, but disable or hide local filesystem actions.
- `apps/cli` is the npm-distributed CLI. It must support `npx
  @shipshitgames/cli` and global npm/Bun installs.
- `apps/desktop` is a macOS app. It should be distributed as a signed/notarized
  DMG via Homebrew cask (`brew install --cask shipshitgames-studio`), not as an
  npm package.

## Infra
Studio web/app surfaces deploy separately from the Deadrot player-facing hub.
