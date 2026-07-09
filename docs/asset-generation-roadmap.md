# Asset Generation Roadmap

last_verified: 2026-07-07

Ship Shit Games is building the asset production line for browser-first games:
prompt/reference in, game-ready manifest entry out. Deadrot is the first proof,
but the tooling must generalize to future IPs and external users.

## Current Baseline

`packages/assetgen` already owns the core pipeline:

```txt
prompt -> generate -> postprocess/optimize -> register -> preview
```

What exists today:

- image providers: Codex CLI, OpenAI, fal, Replicate, mock
- 3D providers: Meshy and Tripo API adapters, plus Replicate model routing
- audio providers: Suno-compatible endpoint, ElevenLabs SFX, Beatoven, mock
- reference image support for Codex/OpenAI/fal
- sprite sheet normalization, frame metadata, billboard previews, atlas packing,
  and sprite geometry gates
- GLB optimization with glTF Transform, Draco geometry, WebP texture fallback,
  and manifest compression records
- draft/promote workflow
- asset indexes, legal reports, usage logs, provider/model provenance, and CI
  assetgen gates against the downstream Deadrot asset package

The next work is productization: clearer commands, better previews, provider
shootouts, self-hosted adapters, export targets, and promotion UX.

## MVP: Provider-Backed Pipeline

The MVP is not a model lab toy. It is a repeatable production lane:

1. Generate or import a source asset from a provider.
2. Preserve prompt/reference/provider/task metadata.
3. Optimize into runtime format.
4. Register a manifest/catalog id.
5. Preview in Studio and a real game gym.
6. Promote into `../deadrotcom/packages/assets` when approved.

### Asset Kinds

| Kind | Draft providers | Runtime target |
| --- | --- | --- |
| 2D references, sprites, UI, textures | Codex, OpenAI, fal, Replicate; Gemini adapter later | WebP plus manifest metadata |
| 3D models | Meshy, Tripo, Replicate; optional self-hosted adapters | optimized `.glb` for browser games |
| Audio music/SFX/voice | Suno-compatible, ElevenLabs, Beatoven | WebM/Opus plus audio metadata |

Meshy/Tripo remain the fast external product lane. They are useful because they
hide GPU/runtime complexity and often produce stronger first drafts. They should
not become a hard platform dependency.

## Next: Self-Hosted/Open Model Adapters

Add self-hosted adapters behind the same provider contract so the product can run
against local GPUs, hosted worker pools, or customer infrastructure.

Candidate lanes:

- **TripoSG** for open/local 3D generation experiments.
- **Hunyuan3D-2** for local or hosted shape/texture pipelines, gated by license
  and territory review before any shipped-output claims.
- **TRELLIS / TRELLIS.2** for research/offline image-to-3D lanes, gated by
  NVIDIA GPU and VRAM requirements.
- **Stable Fast 3D** for fast local-ish 3D drafts when quality/runtime tradeoffs
  beat paid APIs.

Adapter rule: each provider must return the same internal object shape:

```txt
source task metadata
  -> downloadable artifact
  -> normalized media type
  -> provider/model/version/license hints
  -> errors that explain retryability
```

Do not bake provider-specific assumptions into the manifest or desktop UI.

## Export Targets

### Browser / Three.js

This is the first-class target.

- 3D: optimized `.glb`
- textures: WebP now, KTX2/Basis when encoder support is wired
- sprites/UI/textures: WebP
- audio: WebM/Opus
- manifest: `assets.json` or shared package catalog by stable id

### Unreal

Support export packs after the browser loop is solid.

- source model: FBX or GLB
- textures: extracted PBR texture set plus license/provenance sidecar
- collision: generated simple collision where possible, manual-review flag when
  not possible
- units/origin: explicit scale, up-axis, pivot, and bounding box report

### Unity

Support export packs in parallel with Unreal when model metadata is stable.

- source model: FBX or GLB
- textures/materials: extracted and mapped into Unity-friendly folders
- sidecars: provenance, prompt/reference metadata, import settings, and runtime
  budget report
- units/origin: explicit scale, up-axis, pivot, and bounding box report

## Provenance And License Records

Every generated asset needs a durable record before promotion:

- prompt hash and prompt character count
- raw prompt where allowed in project-local protected history
- reference image paths and their source status
- provider, model, model version, task id, seed when honored
- output path, media type, byte size, dimensions or model summary
- license/tool/plan/date/kind
- human-authorship/edit disclosure when applicable
- legal disposition: allow, review, deny
- export transforms: optimize/compression, texture conversion, scale, pivot, rig

The manifest is not just runtime data. It is the audit trail that lets the studio
sell the workflow responsibly.

## Next Implementation Slice

The existing `generate --kind model|3d` path already exercises Meshy/Tripo,
downloads GLB, optimizes it, and registers model metadata. The next slice should
make that 3D workflow explicit and reviewable:

1. **`assetgen model generate`**
   - thin wrapper around the existing pipeline
   - accepts `--provider meshy|tripo|replicate|mock`
   - writes a draft by default unless `--register` is passed
   - records provider task id when available
2. **`assetgen model optimize`**
   - exposes `optimizeGlb` directly for imported/raw GLB files
   - writes optimized `.glb`
   - emits a JSON summary: meshes, materials, textures, skins, joints,
     animations, raw bytes, optimized bytes, texture format
3. **`assetgen model register`**
   - registers an existing optimized model into a target manifest
   - requires license/provenance fields
   - refuses unoptimized models unless `--allow-unoptimized-draft` is explicit
4. **`assetgen preview`**
   - generates a local HTML preview for image, sprite sheet, audio, and GLB
   - for GLB: orbit camera, lights, bounding box, grid, animation selector, and
     manifest metadata panel
5. **Self-hosted provider contract**
   - add a generic task provider adapter shape for local HTTP model workers
   - implement one mock self-hosted adapter before adding Hunyuan/TRELLIS
   - keep runtime/license gates visible in the provider catalog

This slice keeps implementation tight: no new SaaS queue, no Unreal/Unity export
yet, and no automatic promotion into Deadrot without review.

## Product Milestones

1. **Model Lab Alpha**: desktop panel can generate Meshy/Tripo/mock models,
   preview GLB, and stage drafts.
2. **Deadrot Promotion**: approved model draft writes into
   `../deadrotcom/packages/assets`, updates the manifest, and passes Deadrot
   asset checks.
3. **Provider Shootout**: same prompt/reference runs through Meshy, Tripo, and
   at least one self-hosted adapter; Studio compares quality, cost, runtime
   weight, and legal state.
4. **Export Packs**: browser export first, then Unreal/Unity packs with sidecars.
5. **SaaS Jobs**: hosted job queue and storage for teams that do not run the
   desktop app.
