# @shipshitgames/engine

The open-source embodied 3D game engine behind [Ship Shit Games](https://games.shipshit.dev) — the shared spine every studio title runs on.

Imperative [Three.js](https://threejs.org) for the game, React only for the HUD shell. The boundary axis is **player embodiment** ("is the player a body in a 3D world?"), so an FPS, a tower-defense builder, a platformer, and a runner all share the same core + embodied-base layer and differ only by camera rig and mechanic pack.

> **Status: 0.1.x, early.** Extracted seam-by-seam out of the `scourge-survivors` reference game. Shipping now: world bounds, data-driven arena maps, render lifecycle, swappable camera rig, DOM input binding, agent/spawn seams, HUD snapshots, and generic FX/projectile/pickup lifecycles.

## Extraction Boundary

The core-vs-game-specific extraction spec lives in
[`ENGINE-EXTRACTION-BOUNDARY.md`](./ENGINE-EXTRACTION-BOUNDARY.md). It classifies
which reference-game modules belong in `@shipshitgames/engine`, which stay in
Scourge Survivors, and which seams games use to register their own content, HUD,
maps, projectiles, pickups, FX, and network payloads.

## Canonical Ownership

`packages/engine` in this repository is the canonical source for
`@shipshitgames/engine`. Deadrot games should consume this package from the
published npm release in CI/release builds, or through a temporary local
`bun link` bridge when testing unpublished engine changes.

The ownership and Deadrot consumption contract lives in
[`CANONICAL-ENGINE.md`](./CANONICAL-ENGINE.md). It also records the temporary
status of the duplicate `deadrot.com/packages/engine` package and the intentional
`assets.json` manifest schema export.

## Install

```sh
npm i @shipshitgames/engine three
```

`three` is a **peer dependency** — bring your own (dedupe to a single copy). Ships as raw TypeScript (`main`/`types` → `./src/index.ts`); consume it through a TS-aware bundler such as Vite.

## What's in 0.1.0

```ts
import { RectBounds, makeBounds, type WorldBounds } from '@shipshitgames/engine'
import {
  ArenaSystem,
  HudSystem,
  ProjectilesSystem,
  firstPersonPointerLock,
  type CameraRig,
  type ArenaMap,
} from '@shipshitgames/engine'

// Axis-aligned XZ play-area bounds — clamp/cull/spawn against this, not a global.
const bounds = RectBounds.square(40)
bounds.clampXZ(position, /* margin */ 1.5)

// A swappable camera rig: the engine reads body/facing for player logic and
// treats the camera as render-only. first-person (pointer-lock) ships today;
// third-person follow is next.

const map: ArenaMap = {
  id: 'lab-arena',
  bounds: { kind: 'square', half: 40 },
  obstacles: [{ kind: 'rect', id: 'crate-a', x: 4, z: -2, width: 3, depth: 2 }],
  lights: [{ kind: 'ambient', id: 'base-fill', color: '#6b7280', intensity: 0.75 }],
}
const arena = new ArenaSystem(map)
arena.isBlockedXZ(4, -2)

const hud = new HudSystem({ health: 100, ammo: 12, status: 'playing' as const })
hud.subscribe((snapshot) => console.log(snapshot.health))

const projectiles = new ProjectilesSystem({
  bullet: { type: 'bullet', speed: 20, radius: 0.1, ttl: 1, damage: 4 },
})
projectiles.spawn({
  type: 'bullet',
  position: { x: 0, y: 1, z: 0 },
  direction: { x: 0, y: 0, z: -1 },
})
```

- **`WorldBounds` / `RectBounds` / `makeBounds`** — genre-neutral horizontal bounds (a centered arena square or an asymmetric rectangle).
- **`ArenaMap` / `ArenaSystem`** — serializable map bounds, obstacles, themes, and lights interpreted consistently by every embodied game.
- **`RenderSystem`** — scene/renderer lifecycle, viewport resize, render dispatch, and map light/theme application while games keep their own meshes and cameras.
- **`CameraRig` + `firstPersonPointerLock`** — the camera seam. Player systems read `rig.body.position` / `rig.facing`; `rig.camera` is render/projection only.
- **`InputSystem` + movement bindings** — DOM event lifecycle and WASD/arrow movement intent; genre verbs stay game-side.
- **`HudSystem<TState>`** — typed snapshot/listener shell for React HUDs without making React part of the engine loop.
- **`FxSystem` / `ProjectilesSystem` / `PickupsSystem`** — shared transient entity lifecycles with game-supplied content tables and collision/collection policy.

## License

MIT © Ship Shit Games
