# @shipshitgames/engine

The open-source embodied 3D game engine behind [Ship Shit Games](https://games.shipshit.dev) — the shared spine every studio title runs on.

Imperative [Three.js](https://threejs.org) for the game, React only for the HUD shell. The boundary axis is **player embodiment** ("is the player a body in a 3D world?"), so an FPS, a tower-defense builder, a platformer, and a runner all share the same core + embodied-base layer and differ only by camera rig and mechanic pack.

> **Status: 0.3.x, early.** Extracted seam-by-seam out of the `scourge-survivors` reference game. Shipping now: world bounds, data-driven arena maps, render lifecycle, swappable camera rig, DOM input binding, agent/spawn seams, LDtk level import, HUD snapshots, generic FX/projectile/pickup lifecycles, the PartyKit multiplayer net seam (client transport, remote avatars, room server template), and the optional Rapier2D physics seam (fixed-timestep collision + the agent ↔ rigid-body bridge).

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
- **`loadLdtkProject` + `FixedSpawnProvider`** — the level seam: import an [LDtk](https://ldtk.io) (`deepnight/ldtk`, MIT) export into the native arena model — IntGrid → colliders, entity layer → spawn points, tile/auto layers → render-ready tiles.

## Levels (LDtk import seam)

Author arenas in the [LDtk](https://ldtk.io) editor (MIT, by the Dead Cells lead), vendor the `.ldtk` file alongside the game, and `loadLdtkProject` maps it straight onto the engine's native arena/spawn seams — no bespoke level format. The loader is pure data (no Three.js): IntGrid layers become merged rect colliders, entity layers become spawn points + typed entities, and Tiles/AutoLayer layers become render-ready tiles on the XZ plane for the game's own tile/sprite runtime.

```ts
import {
  loadLdtkProject,
  FixedSpawnProvider,
  ArenaSystem,
  type LdtkArena,
} from '@shipshitgames/engine'

// Pinned to LDtk 1.5 — throws an LdtkError on a mismatched export
// unless you pass { allowVersionMismatch: true }.
const project = loadLdtkProject(await fetch('/levels/breach.ldtk').then((r) => r.text()))
const arena: LdtkArena = project.arenas[0]!

// IntGrid -> colliders + bounds, interpreted by the same ArenaSystem.
const world = new ArenaSystem(arena.map)
world.isBlockedXZ(0, 0)

// Entity layer -> spawn points drop into the spawn seam next to RectScatterSpawnProvider.
const spawns = new FixedSpawnProvider(arena.spawnPoints)
spawns.next() // round-robins authored entry points; honours an avoid radius

// Tile layers carry render-ready { x, z, size, src, tileId, flipX, flipY, alpha }
// — the engine stays render-agnostic and the game draws them.
const tiles = arena.tileLayers.flatMap((layer) => layer.tiles)
```

`scale`, `center`, `collisionLayers`, `solidValues`, `mergeColliders`, `spawnTag`/`spawnIdentifiers`, and `laneField` tune the mapping; pass an `onWarn` sink to capture non-fatal notices (version drift, unsupported layer types).

## Multiplayer (PartyKit net seam)

Optional [PartyKit](https://www.partykit.io) presence. The engine owns the transport, replicated transforms, and server-authoritative health/kills/respawns; games own avatar/weapon ids (opaque strings, `''` means "game default") and every payload that rides a non-reserved `t` discriminator.

Client side — resolve the host, connect, and skin remote players:

```ts
import { NetClient, RemoteAvatar, resolvePartyKitHost, type RemotePlayerInfo } from '@shipshitgames/engine'

const host = resolvePartyKitHost({ envHost: import.meta.env.VITE_PARTYKIT_HOST, dev: import.meta.env.DEV })
const avatars = new Map<string, RemoteAvatar>()
const addAvatar = (p: RemotePlayerInfo) =>
  avatars.set(p.id, new RemoteAvatar(p, { yOffset: -1.8, skin: mySpriteSkin }))

const net = new NetClient(
  {
    // the welcome roster carries everyone already in the room (including you)
    onWelcome: (selfId, players) => players.filter((p) => p.id !== selfId).forEach(addAvatar),
    onJoin: addAvatar,
    onState: (id, x, y, z, yaw) => avatars.get(id)?.setTarget(x, y, z, yaw),
    onHit: (msg) => avatars.get(msg.target)?.setHealth(msg.health),
    onLeave: (id) => avatars.get(id)?.dispose(),
    onGameMessage: (msg) => {}, // your own { t } payloads, verbatim
  },
  { host },
)
await net.connect('room-1', 'Ada', 'my-skin-id')
net.sendState(x, y, z, yaw, weaponId, health) // throttled — safe to call every frame
```

Server side — `party/main.ts` is a thin wrapper around the room template. Import it through the **`./net/server` subpath** (it is deliberately not on the root barrel, so browser bundles never resolve `partykit` types):

```ts
import { createRoomServer } from '@shipshitgames/engine/net/server'

export default createRoomServer({
  spawnHeight: 1.8,
  spawnPoint: () => ({ x: 0, z: 0 }),
  // game payloads ride non-reserved t values on the same { t } envelope
  onGameMessage: (msg, sender, api) => api.broadcast(msg),
})
```

Reserved `t` values (`welcome`, `join`, `leave`, `state`, `name`, `hit`) belong to the base transport on both ends. `partysocket` ships as an **`optionalDependencies` entry** — package managers install it by default but tolerate it being absent (e.g. `--omit=optional`). `NetClient`'s default socket factory lazy-imports it and throws a descriptive error when it's missing; pass your own `createSocket` to use a different socket entirely.

## Physics (Rapier2D seam)

The engine's movement (steering, agents, camera, bounds) is collision-free on its
own. The optional **`@shipshitgames/engine/physics`** seam adds broadphase
collision and resolution — bodies vs walls, bodies vs bodies, knockback — for the
top-down XZ ground plane, wrapping [Rapier2D](https://rapier.rs) (Apache-2). It is
kept off the root barrel (like `./net/server`) so games that never use physics
never resolve the WASM.

**The WASM-load story, once, for every game.** Rapier is shipped as the
`@dimforge/rapier2d-compat` build (the WebAssembly is embedded as base64, so there
is no `.wasm` asset to host and the same build runs in a Vite bundle, in Node, and
in `bun test`). Initialise it exactly once during async boot with `ensureRapier()`
— or just call `PhysicsSystem.create()`, which awaits it for you. The init promise
is memoised, so later scenes share the single initialisation.

```ts
import { PhysicsSystem } from '@shipshitgames/engine/physics'
import { RectBounds } from '@shipshitgames/engine'

const physics = await PhysicsSystem.create({ gravity: { x: 0, z: 0 } })
physics.addBoundsWalls(RectBounds.square(20)) // colliders replace manual clampXZ

const binding = physics.attachAgent(enemy) // enemy: { position, radius } — Agent fits
// ...each frame, on the imperative game loop:
binding.drive({ x: dirX * enemy.speed, z: dirZ * enemy.speed }) // steering → velocity
physics.step(frameDelta) // resolves collisions, then writes enemy.position.x/z
```

Rapier is a 2D engine; the seam maps world `x → rapier.x` and world `z → rapier.y`,
so nothing outside `src/physics` deals in Rapier coordinates and `position.y`
(height) is never touched. `step(frameDelta)` banks elapsed frame time in an
accumulator and runs whole `fixedTimeStep` (default `1/60`) sub-steps, capped at
`maxSubSteps` (the spiral-of-death clamp) — so a 30fps and a 144fps client
integrate identical physics. `@dimforge/rapier2d-compat` ships as an
**`optionalDependencies` entry** (installed by default, tolerant of `--omit=optional`).
Like the net seam's `partysocket`, it is never statically imported: `ensureRapier`
lazily `import()`s it on first use and throws a descriptive error if it was omitted,
so a game that never touches the physics subpath never needs the dependency.

## License

MIT © Ship Shit Games
