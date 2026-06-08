# Ship Shit Games Studio Repo - Repo Memory

last_verified: 2026-06-08

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
- `packages/engine` / `@shipshitgames/engine` - the canonical org-level
  reusable game engine package. It stays in this repo because the package is for
  Ship Shit Games as a platform, not only the Deadrot IP.
- Studio-only shared packages such as research, shared utilities, and studio UI.

## Repo Boundary
This repo does not own shipped Deadrot games, Deadrot-specific runtime assets,
audio, soundtrack, generated source archives, or Deadrot-specific runtime
packages consumed by games.

Exception: `packages/engine` is intentionally owned here as
`@shipshitgames/engine`. Deadrot games should consume that canonical org-level
engine through an explicit published/local-link/workspace bridge, not own a
divergent `@deadrot/engine` fork.

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
package is Deadrot-specific runtime data, content, or assets, it belongs in
`../deadrotcom/packages`, especially `../deadrotcom/packages/assets`.

## Conventions
The generator/tooling product lives in `shipshitgames`; generated outputs ship
from `deadrotcom`. Do not treat Deadrot-specific runtime package copies in this
repo as the Deadrot shipping source of truth unless the user explicitly says
otherwise. Do treat `@shipshitgames/engine` as a studio/org package that can be
reused by Deadrot and future IPs.

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
