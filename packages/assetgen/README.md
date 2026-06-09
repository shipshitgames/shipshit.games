# @shipshitgames/assetgen

DOOM-grade asset generation for Ship Shit Games. One enforced pipeline:
**prompt + `lore/DESIGN.md` DOOM-suffix → provider → post-process/optimize → `assets.json` with license provenance → hot preview.**

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

# Multi-view or animation sprite sheets:
bun packages/assetgen/src/cli.ts generate --provider mock --dry-run \
  --id swarm-husk-run --game scourge-survivors --kind sprite \
  --prompt "a parasite-taken Scourge host sprint cycle" \
  --views front,side,back --frames 4 --fps 12 --scale 1.5 \
  --license "internal prototype; review before shipping"
```

## Shared pipeline contract

All asset generators should call the shared `runAssetPipeline` core instead of
writing files directly. It enforces the five game-asset-pipeline stages:

```txt
prompt -> generate -> postprocess -> register -> preview
```

The `register` stage writes the optimized asset and upserts `src/assets/assets.json`.
Every new manifest entry must include a `license` record with `tool`, `plan`,
`date`, and `kind`. This keeps provider/model provenance reviewable for Codex,
OpenAI, fal, Replicate, Suno-compatible audio, ffmpeg transcodes, and mock runs.

Omitting `--provider` uses the per-kind default: sprites/maps use `codex`,
textures/icons use `openai`, audio kinds use `suno`, and model/3D assets use
`replicate`. Pass `--provider` to override a single run.

Sprite generation post-processes the provider image into a power-of-two
transparent `.webp`, pads uneven view/frame counts into stable sheet cells,
auto-fills `dimensions`, `frameSize`, `frames`, `fps`, `anchor`, `scale`,
`views`, `sheet`, and `license` fields in `assets.json`, and writes a
`previews/<id>-billboard.html` file for the desktop billboard preview.

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

# Bootstrap the external @shipshitgames/assets package if the Deadrot sibling
# checkout does not have its catalog yet:
bun packages/assetgen/src/cli.ts matrix --init-catalog --provider mock --id scourge-swarm

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
(force mock), `--sync-games`, `--assets-dir`, `--init-catalog`.

## `index` — asset indexer (issue #101)

`assetgen index` scans an asset package and writes a deterministic, reviewable
`assets.index.json` — the canonical map of what art exists. Every asset is
tagged with its **game**, so you can index everything at once or one game at a
time.

```bash
# Index the whole Deadrot asset package (default --assets-dir):
bun packages/assetgen/src/cli.ts index

# One game only -> writes assets.index.<game>.json:
bun packages/assetgen/src/cli.ts index --game scourge-survivors

# Treat images as fixed-size sprite sheets (records frame grid + blank frames):
bun packages/assetgen/src/cli.ts index --frame-size 64x64

# Fail (exit 1) if the on-disk index is stale — for CI / pre-commit:
bun packages/assetgen/src/cli.ts index --check
```

Flags: `--assets-dir` (default `../deadrotcom/packages/assets`), `--game <slug>`,
`--frame-size <WxH>`, `--out <path>`, `--check`.

Each entry records, for **2D images**: dimensions, format, alpha, byte size,
`blank` (uniform/transparent), and — with `--frame-size` — sprite-sheet
`frames`/`cols`/`rows` plus the indices of blank frames. For **3D models**
(`.glb`/`.gltf`): mesh/material/texture/skin counts, total joints, and each
animation clip's name, duration, and channel count. Entries carry `game`,
`group`, `id`, and `inCatalog`, and the file opens with a per-game rollup.

**Agents:** treat `assets.index.json` as the source of truth for which assets
exist per game, their sizes, and which read as blank — don't re-scan the tree.

## Design tokens

`assetgen tokens` compiles the reviewed `DESIGN.md` frontmatter into generated
artifacts for app CSS, imperative game code, and asset-generation prompts:

```bash
bun packages/assetgen/src/cli.ts tokens
bun packages/assetgen/src/cli.ts tokens --check
```

Outputs are bannered with the source version and content hash:

- `packages/assetgen/src/style.generated.ts`
- `packages/assets/tokens/theme.css`
- `packages/assets/tokens/tokens.css`
- `packages/assets/tokens/tokens.ts`
- `packages/assets/tokens/tokens.json`

Pass `--design <path>` to test another design source, or `--assets-dir <path>`
to emit the token package somewhere else. The command does not require a
Deadrot `assets-catalog.json`; it only writes design token artifacts.

## Token drift gate

`assetgen tokens` compiles the reviewed `DESIGN.md` front matter into generated
style/token artifacts. `--check` regenerates those artifacts into a temp tree,
diffs them against the committed files, and fails on drift, including generated
token body changes where the banner version/hash did not change.

```bash
# Repo CI path: checks packages/assetgen/src/style.generated.ts only.
bun packages/assetgen/src/cli.ts tokens --check --repo-only

# Full local path when the Deadrot assets package is checked out.
bun packages/assetgen/src/cli.ts tokens --check --assets-dir ../deadrotcom/packages/assets

# Regenerate committed artifacts.
bun packages/assetgen/src/cli.ts tokens --assets-dir ../deadrotcom/packages/assets
```

## Providers
- `codex` — delegates to the local authed `codex` CLI via node-pty (no key wiring needed)
- `openai` — **gpt-image-2** (`--model` to override), transparent PNG
- `fal` — FLUX
- `replicate` — model runner for image/model providers (`--model owner/model`)
- `suno` — audio provider adapter; requires `SUNO_API_BASE_URL` for the licensed endpoint
- `mock` — offline placeholder for testing the pipeline

## Keys (shipcode-style)
No raw env vars required. Keys resolve from the **macOS keychain** first (env var as
fallback). Store one with:

```bash
security add-generic-password -a shipshit -s shipshit-openai -w <OPENAI_KEY>
security add-generic-password -a shipshit -s shipshit-fal    -w <FAL_KEY>
security add-generic-password -a shipshit -s shipshit-replicate -w <REPLICATE_API_TOKEN>
security add-generic-password -a shipshit -s shipshit-suno -w <SUNO_API_KEY>
```

The `codex` provider rides codex's own keychain auth — nothing to store.

## Usage log

Every provider call appends a local JSONL event to:

```txt
~/.shipshitgames/assetgen/usage.jsonl
```

The log stores provider, kind, model, id, output path, duration, and success/failure.
It stores a prompt hash and character count, not raw prompt text. Override the path
with `--usage-log <path>` or disable with `--usage-log off`.

## Style
Every prompt is suffixed with the DOOM canon from `lore/DESIGN.md` and framed per game.
All six games are covered: scourge-survivors (FPS billboard) / deadlane (TD top-down) /
pactfall (MOBA iso) / starblight (arcade) / redline (runner side-on) / rothulk
(platformer side-on), plus `shared`. Output is trimmed, optionally sized, encoded to
`.webp`. Single-asset mode can upsert into a target game's local
`src/assets/assets.json` when `--repo` is provided; Deadrot games should prefer
the shared package manifest. Matrix mode writes into the Deadrot
`@shipshitgames/assets` package.

## Tokens

`assetgen tokens` compiles the canonical `DESIGN.md` frontmatter into generated
token artifacts for the selected assets package:

```bash
bun packages/assetgen/src/cli.ts tokens --assets-dir ../deadrotcom/packages/assets
```

The command emits `tokens/theme.css`, `tokens/tokens.css`,
`tokens/fonts.css`, `tokens/tokens.ts`, and `tokens/tokens.json`.
Font delivery is decided once by the generator: `fonts.css` imports the required
Google Fonts families for the design tokens and leaves system stacks as system
fonts. `tokens.json` records the required display, body, and mono families so
apps do not make per-surface font decisions.

> TODO (board): background-removal step (rembg) for non-transparent providers; wire the
> matrix mode into the Electron studio UI.
