# Shipshitcode Roadmap

last_verified: 2026-07-09
status: draft

Shipshitcode is the local-first game production app for Ship Shit Games: Cursor
for building game universes, not a general code editor clone.

It opens an IP monorepo like `../deadrotcom`, understands its games, lore,
asset packages, manifests, and validation commands, then wraps the Ship Shit
Games SaaS/tooling platform around the real repo. The SaaS stores project/job
history and collaboration state; the downstream repo remains the source of
truth for shipped game code, lore, and runtime assets.

```txt
open IP repo
  -> detect games, lore, assets, manifests, scripts
  -> generate draft assets with provider/self-hosted adapters
  -> preview and optimize
  -> register provenance and license state
  -> promote into the IP asset package
  -> launch playable gym
  -> run QA gates
  -> commit or reject the change
```

## Product Shape

Shipshitcode is three surfaces sharing one platform core:

- **Desktop app.** Local project launcher, asset labs, previews, keychain-backed
  provider credentials, terminal execution, repo writes, and game gyms.
- **Hosted SaaS.** Accounts, teams, projects/IPs, job history, provider usage,
  remote workers, asset catalogs, review queues, and billing.
- **CLI/packages.** The automatable layer: `assetgen`, engine templates,
  game-testing tools, exporters, and manifest/provenance libraries.

The local app should feel like the command center. The SaaS should feel like the
team memory and job control plane.

## What It Opens

For Deadrot, the first supported project loader should inspect
`../deadrotcom` and discover:

- `apps/games/*` playable game slices
- `apps/lore/content` canon and world references
- `packages/assets` runtime asset package
- asset indexes, manifests, history, source preservation, and budget files
- package scripts for asset checks, typechecks, tests, and game dev servers
- local links to `shipshitgames` tooling packages when dogfooding unpublished
  work

The same loader contract should later support any new IP repo.

## Core Panes

- **Projects.** Register IPs, repos, games, asset packages, environments, and
  local paths.
- **Asset Catalog.** Search by manifest id, game, canon tag, source prompt,
  provider, license status, runtime path, and promotion state.
- **Generate Lab.** Prompt/reference to sprites, textures, UI art, props,
  portraits, audio, and video drafts.
- **Model Lab.** Prompt/reference to `.glb`/FBX workflows with provider-backed
  and self-hosted model adapters.
- **Audio Lab.** Music, stingers, ambiences, VO, SFX, loops, stems, and runtime
  exports.
- **Lore/Canon.** Pull constraints and style references from the IP repo without
  making the platform the canon source of truth.
- **Preview.** Inspect images, atlases, GLB files, animation clips, audio loops,
  material maps, and export packs before promotion.
- **Gyms.** Launch local playable slices with selected draft/promoted assets.
- **QA.** Run asset gates, browser canvas checks, screenshots, budgets,
  manifest validation, and provider/provenance audits.
- **Promote.** Write accepted runtime outputs into the downstream asset package,
  update manifests, and prepare a commit/PR.
- **Exports.** Produce browser/Three.js assets first, then Unreal and Unity
  export packs.

## Data Model

The SaaS database should model the production line, not replace the repo:

- `Project` / `IP` - Deadrot or another universe.
- `Repo` - local and remote repository metadata.
- `Game` - playable slice or shipped title inside an IP repo.
- `AssetPackage` - downstream runtime package such as
  `deadrotcom/packages/assets`.
- `Asset` - stable catalog record addressed by manifest id.
- `AssetVersion` - draft, optimized, promoted, or rejected asset revision.
- `GenerationJob` - high-level request from prompt/reference/canon to output.
- `ProviderRun` - provider-specific call, settings, costs, timing, and errors.
- `Export` - browser, Unreal, Unity, or archival output.
- `Provenance` - prompt, references, source files, model/provider, seed, config,
  and reproduction hints.
- `LicenseReview` - license, usage constraints, reviewer, and acceptance state.
- `Promotion` - write into downstream repo, manifest update, and git metadata.
- `CheckRun` - asset gates, typecheck, game gym report, screenshots, and logs.

Local SQLite/cache can mirror enough of this model for offline work. Hosted
SaaS sync should be additive: it remembers jobs, teams, costs, and review
state, while the downstream repo keeps the shippable artifacts.

## Roadmap

### Phase 0 - Foundations Already Here

- `packages/assetgen` owns provider adapters, generation commands, manifests,
  provenance, sprite gates, GLB optimization, draft/promotion flows, and CI
  gates.
- `apps/desktop` exists as the local studio cockpit.
- `apps/app` and `apps/api` exist as SaaS surfaces.
- `packages/engine` provides reusable Three.js runtime primitives.
- `packages/tester` provides browser-game QA.
- `../deadrotcom/packages/assets` is the first downstream runtime asset package.

### Phase 1 - Local IP Loader

- Register a local IP repo from the desktop app.
- Detect games, lore roots, asset packages, scripts, manifests, and package
  manager.
- Validate that generated outputs are targeted at the downstream repo, not
  accidentally stored in the platform repo.
- Add a project/IP record and attach discovered assets to it.
- Show asset health from indexes, manifests, source history, license records,
  and local check scripts.

Deadrot MVP: open `../deadrotcom`, detect `packages/assets`, detect
`apps/games/*`, detect `apps/lore/content`, and show a readable project
overview.

### Phase 2 - Asset, Model, And Audio Labs

- Wrap existing `assetgen generate` flows in desktop UI.
- Add explicit model commands:
  - `assetgen model generate`
  - `assetgen model optimize`
  - `assetgen model register`
- Add `assetgen preview` for images, atlases, GLB files, animation clips, audio,
  and export packs.
- Support provider-backed lanes first: OpenAI/Gemini-style 2D references,
  Meshy/Tripo APIs where useful, and existing Replicate/fal-style lanes.
- Add open/self-hosted adapter slots for TripoSG, Hunyuan3D-2, TRELLIS,
  TRELLIS.2, and Stable Fast 3D behind hardware/license gates.

Deadrot MVP: generate a 3D draft, optimize to runtime GLB, preview it, register
it, and keep provenance.

### Phase 3 - Gyms And QA Loop

- Launch a selected game or purpose-built asset gym from the desktop app.
- Inject selected asset drafts/promotions into the playable slice.
- Run `packages/tester` checks against the local browser game.
- Attach screenshots, canvas checks, logs, and failures to the asset/job record.
- Make failures point back to manifest ids and source assets.

Deadrot MVP: select one generated asset, launch a Deadrot gym that uses it, run
a canvas/screenshot check, and record the result.

### Phase 4 - Promotion And Git Workflow

- Promote accepted drafts into `../deadrotcom/packages/assets`.
- Update manifests, indexes, provenance, source preservation, and runtime paths.
- Run Deadrot asset checks and game checks from Shipshitcode.
- Prepare a clean commit/PR in the downstream repo.
- Keep rejected drafts auditable without shipping them.

Deadrot MVP: one button moves a reviewed asset from draft to runtime package,
runs the gates, and shows the exact downstream diff.

### Phase 5 - Hosted SaaS Sync

- Sync projects, jobs, provider usage, review state, and provenance records.
- Add remote job workers for expensive model runs.
- Store large generated artifacts in object storage/CDN with repo-safe pointers.
- Add team review queues, comments, permissions, and billing.
- Let the desktop app choose local execution, provider API execution, or remote
  self-hosted worker execution per job.

Deadrot MVP: local-first work still functions offline; hosted sync adds history,
cost tracking, and sharing.

### Phase 6 - Templates And Factory

- Scaffold new IP repos with the same game, lore, asset, gym, and manifest
  contracts.
- Add browser game templates using `@shipshitgames/engine`.
- Add Unreal and Unity export pack templates.
- Add provider/template/plugin marketplace hooks once the core loop is real.

Deadrot proves the path; the second IP proves the product.

## Non-Goals For V1

- Do not build a full code editor replacement before the asset/game production
  loop works.
- Do not replace Unity or Unreal; export to them.
- Do not make the SaaS database the only source of truth for shipped runtime
  assets.
- Do not auto-promote provider outputs into games without review, provenance,
  license state, and asset checks.
- Do not let provider-specific features define the platform architecture.

## Success Bar

The first useful version is done when Shipshitcode can open Deadrot, generate a
new game-ready asset, preserve its sources/provenance, optimize and register it,
write the accepted runtime output into `../deadrotcom/packages/assets`, launch a
playable Deadrot slice that consumes it by manifest id, run QA gates, and show
the downstream diff.

That is the product: the tools to build the game, proven by the game.
