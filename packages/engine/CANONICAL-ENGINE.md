# Canonical Engine Ownership

Issue: shipshitgames/shipshit.games#143
Status: canonical ownership contract
Last updated: 2026-06-09

`packages/engine` in this repository is the canonical source for
`@shipshitgames/engine`.

The package is owned by the Ship Shit Games studio platform, not by the first
Deadrot game that consumed it. Keep the npm scope and package name as
`@shipshitgames/engine`.

## Ownership Rule

- `shipshit.games/packages/engine` owns reusable org-level runtime
  infrastructure: world bounds, arena maps, render lifecycle, camera rigs,
  input seams, agent/spawn helpers, HUD snapshots, and generic transient entity
  lifecycles.
- Deadrot games own Deadrot-specific runtime data: weapons, enemies, maps,
  rosters, art direction, audio, UI, faction rules, lore language, and shipped
  assets.
- `@deadrot/*` aliases are private monorepo/internal aliases unless a real
  external distribution contract appears.
- Do not rename `@shipshitgames/engine` to `@deadrot/engine`.
- Do not create a standalone engine repository or engine project board until the
  engine has an independent release cadence, multiple active IP consumers, or
  external contribution needs.

## Deadrot Consumption Workflow

Deadrot games should resolve engine code from this canonical package, not from a
Deadrot-owned fork.

Use this default dependency shape in Deadrot game packages:

```json
{
  "dependencies": {
    "@shipshitgames/engine": "^0.1.1",
    "three": "^0.184.0"
  }
}
```

CI and release builds should install the published npm package unless the build
is explicitly validating an unpublished engine change.

For local cross-repo development against unpublished engine changes:

```bash
cd ../shipshitgames/packages/engine
bun link

cd ../../../deadrotcom
bun link @shipshitgames/engine
bun install
```

That link is a developer-machine bridge only. Do not commit linked lockfile
state unless a maintainer intentionally chooses a checked-in file or workspace
bridge for a coordinated cross-repo change.

For CI validation of an engine PR against Deadrot, check out both repositories
as siblings, link `../shipshitgames/packages/engine`, run the affected Deadrot
game checks, then discard the link state.

## Duplicate Deadrot Package State

As of 2026-06-09, `shipshitgames/deadrot.com@develop` still contains
`packages/engine`. Treat that package as a temporary compatibility copy, not as
a source of truth.

The same remote inspection found `apps/games/deadlane`,
`apps/games/warline`, and `apps/games/scourge-survivors` still using
`"@shipshitgames/engine": "workspace:*"`. Those dependencies should be migrated
to the published package release, or to an explicitly documented checked-in
bridge if maintainers choose that path for a coordinated cross-repo change.

Until the Deadrot repo removes or replaces it with a shim:

- do not edit `../deadrotcom/packages/engine` to add engine features;
- do not publish it;
- do not rename it to `@deadrot/engine`;
- prefer a dependency on the published `@shipshitgames/engine` package for
  Deadrot games;
- use the local `bun link` bridge above when testing unpublished engine changes.

The cleanup PR in `deadrot.com` should either remove `packages/engine` from the
workspace or turn it into an explicit compatibility shim that forwards consumers
to the package release from this repository.

## Assets Manifest Contract

The engine package intentionally exports the studio-side game asset manifest
schema:

```ts
import manifestSchema from "@shipshitgames/engine/assets-manifest.schema.json";
```

Studio tooling uses this schema to validate each game's
`src/assets/assets.json`. Keeping the schema in the engine package is
intentional because every embodied game needs the same runtime asset manifest
contract, while the Deadrot asset files and generated source history remain in
`../deadrotcom/packages/assets`.

Changes to `src/assets/assets-manifest.schema.json` must preserve this export or
ship with coordinated updates to desktop, assetgen, and affected game consumers.
