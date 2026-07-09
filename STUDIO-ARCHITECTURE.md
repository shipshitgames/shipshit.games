# Ship Shit Games — Gaming SaaS Studio Architecture

last_verified: 2026-07-07
status: active

Ship Shit Games is the product company and tooling platform. The product is an
open-source-ish gaming SaaS studio: generation, review, optimization, runtime
packages, game templates, local desktop workflows, and hosted dashboards for
building browser-first games.

Deadrot is the flagship proof-of-concept universe built with that platform. It
is the first customer, test bench, and marketing proof that the tools can ship
real games.

The point is simple:

```txt
Ship Shit Games sells the workflow.
Deadrot proves the workflow by shipping games.
```

## Platform vs. Universe

| Repo | Owns | Does not own |
| --- | --- | --- |
| `shipshitgames` | SaaS/dashboard, CLI, desktop cockpit, assetgen, provider adapters, model/audio/image pipelines, reusable engine/runtime packages, templates, docs, courses, game-testing tools | Deadrot shipped games, Deadrot canon, Deadrot runtime asset history |
| `../deadrotcom` | Deadrot hub, lore/canon, shipped games, runtime packages, `packages/assets`, generated outputs, preserved source/history assets | Reusable generation tooling, provider/keychain integrations, SaaS tooling, Studio Pass/tools commerce |

Do not move Deadrot runtime assets or games into this repo unless explicitly
requested. Do not move reusable asset generation tooling into `deadrotcom`.
Tools live here; shipped outputs live downstream.

## Product Surfaces

- `apps/web` is the public Ship Shit Games site: brand hub, proof gallery,
  pricing, and calls to action for tools/courses.
- `apps/app` is the hosted SaaS surface: account, entitlement, Asset Lab, tool
  dashboards, and eventually project/job history.
- `apps/api` is the studio API: billing/webhooks, asset jobs, object storage, and
  generated asset metadata.
- `apps/desktop` is the local studio cockpit: project registry, keychain-backed
  providers, local filesystem writes, terminal/CLI execution, previews, and game
  gyms. This is the Shipshitcode/Cursor-for-games surface.
- `apps/cli` is the npm/npx entrypoint for scaffolding, automation, and
  non-GUI workflows.
- `apps/docs` documents the actual commands, contracts, and production loops.

## Core Packages

- `packages/assetgen` is the generation product core and CLI. It owns the
  provider adapters, prompt/reference pipeline, sprite/audio/model
  post-processing, manifests, provenance, legal reports, asset indexing, atlas
  generation, and CI gates.
- `packages/engine` is the canonical org-level Three.js runtime package:
  reusable game/context/systems spine, camera/input seams, net seams, asset
  manifest schema, physics helpers, and future reusable runtime primitives.
- `packages/tester` is the browser game QA harness: drive a game, verify the
  canvas, collect screenshots, and produce agent-readable reports.
- `packages/ressources` is the learning and rules layer: source manifests,
  transcripts, distillation, and derivative skill/app/tool candidates.
- `packages/shared` holds cross-surface registries and pure utilities.
- `packages/ui` is the published React UI package for studio and game shells.

## Deadrot Consumption

Deadrot consumes the platform in two ways:

1. **Generated assets.** Studio tools read from and write to
   `../deadrotcom/packages/assets`. Deadrot games import the resulting runtime
   assets through `@shipshitgames/assets` and resolve by manifest/catalog id.
2. **Reusable runtime packages.** Deadrot games consume `@shipshitgames/engine`
   from this repo through published package releases, or through an explicit
   temporary `bun link` bridge while testing unpublished engine work.

Generated outputs may be written into `deadrotcom`; the generator code that
created them stays in `shipshitgames`.

## Build Loop

The studio loop is:

```txt
select IP/game
  -> gather prompt/reference/canon
  -> generate draft asset
  -> preserve source + provenance
  -> optimize/export
  -> register in manifest/catalog
  -> preview in Studio
  -> launch game gym
  -> validate in Deadrot
  -> promote or reject
```

Deadrot is the first registered IP/game universe. The platform must be built so
the second universe is not a rewrite: new IPs should get the same project
registry, asset pipeline, engine contracts, game templates, and validation
workflow.

## Product Direction

Ship Shit Games should become the open-source SaaS alternative to point tools
like Meshy, Tripo, image generators, audio generators, and scattered conversion
scripts. The differentiator is not only generation quality. It is the production
line around generation:

- provider abstraction across image, 3D, audio, and future self-hosted models
- prompt/reference management
- provenance and license records for every generated asset
- runtime-ready exports for browser games first, then Unreal and Unity
- manifest/catalog registration by stable id
- local gyms and browser-game QA
- repeatable templates for shipping playable games

Deadrot is the proof that this is not a toy demo. If a tool cannot help Deadrot
ship, it is not ready to sell.

## Operating Rules

- Ship Shit Games owns tooling; Deadrot owns runtime outputs.
- Asset generation starts here, even when the output path is in `deadrotcom`.
- Game code consumes assets by manifest/catalog id, not by ad hoc provider output
  paths.
- Provider-specific features are adapters, never the product architecture.
- Open/self-hosted models are welcome when they pass runtime, license, cost, and
  quality gates. Meshy/Tripo-style APIs remain useful external lanes, not the
  center of the product.
- Every generated asset must carry provenance, license state, and enough
  metadata to reproduce, audit, reject, or promote it later.

See also:

- [`docs/shipshitcode-roadmap.md`](docs/shipshitcode-roadmap.md)
- [`docs/asset-generation-roadmap.md`](docs/asset-generation-roadmap.md)
- [`docs/deadrot-dogfood-loop.md`](docs/deadrot-dogfood-loop.md)
- [`packages/engine/CANONICAL-ENGINE.md`](packages/engine/CANONICAL-ENGINE.md)
