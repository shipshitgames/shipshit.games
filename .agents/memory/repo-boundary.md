# Repo Boundary

last_verified: 2026-06-05

`shipshitgames` is the studio/tooling repo.

## Owns

- Studio web/app/desktop product surfaces.
- Future CLI surfaces for studio tooling.
- `packages/assetgen` and related reusable asset generation logic.
- The assetgen CLI product, which should ship quickly and be dogfooded against
  Deadrot.
- Studio-only research, shared utilities, and UI.

## Does Not Own

- Shipped Deadrot games.
- Canonical Deadrot runtime assets.
- Deadrot runtime audio, soundtrack, sprites, textures, fonts, or UI art.
- Runtime packages imported by shipped Deadrot games.

Those belong in the sibling `../deadrotcom` repo.

## Rule

If it builds/generates/edits assets as tooling, it belongs here. If it ships to
players or is imported by shipped Deadrot games, it belongs in `../deadrotcom`.

Do not move `packages/assetgen` into `../deadrotcom`; configure it to read/write
`../deadrotcom/packages/assets` instead.
