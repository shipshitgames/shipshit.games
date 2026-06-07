# @shipshitgames/assetgen

DOOM-grade asset generation for Ship Shit Games. One pipeline:
**prompt + `lore/DESIGN.md` DOOM-suffix → provider → trim/optimize `.webp` → `assets.json`.**

This is the engine behind the studio generator surfaces. It runs from the CLI
today; the desktop/app surfaces can wrap the same core later.

The Deadrot asset package lives in the sibling game repo:

```txt
../deadrotcom/packages/assets
```

`assetgen` reads/writes that package by default. Pass `--assets-dir <path>` to
target a different asset package.

## Use

```bash
# Real generation (bring your own key):
OPENAI_API_KEY=sk-... bun packages/assetgen/src/cli.ts \
  generate --id swarm-husk --game scourge-survivors --kind sprite \
  --prompt "a rotting bio-husk of the Scourge, lunging" \
  --repo ../deadrotcom/apps/games/scourge-survivors

# Back-compat default: omitting `generate` still runs single-asset generation.
bun packages/assetgen/src/cli.ts --provider mock --dry-run --id test --prompt "x"

# Or use your authed Codex CLI as the generator. This path spawns Codex through
# node-pty, streams its output, then verifies that Codex wrote the requested PNG
# before the normal webp + assets.json post-process runs:
bun packages/assetgen/src/cli.ts generate --provider codex --id ... --prompt "..." --repo ...

# Pipeline dry-run (no key, placeholder image):
bun packages/assetgen/src/cli.ts generate --provider mock --dry-run --id test --prompt "x"
```

## The variant matrix (issue #6)

`assetgen matrix` generates the **per-game sprite variant matrix** from the canon
roster in Deadrot's `@shipshitgames/assets` package. It expands every `(entity × intended
game)` cell, builds a per-game prompt (`promptBase` + game framing + DOOM suffix),
generates, writes the render into the assets package at
`entities/<id>/<game>.webp`, and records the path back into the catalog's
`variants`. Swap the provider to fill the identical paths with real art.

```bash
# Whole matrix, placeholder fills (no keys) — proves the pipeline + populates paths:
bun packages/assetgen/src/cli.ts matrix --provider mock

# Real art (codex rides your subscription; no key wiring):
bun packages/assetgen/src/cli.ts matrix --provider codex

# Scope it: one row / one column / only-missing are composable + idempotent:
bun packages/assetgen/src/cli.ts matrix --id scourge-swarm
bun packages/assetgen/src/cli.ts matrix --game pactfall --only-missing

# Legacy only: optionally fan a reference into local game manifests too.
# Deadrot games should prefer the shared package asset manifest.
bun packages/assetgen/src/cli.ts matrix --provider mock --sync-games
```

Flags: `--provider` (default `mock` — safe to batch), `--game`, `--id`,
`--only-missing` (skip cells already rendered on disk), `--size`, `--dry-run`
(force mock), `--sync-games`, `--assets-dir`.

## Providers
- `openai` — **gpt-image-2** (default; `--model` to override), transparent PNG
- `fal` — FLUX
- `codex` — delegates to the local authed `codex` CLI via node-pty (no key wiring needed)
- `mock` — offline placeholder for testing the pipeline

## Keys (shipcode-style)
No raw env vars required. Keys resolve from the **macOS keychain** first (env var as
fallback). Store one with:

```bash
security add-generic-password -a shipshit -s shipshit-openai -w <OPENAI_KEY>
security add-generic-password -a shipshit -s shipshit-fal    -w <FAL_KEY>
```

The `codex` provider rides codex's own keychain auth — nothing to store.

## Style
Every prompt is suffixed with the DOOM canon from `lore/DESIGN.md` and framed per game.
All six games are covered: scourge-survivors (FPS billboard) / deadlane (TD top-down) /
pactfall (MOBA iso) / starblight (arcade) / redline (runner side-on) / rothulk
(platformer side-on), plus `shared`. Output is trimmed, optionally sized, encoded to
`.webp`. Single-asset mode can upsert into a target game's local
`src/assets/assets.json` when `--repo` is provided; Deadrot games should prefer
the shared package manifest. Matrix mode writes into the Deadrot
`@shipshitgames/assets` package.

> TODO (board): background-removal step (rembg) for non-transparent providers; wire the
> matrix mode into the Electron studio UI.
