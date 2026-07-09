# Deadrot Dogfood Loop

last_verified: 2026-07-07

Deadrot is the flagship proof that Ship Shit Games tooling can build real games.
The tooling lives in this repo. The shipped runtime outputs live in
`../deadrotcom`.

## Boundary Check

Inspection of `../deadrotcom` confirms the intended split:

- `deadrotcom` has shipped games, lore, runtime packages, and
  `packages/assets`.
- `deadrotcom` does not have `packages/assetgen`.
- `deadrotcom/packages/assets` calls back into
  `../shipshitgames/packages/assetgen` for reusable asset tooling such as sprite
  cleanup.
- `deadrotcom/packages/assets` preserves runtime assets, source/history assets,
  archive batches, format checks, indexes, budgets, and lore art maps.

There is one drift item to clean up later: `deadrotcom/.env.example` still
mentions asset-generation provider keys. Treat that as legacy guidance for the
old world. Provider/keychain configuration belongs in Ship Shit Games tooling.

## Loop

### 1. Select Deadrot In The Studio

Use the project registry or explicit CLI paths to target Deadrot:

```bash
--assets-dir ../deadrotcom/packages/assets
--games-root ../deadrotcom/apps/games
--repo ../deadrotcom/apps/games/<game>
```

Deadrot lore/canon remains in:

```txt
../deadrotcom/apps/lore/content
```

Generated runtime outputs and preserved source history remain in:

```txt
../deadrotcom/packages/assets
```

### 2. Generate In Ship Shit Games Tooling

Run generation from this repo, not from inside the Deadrot product repo:

```bash
bun packages/assetgen/src/cli.ts generate \
  --game scourge-survivors \
  --kind sprite \
  --provider codex \
  --id host-grunt-v2 \
  --prompt "approved Deadrot canon prompt" \
  --repo ../deadrotcom/apps/games/scourge-survivors \
  --draft
```

For 3D drafts, use the existing model lane while the explicit `assetgen model`
commands are being productized:

```bash
bun packages/assetgen/src/cli.ts generate \
  --game shared \
  --kind model \
  --provider meshy \
  --id scourge-bile-pylon \
  --prompt "static Scourge parasite pylon prop, readable silhouette" \
  --repo ../deadrotcom/apps/games/scourge-survivors \
  --draft
```

### 3. Preserve Sources And Provenance

Before a draft can become runtime material, preserve enough context to audit it:

- prompt/reference paths
- provider, model, task id, seed when honored
- raw source or source cache when it is worth keeping
- license/tool/plan/date/kind
- human-authorship or edit disclosure
- generated-output review status

Curated generated history belongs under:

```txt
../deadrotcom/packages/assets/sources/generated/...
```

Unreviewed provider caches, rejected material, and temporary rescue batches
belong under:

```txt
../deadrotcom/packages/assets/_archive/...
```

Do not leave useful generated assets only in a global provider cache.

### 4. Optimize And Register

Use `assetgen` to convert drafts into runtime formats and manifest entries.

Browser-first targets:

- sprites/UI/textures: `.webp`
- audio: `.webm`
- models: optimized `.glb`

Every promoted runtime asset must have a manifest/catalog id and provenance. Game
code should refer to that id, not a provider output filename.

### 5. Write Runtime Outputs Into Deadrot Assets

Approved runtime outputs land in semantic package paths such as:

```txt
../deadrotcom/packages/assets/games/<game>/...
../deadrotcom/packages/assets/entities/<entity-id>/<game>.webp
../deadrotcom/packages/assets/shared/...
```

For Deadrot game-specific outputs, keep folder names scan-friendly:

```txt
games/<game>/players/<faction>/<character>/
games/<game>/enemies/scourge/<enemy>/
games/<game>/weapons/<faction>/<weapon>/
games/<game>/models/<domain>/<asset-id>.glb
games/<game>/audio/{music,sfx}/
games/<game>/ui/
```

### 6. Consume By Manifest Id In Deadrot Games

Deadrot games should consume runtime assets through `@shipshitgames/assets` and
the game/runtime manifest. The target is:

```txt
game code -> manifest/catalog id -> package-relative asset path -> bundled/CDN URL
```

Avoid new hardcoded imports to generated provider filenames. The manifest is the
contract between the Ship Shit Games tooling and the Deadrot runtime.

### 7. Validate In Both Repos

From `shipshitgames`:

```bash
bun run check:assetgen-gates -- \
  --assets-dir ../deadrotcom/packages/assets \
  --games-root ../deadrotcom/apps/games
```

From `deadrotcom`:

```bash
bun run --cwd packages/assets assets:check
bun run typecheck
bun run e2e
```

For visible game changes, launch the relevant Studio Gym or game dev server and
verify the asset in motion before calling it done.

## Done Means

An asset is dogfooded when:

- the source/provenance is preserved
- the runtime output is optimized
- the manifest/catalog id is registered
- Deadrot consumes the id in a real game or hub surface
- asset checks pass in `deadrotcom`
- assetgen gates pass from `shipshitgames`
- the result has been previewed in the Studio or a game gym

If Deadrot cannot use the output, the Ship Shit Games tool is not finished.
