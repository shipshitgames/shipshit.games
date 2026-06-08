# Repo Boundary

last_verified: 2026-06-08

`shipshitgames` is the studio/tooling repo.

## Owns

- Studio web/app/desktop product surfaces.
- Future CLI surfaces for studio tooling.
- `packages/assetgen` and related reusable asset generation logic.
- The assetgen CLI product, which should ship quickly and be dogfooded against
  Deadrot.
- `packages/engine` / `@shipshitgames/engine`, the canonical org-level game
  engine package for Ship Shit Games IPs.
- Studio-only research, shared utilities, and UI.

## Does Not Own

- Shipped Deadrot games.
- Canonical Deadrot runtime assets.
- Deadrot runtime audio, soundtrack, sprites, textures, fonts, or UI art.
- Deadrot-specific runtime packages imported by shipped Deadrot games.

Those belong in the sibling `../deadrotcom` repo.

## Rule

If it builds/generates/edits assets as tooling, it belongs here. If it ships to
players or is Deadrot-specific runtime data/assets, it belongs in
`../deadrotcom`.

Do not move `packages/assetgen` into `../deadrotcom`; configure it to read/write
`../deadrotcom/packages/assets` instead.

Do not move or rename `@shipshitgames/engine` to `@deadrot/engine`. Deadrot
games should consume the canonical org-level engine from this repo through a
documented package/link workflow. Do not create a separate engine repo or board
until the engine has an independent release cadence or multiple active IP
consumers that justify the split.
