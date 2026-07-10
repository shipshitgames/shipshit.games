# Reusable asset QA

`@shipshitgames/assetgen/asset-qa` is the studio-owned contract for checking and
repairing transparent runtime images. Product repositories own their target
paths, selected source bounds, and acceptance thresholds in a JSON manifest;
this package owns the image I/O, metrics, transforms, diagnostics, and command
semantics.

The contract is deliberately split into two actions:

- `assetgen asset-qa check` is deterministic and read-only. It sorts targets by
  id, decodes and measures files, prints stable diagnostics, and exits non-zero
  when a declared threshold fails. It never creates, rewrites, or touches an
  asset, even when the target has a `repair` declaration.
- `assetgen asset-qa repair` is the only mutation action. It applies only the
  operations declared in the manifest, writes through an atomic sibling
  temporary path, skips a replacement when the encoded bytes are already
  identical, and re-runs the target checks after writing.

Both commands accept repeated `--target <id>` flags and `--json`. Unknown ids,
absolute paths, and paths that escape the configured root fail before any
target is processed.

## Product-repository integration

Commit an `asset-qa.json` beside the product asset package. The checked-in
[`test-fixtures/asset-qa/manifest.json`](./test-fixtures/asset-qa/manifest.json)
is a small complete example. Editors can use
[`asset-qa.schema.json`](./asset-qa.schema.json) for validation and completion.

```json
{
  "$schema": "<studio-repo>/packages/assetgen/asset-qa.schema.json",
  "schemaVersion": 1,
  "root": ".",
  "targets": [
    {
      "id": "sample-sprite",
      "path": "runtime/sample-sprite.webp",
      "checks": {
        "dimensions": { "width": 64, "height": 64 },
        "alpha": {
          "threshold": 0,
          "minMargins": 4,
          "maxBorderPixels": 0,
          "maxDarkFringePixels": 0,
          "maxFringeLuma": 24
        },
        "webpEncoding": "lossless"
      },
      "repair": {
        "rematte": { "mode": "dark-fringe", "maxPasses": 2 },
        "output": { "format": "webp", "lossless": true, "exact": true }
      }
    }
  ]
}
```

Run the studio CLI from the product repository:

```bash
# Local/pre-commit dogfood: read only
bun <studio-repo>/packages/assetgen/src/cli.ts asset-qa check \
  --manifest packages/assets/asset-qa.json

# Intentional local repair after reviewing the manifest diff
bun <studio-repo>/packages/assetgen/src/cli.ts asset-qa repair \
  --manifest packages/assets/asset-qa.json

# One target and machine-readable output
bun <studio-repo>/packages/assetgen/src/cli.ts asset-qa check \
  --manifest packages/assets/asset-qa.json --target sample-sprite --json
```

The source-path form above is for local sibling checkouts only. A standalone
product-repository CI checkout does not contain `<studio-repo>`, and
`@shipshitgames/assetgen` is currently private. Do not add a sibling-path
command to product CI. The CI integration prerequisite is a released,
version-pinned Ship Shit Games CLI surface that exposes the same
`asset-qa check|repair` arguments and report contract. Until that surface is
published, the Deadrot rollout can commit and run the manifest locally, but its
CI gate must remain unchanged.

`root` is resolved relative to the manifest. `--root` overrides it and is
resolved from the current working directory. Every target and repair source
must stay under that root; containment is physical, so a symlinked path
component that points outside the root is rejected before any read or
write. WebP checks and repairs require the `dwebp` and
`cwebp` binaries from libwebp; the encoder uses PAM RGBA plus `-exact` so hidden
RGB at transparent edges is not silently discarded.

The JSON report is a stable API. Each target contains dimensions, byte size,
alpha bounds/margins, border and semi-transparent counts, dark-fringe count,
edge/inner luma metrics, WebP encoding kind, and diagnostics with a code plus
actual/expected values. Human output includes the same failing code and a
direct repair command hint.

## Manifest operations

Checks are independent and declarative:

- `dimensions.width` / `dimensions.height`
- `alpha.threshold`
- `alpha.minMargins` as one number or per-edge values
- `alpha.maxBorderPixels`
- `alpha.maxDarkFringePixels`, with optional `alpha.darkFringe` classifier tuning
- `alpha.maxFringeLuma`, with optional `alpha.edge` scan tuning
- `webpEncoding`: `lossless` or `lossy`

A repair pipeline may declare:

- `source` and `expectedSource` to protect atlas or pre-pad inputs
- `crop`, using explicit source bounds or detected alpha bounds plus padding
- `padHorizontalCells`, preserving each proportional source cell while adding
  independent transparent insets
- `rematte.mode`: `dark-edge` for weighted-luma edge recovery or `dark-fringe`
  for the conservative neutral-matte classifier
- `output`: explicit WebP lossless/lossy policy, quality, method, and `exact`

Operations always execute in this order:

```text
decode source -> crop -> pad horizontal cells -> rematte -> encode -> atomic replace -> validate
```

Use the public library when a studio surface needs the primitives directly:

```ts
import {
  alphaBounds,
  alphaMargins,
  cropForBounds,
  decodePamRgba,
  edgeQualityMetrics,
  encodePamRgba,
  measureDarkFringe,
  padHorizontalCells,
  rematteDarkEdgePixels,
  rematteDarkFringe,
  runAssetQaCheck,
  runAssetQaRepair,
  webpEncodingKind,
  withTemporaryDirectory,
} from "@shipshitgames/assetgen/asset-qa";
```

## Deadrot July-script migration map

The following is the precise migration for the duplicated July 3 repair code in
the Deadrot product repository. This repository does not contain or hard-code
any of these product paths.

| Deadrot source | Replace with |
| --- | --- |
| `packages/assets/scripts/lib/alpha-margin.mjs` `alphaBounds` / `alphaMargins` / `edgeAlphaCount` / `cropForBounds` / `copyRgbaCrop` | Public `alphaBounds`, `alphaMargins`, `countBorderAlphaPixels`, `cropForBounds`, and `copyRgbaCrop` exports. |
| `packages/assets/scripts/lib/edge-quality.mjs` `luma` / neighbor scan / foreground scan / `rematteDarkEdgePixels` / `opaqueBounds` / border count / metrics / tier padding | Public `luma`, `hasTransparentNeighbor`, `nearestForegroundColor`, `rematteDarkEdgePixels`, `alphaBounds` + `alphaMargins`, `countBorderAlphaPixels`, `edgeQualityMetrics`, and `padHorizontalCells` exports. |
| `packages/assets/scripts/lib/alpha-fringe.mjs` fringe classifier / neighbor scan / replacement scan / measure / rematte / encoding detector | Public `isDarkFringePixel`, `hasTransparentNeighbor`, `replacementColorNear`, `measureDarkFringe`, `rematteDarkFringe`, and `webpEncodingKind` exports. |
| All three fix scripts' `decodePam`, PAM header/buffer builders, `mkdtemp` cleanup, `cwebp` invocation, output existence checks, and rename logic | `decodePamRgba`, `encodePamRgba`, `decodeImageFile`, `encodeWebp`, `withTemporaryDirectory`, and `writeFileAtomic`; normally invoked through the manifest runner instead of product code. |
| `fix-warline-portal-prop-margins.mjs` | One target per portal prop. Keep its atlas path and connected-component bounds in Deadrot's manifest as `repair.source` + `repair.crop.bounds`, keep `padding: 32`, declare `alpha.minMargins: 24` and `alpha.maxBorderPixels: 0`, and declare lossless WebP output. Replace `--check` with `asset-qa check`; replace the default mutation path with `asset-qa repair`. |
| `fix-scourge-survivors-edge-quality.mjs` rematte targets | One target per runtime sprite with `repair.rematte.mode: "dark-edge"`; move the existing per-target `minLuma`, `minLumaDelta`, and `includeOpaque` values unchanged into `repair.rematte.options`. Pin the current reviewed `alpha.maxFringeLuma` ceilings: vector `4`, ranger `8`, muzzle flash `14`, enemy spit `9`. Declare `alpha.maxBorderPixels: 0` and lossless WebP. |
| `fix-scourge-survivors-edge-quality.mjs` tier sheets | The committed Deadrot sheets are already the final `2415x772` outputs and their matching unpadded inputs are not preserved at distinct paths. Migrate them as check-only targets with dimensions `2415x772`, `alpha.minMargins: 24`, `alpha.maxBorderPixels: 0`, and lossless WebP. Do not declare an in-place `padHorizontalCells` repair: it is not repeatable from the final target. A future repair requires restoring immutable, matching source files first, then naming those distinct files in `repair.source` with `expectedSource` `2175x724` (SMG) / `2172x724` (cannon), `columns: 5`, 24px padding, `targetCellWidth: 483`, and `targetHeight: 772`. |
| `fix-brand-alpha-fringe.mjs` brand marks | One target per mark with `alpha.maxDarkFringePixels: 0`, `repair.rematte.mode: "dark-fringe"`, and lossy WebP output at quality 92 / alpha quality 100 (the codec contract supplies alpha quality 100). Do not require lossless encoding for the brand targets. |
| `fix-brand-alpha-fringe.mjs` pickup sprites | One target per pickup with `webpEncoding: "lossless"` and a lossless output repair. No rematte operation is required unless that target also declares a fringe threshold. |

Transfer the existing declarations without changing their values:

- Portal atlas source:
  `games/warline/props/portal-deck/portal-deck-atlas.webp`. The three target
  crops are `command-table.webp` at `(439,566)..(1001,935)`, `green-lift.webp`
  at `(1216,47)..(1488,482)`, and `red-pit.webp` at
  `(1055,540)..(1468,944)`. All use 32px repair crop padding and a 24px minimum
  validation margin. Their checked final dimensions are `627x434`, `337x500`,
  and `478x469`, respectively; all require zero border pixels and lossless
  WebP.
- Dark-edge targets:
  `players/pyre/vector/side.webp`, `players/pyre/ranger/side.webp`, and
  `projectiles/scourge/enemy-spit.webp` retain `minLumaDelta: 18`.
  `fx/pyre/muzzle-flash.webp` retains `includeOpaque: true`, `minLuma: 50`,
  and `minLumaDelta: 10`. These paths are under
  `games/scourge-survivors/`. Their `maxFringeLuma` ceilings are `4`, `8`, `9`,
  and `14`, respectively (vector, ranger, enemy spit, muzzle flash).
- Tier sheets:
  `games/scourge-survivors/weapons/pyre/smg-tiers.webp` and
  `cannon-tiers.webp` are currently final `2415x772` lossless files with at
  least 24px alpha margins and zero border pixels, so their initial manifest
  entries are check-only. `2175x724` and `2172x724` are historical source
  dimensions, not valid `expectedSource` declarations unless matching source
  files are restored at paths distinct from the targets.
- Brand fringe targets:
  `brand/wordmark.webp`, `brand/title.webp`, and `brand/mark.webp` retain lossy
  quality 92 after dark-fringe repair.
- Lossless pickup targets:
  `games/scourge-survivors/pickups/ammo/bone-cache.webp`,
  `pickups/bonus/damage-boost.webp`, and `pickups/health/blood-vial.webp` retain
  lossless WebP. The latter two paths share the same
  `games/scourge-survivors/` prefix.

Deadrot can first replace the three one-off package scripts with local-only
dogfood aliases (the path matches the existing sibling `assets:clean-sprites`
contract):

```json
{
  "scripts": {
    "assets:qa": "bun ../../../shipshitgames/packages/assetgen/src/cli.ts asset-qa check --manifest asset-qa.json",
    "assets:qa:repair": "bun ../../../shipshitgames/packages/assetgen/src/cli.ts asset-qa repair --manifest asset-qa.json"
  }
}
```

Keep `assets:qa:repair` manual. Add the read-only `assets:qa` action to the
product's existing `assets:check` gate only after its command prefix is replaced
with a version-pinned published CLI that exists in an isolated Deadrot CI
checkout. CI must never invoke the mutation action.
