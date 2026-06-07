# @shipshitgames/engine

The open-source embodied 3D game engine behind [Ship Shit Games](https://games.shipshit.dev) — the shared spine every studio title runs on.

Imperative [Three.js](https://threejs.org) for the game, React only for the HUD shell. The boundary axis is **player embodiment** ("is the player a body in a 3D world?"), so an FPS, a tower-defense builder, a platformer, and a runner all share the same core + embodied-base layer and differ only by camera rig and mechanic pack.

> **Status: 0.1.0, early.** Extracted seam-by-seam out of the `scourge-survivors` reference game. Shipping now: world bounds + the swappable camera rig. The orchestrator/registry, agent/steering, wave director, HUD shell, input bindings, and netcode seams are landing next.

## Extraction Boundary

The core-vs-game-specific extraction spec lives in
[`ENGINE-EXTRACTION-BOUNDARY.md`](./ENGINE-EXTRACTION-BOUNDARY.md). It classifies
which reference-game modules belong in `@shipshitgames/engine`, which stay in
Scourge Survivors, and which seams games use to register their own content, HUD,
maps, projectiles, pickups, FX, and network payloads.

## Install

```sh
npm i @shipshitgames/engine three
```

`three` is a **peer dependency** — bring your own (dedupe to a single copy). Ships as raw TypeScript (`main`/`types` → `./src/index.ts`); consume it through a TS-aware bundler such as Vite.

## What's in 0.1.0

```ts
import { RectBounds, makeBounds, type WorldBounds } from '@shipshitgames/engine'
import { firstPersonPointerLock, type CameraRig } from '@shipshitgames/engine'

// Axis-aligned XZ play-area bounds — clamp/cull/spawn against this, not a global.
const bounds = RectBounds.square(40)
bounds.clampXZ(position, /* margin */ 1.5)

// A swappable camera rig: the engine reads body/facing for player logic and
// treats the camera as render-only. first-person (pointer-lock) ships today;
// third-person follow is next.
```

- **`WorldBounds` / `RectBounds` / `makeBounds`** — genre-neutral horizontal bounds (a centered arena square or an asymmetric rectangle).
- **`CameraRig` + `firstPersonPointerLock`** — the camera seam. Player systems read `rig.body.position` / `rig.facing`; `rig.camera` is render/projection only.

## License

MIT © Ship Shit Games
