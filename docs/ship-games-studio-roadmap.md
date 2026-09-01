# Ship Games Studio Roadmap

last_verified: 2026-07-22
status: draft

Ship Games Studio is the local-first game production app for Ship Shit Games:
Cursor for building game universes, not a general code editor clone.

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

Ship Games Studio is three surfaces sharing one platform core:

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
- **Lore/Canon.** Browse, **edit, and AI-generate** canon (entity bios, location
  and faction lore, stories) directly in the studio using lore skills and
  generation, then promote accepted changes back into the IP repo's lore vault
  (`apps/lore/content`) via the git flow. This is a full authoring surface, not
  read-only — but the **franchise repo remains the store and source of truth**:
  the studio writes into the vault and never holds canon of its own.
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

### Foundations Already Here

- `packages/assetgen` owns provider adapters, generation commands, manifests,
  provenance, sprite gates, GLB optimization, draft/promotion flows, and CI
  gates.
- `apps/desktop` exists as the local studio cockpit.
- `apps/app` and `apps/api` exist as SaaS surfaces.
- `packages/engine` provides reusable Three.js runtime primitives.
- `packages/tester` provides browser-game QA.
- `../deadrotcom/packages/assets` is the first downstream runtime asset package.

### Studio M0 — Local IP Registry

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

### Studio M1 — Asset Labs MVP

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

### Studio M2 — Deadrot Gym Loop

- Launch a selected game or purpose-built asset gym from the desktop app.
- Inject selected asset drafts/promotions into the playable slice.
- Run `packages/tester` checks against the local browser game.
- Attach screenshots, canvas checks, logs, and failures to the asset/job record.
- Make failures point back to manifest ids and source assets.

Deadrot MVP: select one generated asset, launch a Deadrot gym that uses it, run
a canvas/screenshot check, and record the result.

### Studio M2.1 — Deterministic Game QA

Harden the M2 gym evidence into a repeatable visual and performance gate. Reuse
the existing tester and Deadrot proof tours; do not build another browser
harness.

- [#393](https://github.com/shipshitgames/shipshit.games/issues/393) - make
  `@shipshitgames/tester` fail closed on console/capture errors, require its
  browser integration lane in CI, stamp reproducibility metadata, and make the
  package consumable across repos.
- [#394](https://github.com/shipshitgames/shipshit.games/issues/394) - add
  seeded/forkable random sources and manual fixed-frame test primitives to
  `@shipshitgames/engine`; remove ambient `Math.random()` from shared gameplay
  and spawn paths.
- [#395](https://github.com/shipshitgames/shipshit.games/issues/395) - add named
  capture scenarios, fresh-page isolation, exact frame pumping, and fail-closed
  visual baseline comparison to the tester.
- [#396](https://github.com/shipshitgames/shipshit.games/issues/396) - profile
  real scripted gameplay with boot and frame-time distributions, hitch
  attribution, render/resource metrics, and versioned per-game budgets.
- [deadrot.com#556](https://github.com/shipshitgames/deadrot.com/issues/556) -
  migrate the existing eight-game proof tours onto the shared tester, keep
  game-specific recipes/baselines in Deadrot, and emit Studio-compatible
  `CheckRun` evidence.

Performance budgets start report-only and become blocking only after at least
three reviewed baseline runs. Shader pre-warming is not a roadmap requirement;
add it only when the profiler proves in-play compilation stalls.

Deadrot MVP: Scourge Survivors exposes at least three named deterministic
scenarios, two independent runs compare cleanly on the supported CI lane,
negative fixtures prove the gate fails closed, and the resulting visual plus
performance evidence attaches to one Studio `CheckRun`.

### Studio M3 — Promotion + Git Workflow

- Promote accepted drafts into `../deadrotcom/packages/assets`.
- Update manifests, indexes, provenance, source preservation, and runtime paths.
- Run Deadrot asset checks and game checks from Ship Games Studio.
- Prepare a clean commit/PR in the downstream repo.
- Keep rejected drafts auditable without shipping them.

Deadrot MVP: one button moves a reviewed asset from draft to runtime package,
runs the gates, and shows the exact downstream diff.

### Studio M4 — SaaS Sync + Workers

- Sync projects, jobs, provider usage, review state, and provenance records.
- Add remote job workers for expensive model runs.
- Store large generated artifacts in object storage/CDN with repo-safe pointers.
- Add team review queues, comments, permissions, and billing.
- Let the desktop app choose local execution, provider API execution, or remote
  self-hosted worker execution per job.

Deadrot MVP: local-first work still functions offline; hosted sync adds history,
cost tracking, and sharing.

### Studio M5 — Templates + Factory

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

The first useful version is done when Ship Games Studio can open Deadrot,
generate a new game-ready asset, preserve its sources/provenance, optimize and
register it, write the accepted runtime output into
`../deadrotcom/packages/assets`, launch a playable Deadrot slice that consumes
it by manifest id, run QA gates, and show the downstream diff.

That is the product: the tools to build the game, proven by the game.
