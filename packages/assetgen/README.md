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

The product roadmap for provider-backed generation, self-hosted/open model
adapters, and Unreal/Unity export targets lives in
[`docs/asset-generation-roadmap.md`](../../docs/asset-generation-roadmap.md).

## `asset-qa` — declarative image validation and repair

Product repositories can declare transparent-margin, border, fringe/luma,
dimensions, and lossless/lossy WebP requirements in an `asset-qa.json`
manifest. The check action is deterministic and strictly read-only; mutation is
available only through the explicit repair action.

```bash
bun packages/assetgen/src/cli.ts asset-qa check --manifest <product>/asset-qa.json
bun packages/assetgen/src/cli.ts asset-qa repair --manifest <product>/asset-qa.json
```

The reusable primitives, manifest schema, integration guarantees, and precise
Deadrot July-script migration map are documented in
[`ASSET-QA.md`](./ASSET-QA.md).

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

# Source/reference-guided generation. Put the prompt before `-i`; `-i` may take
# multiple images and is forwarded to Codex after the prompt so it cannot eat it.
bun packages/assetgen/src/cli.ts generate --provider codex \
  --id pyre-sidearm --kind sprite --prompt "Pyre sidearm pickup" \
  --repo ../deadrotcom/apps/games/scourge-survivors \
  -i refs/style.png refs/validated-source.png

# Pipeline dry-run (no key, placeholder image):
bun packages/assetgen/src/cli.ts generate --provider mock --dry-run --id test --prompt "x"

# Multi-view or animation sprite sheets:
bun packages/assetgen/src/cli.ts generate --provider mock --dry-run \
  --id swarm-husk-run --game scourge-survivors --kind sprite \
  --prompt "a parasite-taken Scourge host sprint cycle" \
  --views front,side,back --frames 4 --fps 12 --scale 1.5 \
  --license "internal prototype; review before shipping"
```

## `muzzle-tuner` — studio-side weapon flash placement

Deadrot should ship games, not asset tooling. Use `assetgen muzzle-tuner` from
this repo to tune Scourge Survivors weapon muzzle metadata against the running
dev game, then write the exact manifest values back to the Deadrot asset pack.

```bash
# Print the injectable browser-console tuner for a running Scourge dev page:
bun packages/assetgen/src/cli.ts muzzle-tuner --script

# Inspect current metadata:
bun packages/assetgen/src/cli.ts muzzle-tuner --weapon shotgun --json

# Write values copied from the tuner panel:
bun packages/assetgen/src/cli.ts muzzle-tuner \
  --weapon shotgun --muzzle -0.12,0.26,-0.18 --flash-scale 0.24 --write
```

Flags: `--assets-dir <deadrot/packages/assets>`, `--manifest <assets.json>`,
`--game <slug>` (default `scourge-survivors`), `--weapon <id>`, `--muzzle x,y,z`,
`--flash-scale <n>`, `--write`, `--json`, `--script`.

## Shared pipeline contract

All asset generators should call the shared `runAssetPipeline` core instead of
writing files directly. It enforces the five game-asset-pipeline stages:

```txt
prompt -> generate -> postprocess -> register -> preview
```

The `register` stage writes the optimized asset and upserts `src/assets/assets.json`.
Every new manifest entry must include a `license` record with `tool`, `plan`,
`date`, and `kind`. This keeps provider/model provenance reviewable for Codex,
OpenAI, fal, Replicate, Meshy, Tripo, Suno-compatible audio, ElevenLabs,
Beatoven, ffmpeg transcodes, and mock runs.

Omitting `--provider` uses the per-kind default: sprites/maps use `codex`,
textures/icons use `openai`, audio kinds use `suno`, and model/3D assets use
`meshy`. Pass `--provider` to override a single run.

Sprite generation post-processes the provider image into a power-of-two
transparent `.webp`, pads uneven view/frame counts into stable sheet cells,
auto-fills `dimensions`, `frameSize`, `frames`, `fps`, `anchor`, `scale`,
`views`, `sheet`, and `license` fields in `assets.json`, and writes a
`previews/<id>-billboard.html` file for the desktop billboard preview.

## Model workflow

The explicit model CLI wraps the same provider, optimization, provenance, and
manifest primitives as `generate --kind model`:

```bash
# Provider-backed generation stages a reviewable draft by default.
bun packages/assetgen/src/cli.ts model generate \
  --id breach-golem --prompt "a parasite-taken siege golem" \
  --provider mock --repo ./games/example

# Imported/provider GLB: preserve the source, optimize the runtime copy, and
# write a hash-addressed trace report beside it.
bun packages/assetgen/src/cli.ts model optimize \
  --in ./sources/breach-golem.glb --out ./build/breach-golem.glb

# Registration verifies the runtime GLB and raw source against that report,
# copies the optimized model into src/assets/models, and records license state.
bun packages/assetgen/src/cli.ts model register \
  --in ./build/breach-golem.glb --id breach-golem \
  --provider tripo --model v2.5 --license "commercial plan; reviewed" \
  --license-type ai-generated --rig tripo \
  --repo ./games/example

# Emit a review target. GLB/GLTF inputs get a browser viewer; images, audio,
# and export packs emit their direct file target. Add --open to launch it.
bun packages/assetgen/src/cli.ts preview --in ./build/breach-golem.glb
```

Pass `model generate --publish` only when the generated model should bypass the
draft review lane. `model optimize --report <path>` and `model register --report
<path>` override the default `<runtime.glb>.optimize.json` trace location.
Registration preserves the raw GLB and normalized trace report under
`src/assets/sources/models` alongside the optimized runtime model. The source
directory is excluded from runtime asset indexes. Imported models only receive
AI disclosure or prompt provenance when explicitly supplied. Generated models
derive rig provenance from their provider; `--rig <source>` is reserved for
`model register`, where an imported model's retarget source can be supplied.

## Draft & promote (issue #54)

By default `generate` writes straight into `src/assets/assets.json`. Pass
`--draft` to **stage** the asset for review instead: the whole asset tree (the
optimized asset, any sprite billboard/frame-map sidecars, and a `drafts.json`
manifest) is written under `src/assets/drafts/` and the production manifest is
left untouched. `assetgen promote` then publishes a staged draft — it moves the
files into the assets root, registers the entry in `assets.json`, and prunes it
from `drafts.json`.

The staging tree mirrors the production layout exactly, so a draft's relative
paths are already its post-promote paths — promotion is a move, never a rewrite,
and preview/anim sidecar links survive untouched.

```bash
# Stage a draft (nothing lands in assets.json yet):
bun packages/assetgen/src/cli.ts generate --provider mock --dry-run \
  --id swarm-husk --game scourge-survivors --kind sprite \
  --prompt "a parasite-taken Scourge host" --repo ../deadrotcom/apps/games/scourge-survivors --draft

# Review src/assets/drafts/, then publish one draft (or --all):
bun packages/assetgen/src/cli.ts promote --id swarm-husk --game scourge-survivors \
  --repo ../deadrotcom/apps/games/scourge-survivors
bun packages/assetgen/src/cli.ts promote --all --game scourge-survivors --repo ...
```

Flags: `generate --draft`; `promote (--id <id>[,<id>] | --all) [--game <slug>|shared]
[--repo <path>]`. `--id` may be repeated. Promote validates up front — an unknown
id or a draft whose file went missing fails the whole run before anything moves.
Default (non-draft) generation is byte-for-byte unchanged.

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

Catalog entries may also carry a reviewable `prompts` collection. Use it for
weapons, textures/materials, props, UI, FX, pickups, and other non-character
assets that are not covered by an entity `promptBase`; each prompt can name
reference slots (`style`, `silhouette`, `palette`, `source`) so reviewed source
art is reused instead of re-invented.

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

`assetgen check` is the asset-integrity gate: it rebuilds and verifies every
committed `assets.index*.json` (the full index and any per-game ones) and exits
non-zero if any is stale — drop it into CI or a pre-commit hook.

```bash
bun packages/assetgen/src/cli.ts check
```

## `atlas` — texture atlas packing (issue #92)

`assetgen atlas` packs a game's individual sprite frames into one or more
**texture atlas pages** + a deterministic JSON frame map. Each frame gets an
**edge-extruded gutter** (its border pixels copied outward, not transparent) so
bilinear filtering never samples a neighbouring frame — no runtime atlas bleed.
Frames that overflow a page wrap onto additional pages (WebP caps at 16383px;
default page cap 4096).

```bash
# Pack a game's sprites -> scourge-survivors.atlas<n>.webp + scourge-survivors.atlas.json
bun packages/assetgen/src/cli.ts atlas --game scourge-survivors

# Tune gutter / page size / output dir:
bun packages/assetgen/src/cli.ts atlas --game pactfall --padding 4 --max-width 2048 --out-dir ./out

# CI / pre-commit: fail if the committed atlas map is stale
bun packages/assetgen/src/cli.ts atlas --game scourge-survivors --check
```

Flags: `--game <slug>`, `--padding <px>` (default 2), `--max-width` / `--max-height`
(default 4096), `--out-dir`, `--name`, `--assets-dir`, `--check`,
`--no-geometry-check` (skip the pre-pack sprite frame-set gate below).

The map records each frame's `page`, `x`, `y`, `w`, `h`, `id`, and `game`, plus a
`pages` list with each page image's filename and dimensions — feed it to a
runtime loader / `codegen` (#22) for type-safe sprite lookups.

Before packing, `atlas` runs the sprite frame-set geometry gate (below) so a
malformed `<id>.anim.json` never gets baked into an atlas; pass
`--no-geometry-check` to skip it.

## `check-sprites` — sprite frame-set geometry gate (issue #166)

`assetgen check-sprites` verifies every `<id>.anim.json` sprite-anim sheet is
geometrically sane before it reaches the slicer/atlas or the runtime. It is the
same core `atlas` runs as a pre-pack gate, exposed standalone for CI and
pre-commit. Every sheet is checked for a **structural contract** (always on):

- **Canonical direction set** — `directions` is exactly a 1/4/8 facing set in the
  load-bearing order, and every clip covers exactly those facings (no missing, no
  extra).
- **Frame-count integrity** — `clip.frames` matches every facing's frame-array
  length, so no clip has a short or long direction.
- **In-bounds rects** — every frame rect is non-degenerate and lies fully inside
  its declared atlas page (an overflowing rect is a clipped frame).
- **No blank frames** (pixel pass, default on) — each frame's region on its page
  carries visible (non-transparent) pixels; pass `--no-pixels` to skip the scan.
  The scan is capped at 1024 frames per sheet (a perf guard); past that it warns
  on stderr that the tail was not checked rather than silently passing it.

A per-game **contract** adds opt-in rules, declared either in
`<assets-dir>/sprite-contract.json` (repo-wide) overlaid by
`<assets-dir>/<game>/sprite-contract.json` (per-game wins), or via CLI flags
(which override the file). Contract checks only run when declared, so the gate is
additive — it never fails a sheet for a rule the game never opted into:

```bash
# Check every sheet (structural + pixel pass):
bun packages/assetgen/src/cli.ts check-sprites

# One game, require 8 facings + idle/walk/attack states:
bun packages/assetgen/src/cli.ts check-sprites --game scourge-survivors \
  --dirs 8 --states idle,walk,attack

# Grid sheets: demand uniform frame size, cap dims + aspect band:
bun packages/assetgen/src/cli.ts check-sprites --uniform-frames \
  --max-frame-dims 128x128 --aspect 0.5,2

# Fast structural-only pass (skip the per-frame pixel scan); machine-readable:
bun packages/assetgen/src/cli.ts check-sprites --no-pixels --json
```

Flags: `--assets-dir`, `--game <slug>`, `--dirs <n>`, `--states <a,b,c>`,
`--uniform-frames`, `--max-frame-dims <WxH>`, `--aspect <min,max>`,
`--no-pixels`, `--json`. Exit code is the failure signal: **1** when any sheet
violates the contract, **0** when all sheets pass (or none are found). `--json`
prints the full report (`{ ok, assetsDir, game, reports }`) to stdout and keeps
stderr clean for machine consumers — it does **not** change the exit code.

## `palette-extract` — palette-aware sprite extraction (issue #115)

The flat matte a sprite is keyed on **must sit outside the subject's own
palette**. When a bruised-purple/violet flyer was generated on a magenta matte,
extraction left purple/white key residue and bled the key colour back into the
sprite under runtime filtering (the winged-host failure). `palette-extract`
makes the safe-key choice a first-class, checkable step: green is the default
key, but a subject that uses a near-key colour (a toxic-green creature, a
magenta-tinged flyer) forces the next candidate automatically.

```bash
# Validate that a source's matte is out of the subject palette (CI / pre-key gate).
# Exits 1 with an "unsafe-key" / "residual-key" violation when it is not.
bun packages/assetgen/src/cli.ts palette-extract --check \
  --in flyer.png --palette-hex "#c020c0,#a030b0,#c1121f,#e9e3d6,#161214"

# Key the matte out with the full guardrail chain and record the chosen key.
bun packages/assetgen/src/cli.ts palette-extract \
  --in flyer.png --out flyer.webp --palette doom --size 128
```

Selection walks `green → magenta → blue → cyan` and takes the first candidate at
least `--min-distance` (default 110) from every subject colour, so the studio
DOOM ramp still defaults to green. Extraction keys the matte out, optionally
hardens alpha (`--hard-alpha`), bleeds subject RGB into the margin (shared
`postprocess` defringe), centre-pads to a **stable** `--size` plate (it never
tight-crops per frame — that makes flyers jitter), and encodes lossless WebP. It
writes the bytes plus an `<out>.key.json` sidecar recording the selected
`keyColor`, `keyName`, `keyReason`, `keySafe`, and the nearest subject colour, so
the key choice is auditable in the manifest.

Flags: `--palette <name>` / `--palette-hex "<csv>"`, `--key
auto|green|magenta|blue|cyan|#rrggbb`, `--min-distance`, `--tolerance`, `--halo`,
`--size`, `--hard-alpha`, `--force` (extract even with an in-palette key),
`--check`, `--json`. An in-palette key is **refused** at extract time unless
`--force` is passed.
## `normalize-sheet` / `check-sheets` — horizontal tier sheet gate (issue #246)

Weapon tier/state sheets that the runtime samples as equal-width `1 x N` cells
should be made coherent before they ship. `assetgen normalize-sheet` trims each
cell by alpha, re-centers the visible content into the same-size transparent
cell, preserves the original sheet dimensions, and writes PNG or lossless WebP.
`assetgen check-sheets` is the CI/editor gate for the same contract.

```bash
# Normalize a horizontal Deadrot tier sheet into 5 fixed 435x724 cells
# (final output: 2175x724, regardless of the source generator width):
bun packages/assetgen/src/cli.ts normalize-sheet \
  --in ../deadrotcom/packages/assets/games/scourge-survivors/weapons/pyre/smg-tiers.webp \
  --out ../deadrotcom/packages/assets/games/scourge-survivors/weapons/pyre/smg-tiers.normalized.webp \
  --columns 5 --cell-size 435x724 --padding 2

# Check one or more sheets; shell globs can expand after --in:
bun packages/assetgen/src/cli.ts check-sheets \
  --in ../deadrotcom/packages/assets/games/scourge-survivors/weapons/pyre/*-tiers.webp \
  --columns 5 --cell-size 435x724 --padding 2 --max-center-drift 1 --max-bounds-delta 2

# Machine-readable CI/editor output:
bun packages/assetgen/src/cli.ts check-sheets --in ./weapon-tiers.webp \
  --columns 5 --cell-size 435x724 --json

# Batch-normalize Deadrot Scourge tier sheets while keeping runtime manifests unchanged:
for sheet in ../deadrotcom/packages/assets/games/scourge-survivors/weapons/pyre/*-tiers.webp; do
  bun packages/assetgen/src/cli.ts normalize-sheet --in "$sheet" --out "$sheet" \
    --columns 5 --cell-size 435x724 --padding 2
done
```

Flags shared by both commands: `--columns <n>` (required), `--cell-size <WxH>`
(or `--cell-width` + `--cell-height`) to lock the exact output/check geometry,
`--padding <px>`, `--anchor center`, `--alpha-threshold <0-254>`,
`--max-center-drift <px>` (default 1), `--max-bounds-delta <px>` (default 2),
`--max-aspect-delta <n>` (default 0.05), and `--json`. `normalize-sheet` also
takes `--out <path>` and `--dry-run`. When `--cell-size` is supplied, the
normalizer repairs generator dimensions into `columns * cellWidth` by
`cellHeight`; the checker then enforces that exact locked canvas. The checker
fails on invalid equal-cell geometry, canonical dimension mismatch, missing alpha,
blank cells, edge-clipped content, padding underflow, center drift, bounds-size
delta, and aspect delta. Reports include per-cell before/after bounds, centers,
drift, size deltas, and diagnostics so the game can keep sampling `1 / columns`
without frame metadata.

## `codegen` — typed per-game asset bindings (issue #22)

`assetgen codegen --game <slug>` turns the asset index (+ optional
`<game>.atlas.json`) into one generated TypeScript module the game imports:

- **Typed manifest** — `ASSETS` (id → path/width/height/frames) + an `AssetId`
  union, so asset references are typo-proof and autocomplete.
- **Atlas table** — `ATLAS` (pages + per-frame `page/x/y/w/h`) when an atlas map
  exists alongside.
- **Animation bindings** — `ANIMATIONS` (frame size/count/fps/loop) from
  sprite-sheet metadata (run `index --frame-size` to populate frame grids).
- **Thin loader** — `loadAssets(base)` preloads every asset by id. Framework-
  agnostic: plain data + DOM `Image`, no engine import.

```bash
# Writes ../deadrotcom/apps/games/<game>/src/assets.generated.ts by default:
bun packages/assetgen/src/cli.ts codegen --game scourge-survivors
bun packages/assetgen/src/cli.ts codegen --game pactfall --out ./assets.generated.ts
bun packages/assetgen/src/cli.ts codegen --game scourge-survivors --check   # CI gate
```

Flags: `--game <slug>` (required), `--out <path>`, `--atlas <path>`,
`--frame-size <WxH>`, `--assets-dir`, `--check`. Colliding ids (e.g. `x.png` +
`x.webp`) keep their extension so no asset is dropped.

## `import-aseprite` — hand-authored frames back into the pipeline (issue #78)

The round-trip seam for the `expand` path: AI synthesizes frames, an artist
hand-edits them in [Aseprite](https://www.aseprite.org/) / [LibreSprite](https://github.com/LibreSprite/LibreSprite)
(fix a stray pixel, retime a frame, clean a facing), and `import-aseprite` reads
the exported sheet **back into the identical `sprite-anim` format** the `expand`
path produces — same `assets.json` entry, frame map, and preview. AI-first and
hand-first land in the same runtime format.

Export from Aseprite with **File > Export Sprite Sheet > Output > JSON Data** (a
PNG + a `.json`). Frame **tags** become clip names (`idle`, `run`, `attack`); an
optional facing suffix splits direction (`run_west`, `idle_se`). Tag direction
(forward / reverse / pingpong) and per-frame durations are honored.

```bash
# Import a tagged sheet into the shared sprite-anim format:
bun packages/assetgen/src/cli.ts import-aseprite \
  --in warden.png --json warden.json --id warden --game scourge-survivors

# Re-lock every frame onto the DOOM grid + palette on the way in:
bun packages/assetgen/src/cli.ts import-aseprite \
  --in warden.png --json warden.json --id warden --pixelize --height 110

# No tags? Treat the whole sheet as one clip; force a uniform fps:
bun packages/assetgen/src/cli.ts import-aseprite \
  --in torch.png --json torch.json --clip flicker --fps 12
```

Flags: `--in <sheet.png>` + `--json <sheet.json>` (required), `--id`, `--game`,
`--clip <name>` (clip name when untagged), `--pixelize` (+ `--height`), `--fps`
(omit to honor Aseprite per-frame timing), `--anchor`, `--scale`, `--provider`
(default `aseprite`), `--model`, `--repo`, `--out`, `--usage-log`,
`--license-type`/`--license`/`--license-url`, `--dry-run`.

**DOOM palette for hand-edits.** So edits stay on-palette by construction, the
fixed DOOM ramp ships as a GIMP palette at
[`packages/assets/palettes/doom.gpl`](../assets/palettes/doom.gpl) — load it in
Aseprite via **Palette > Load Palette File**. It is generated from `pixelize.ts`'s
`DOOM_RAMP` (the single source of truth) by `paletteToGpl`; a drift test keeps the
two in lockstep, so regenerate the `.gpl` whenever the ramp changes rather than
hand-editing it.

### Upscale pre-pass (Real-ESRGAN, optional)

Both `pixelize` and `expand` accept an optional restore/upscale pre-pass:

```bash
# Restore the raw provider image with Real-ESRGAN before pixelize snaps it to the grid:
bun packages/assetgen/src/cli.ts pixelize --in raw.png --out sprite.webp \
  --upscale --upscale-scale 4 --upscale-model realesrgan-x4plus

# Same pre-pass, applied per frame, on the expand path:
bun packages/assetgen/src/cli.ts expand --in origin.png --upscale --upscale-scale 2
```

It runs [Real-ESRGAN](https://github.com/xinntao/Real-ESRGAN) (the
`realesrgan-ncnn-vulkan` portable binary) on the raw provider output **before**
pixelize box-downscales it: soft, sub-grid AI output muddies into bleed once
snapped to the grid, so a clean ×2/×4 restore gives pixelize high-frequency
input. Flags: `--upscale` (enable), `--upscale-scale 2|4` (default 4),
`--upscale-model <name>` (default `realesrgan-x4plus`).

Install once via the `realesrgan-ncnn-vulkan` portable binary (set `REALESRGAN_BIN`
to override the resolved path). It is **off by default** and a silent **no-op when
the binary is not installed** — a missing or failed upscaler never fails a
generation.

### Cutout backends (rembg, optional)

`pixelize` removes the background **before** it box-downscales, via `--cutout`:

```bash
# auto (default): rembg subject-segmentation when installed, else the flood-fill
bun packages/assetgen/src/cli.ts pixelize --in raw.png --out sprite.webp --cutout auto

# force a specific backend:
#   rembg  – subject segmentation (best for dark-bodied subjects on a void)
#   flood  – the built-in border flood-fill of near-black (no extra install)
#   none   – trust the source alpha as-is
bun packages/assetgen/src/cli.ts pixelize --in raw.png --out sprite.webp --cutout rembg
```

The flood-fill keeps interior darks but struggles when a dark body blends into the
void (only edge-connected near-black goes transparent). [rembg](https://github.com/danielgatis/rembg)
segments the subject regardless of background — this is the tool DESIGN.md's
`gradeParams.cutout` already declares. Install once (`pip install rembg`; set
`REMBG_BIN` to override the resolved path). Like the upscaler it is a silent
**fallback when rembg is not installed** — `auto`/`rembg` degrade to the flood-fill
and a generation never fails. `--palette <name>` (default `doom`) selects the locked
ramp the grid quantizes to.

The studio's **Sprites pane** exposes the same step (grid height, bg threshold,
cutout, palette, before/after) over `studio:pixelize`, which shells out to this exact
verb — one impl, two surfaces.

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

## Game prebuild staleness gate (issue #47)

`tokens --check` needs `DESIGN.md` + the generator to regenerate and byte-diff,
so it only works inside the monorepo. The **separate game repos** vendor the
token files in (`tokens.ts`/`tokens.css`/`fonts.css`, banner-stamped + committed)
and have neither `DESIGN.md` nor `assetgen` at build time. `check-token-staleness`
is the no-npm equivalent of an installed-version check: it reads the `vX.Y.Z`
banner version out of each vendored consumer and **fails the build** when one is
behind the canon `DESIGN.md` version — so a stale vendored copy cannot ship.

```bash
# Default: the committed app token forks vs the resolved DESIGN.md.
bun packages/assetgen/src/cli.ts check-token-staleness

# Explicit files (positional or --files); machine output with --json.
bun packages/assetgen/src/cli.ts check-token-staleness src/tokens.css --json

# A vendored repo with no DESIGN.md pins the canon version directly.
bun packages/assetgen/src/cli.ts check-token-staleness --canon 0.2.0 src/tokens.css
```

Relative file paths resolve against the directory you run it from (the vendored
repo), so the command works unchanged in a separate game repo. A consumer behind
canon (`stale`), missing, or banner-less fails the gate
(exit 1); `current`/`ahead` pass. Wire it into a repo's `prebuild` so it runs on
every `bun run build` and cannot be silently skipped. In this monorepo the root
`prebuild` script runs it before `turbo run build`, and `bun run lint` runs it
alongside the other token gates.

## Providers
- `codex` — delegates to the local authed `codex` CLI via node-pty (no key wiring needed)
- `openai` — **gpt-image-2** (`--model` to override), transparent PNG; with `--reference`/`-i` it uses the image edit endpoint and attaches up to 16 local png/jpg/webp references
- `fal` — FLUX; with `--reference`/`-i` it embeds local references as data URLs with the configured style-reference strength
- `replicate` — model runner for image/model providers (`--model owner/model`)
- `meshy` — Meshy text-to-3D task adapter; downloads GLB and runs the model optimize path
- `tripo` — Tripo text-to-model task adapter; prefers PBR GLB output when available
- `suno` — audio provider adapter; requires `SUNO_API_BASE_URL` for the licensed endpoint
- `elevenlabs` — ElevenLabs SFX adapter
- `beatoven` — Beatoven music adapter for licensed perpetual-commercial endpoints
- `mock` — offline placeholder for testing the pipeline

## Keys (shipcode-style)
No raw env vars required. Keys resolve from the **macOS keychain** first (env var as
fallback). Store one with:

```bash
security add-generic-password -a shipshit -s shipshit-openai -w <OPENAI_KEY>
security add-generic-password -a shipshit -s shipshit-fal    -w <FAL_KEY>
security add-generic-password -a shipshit -s shipshit-replicate -w <REPLICATE_API_TOKEN>
security add-generic-password -a shipshit -s shipshit-meshy -w <MESHY_API_KEY>
security add-generic-password -a shipshit -s shipshit-tripo -w <TRIPO_API_KEY>
security add-generic-password -a shipshit -s shipshit-suno -w <SUNO_API_KEY>
security add-generic-password -a shipshit -s shipshit-elevenlabs -w <ELEVENLABS_API_KEY>
security add-generic-password -a shipshit -s shipshit-beatoven -w <BEATOVEN_API_KEY>
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

Single-asset generation records `referenceImages` in `assets.json` when
`--reference` or `-i` was used. This is provenance only; keep the referenced
source images in the asset package or lore/art review area when they are needed
to reproduce a promoted asset.

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

> TODO (board): wire the matrix mode into the Electron studio UI.
>
> Done (#66): the rembg background-removal step for non-transparent providers ships as
> `pixelize --cutout rembg|auto` (see "Cutout backends" above) and is surfaced in the
> studio Sprites pane.
