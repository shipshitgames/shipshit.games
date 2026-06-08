# Engine Extraction Boundary

Issue: shipshitgames/shipshit.games#8
Status: extraction spec, no runtime extraction in this change
Last updated: 2026-06-07

This document defines the core-vs-game-specific boundary for extracting the
Scourge Survivors reference game into `@shipshitgames/engine`.

The `fpsdemo/src/game` tree named in issue #8 is not present in this studio
worktree. The classification below is based on the issue inventory, the current
`@shipshitgames/engine` package surface, and the local lore primer in
`apps/docs/content/lore/index.mdx`.

## Boundary Rule

`@shipshitgames/engine` owns reusable embodied-3D infrastructure:

- lifecycle orchestration, rAF timing, disposal, and system registration
- Three.js renderer, scene, camera, arena, input, physics-adjacent world helpers,
  and reusable transient entity lifecycles
- typed seams for HUD snapshots, spawn points, map/theme data, camera rigs,
  transport, and replicated presence

Games own product and canon:

- weapons, enemies, factions, names, stats, ability rules, wave tables, scoring,
  pickups, authored maps, audio, UI art direction, and React HUD visuals
- all Scourge Survivors parasite-canon details, including Scourge hosts,
  breach behavior, Pyre/Warden visual treatment, and faction-specific language

Engine code must never encode Deadrot canon. Scourge-specific material stays in
the game package and is passed into engine seams as content data or callbacks.

## Current Engine Surface

The current package already exposes these extraction seams:

| Surface | Current owner | Notes |
| --- | --- | --- |
| `WorldBounds`, `RectBounds`, `makeBounds` | Engine | Genre-neutral XZ clamp, cull, and spawn bounds. |
| `CameraRig`, `firstPersonPointerLock` | Engine | Camera is render-only; player logic reads `rig.body` and `rig.facing`. |
| `InputSystem`, `MoveIntent`, `ActionMap` | Engine | DOM lifecycle and movement are shared; action verbs stay game-defined. |
| `Agent`, `SteeringStrategy` | Engine | Reusable kinematic agents and steering contracts. |
| `SpawnPointProvider`, `RectScatterSpawnProvider` | Engine | Spawn location seam; lane spawners remain pluggable. |

## Module Classification

| Candidate module or responsibility | Boundary owner | Extraction decision |
| --- | --- | --- |
| `Game` orchestrator | Engine core | Own the rAF loop, start/stop/pause state, update ordering, and top-level disposal. Game supplies a `GameDefinition`. |
| `GameContext` base | Engine core | Own shared renderer, scene, clock, camera rig, bounds, system registry, event cleanup, and resource lifetime helpers. Game extends with typed content and HUD state. |
| `GameSystems` registry | Engine core | Own deterministic lifecycle hooks: `init`, `update`, optional `fixedUpdate`, optional `render`, and `dispose`. Game registers systems in order. |
| rAF loop and dispose discipline | Engine core | One shared loop implementation. Games must not create parallel loops for normal gameplay. |
| `RenderSystem` | Engine core | Own renderer setup, resize, scene render, lighting hooks, camera rig update, and render-pass ordering. Game supplies theme, scene content, and postprocess choices. |
| `ArenaSystem` | Engine core plus game data | Engine owns map schema, bounds resolution, obstacle collider registration, theme application, and spawn-blocking queries. Game owns authored `data/maps.ts` content and biome-specific set dressing. |
| Map and theme schemas | Engine core | Engine owns serializable schema types and validators. Games own concrete map records, names, encounter layout, and canon text. |
| `InputSystem` | Engine embodied-base | Engine owns DOM listeners, movement intent, pointer/mouse event forwarding, resize forwarding, and cleanup. Game owns active-state policy, capture prompts, and action verb mapping. |
| `HudSystem` | Engine core | Engine owns a typed snapshot/listener bridge only. React components, copy, layout, colors, animation, and game-specific HUD visuals stay game-side. |
| `FxSystem` | Engine core plus game definitions | Engine owns pooling, TTL, transforms, material lifecycle, and generic emit/update contracts. Game owns effect definitions, palette, sound coupling, and lore-specific VFX meaning. |
| `ProjectilesSystem` | Engine core plus game definitions | Engine owns generic projectile instances, movement, bounds culling, collision callbacks, and disposal. Game owns projectile definitions, damage, status effects, faction rules, meshes/sprites, and hit policy. |
| `PickupsSystem` | Engine core plus game definitions | Engine owns pickup instance lifecycle, proximity checks, despawn, and collection callbacks. Game owns pickup definitions, economy, audio, UI messaging, and balancing. |
| PartyKit transport | Engine net seam | Engine owns optional PartySocket wrapping, host resolution, connection lifecycle, replicated transform/presence base messages, and pluggable codec hooks. Game owns payload types such as weapon fire, hits, objectives, score, and revive/co-op rules. |
| Remote avatar rendering | Engine core plus game skinning | Engine owns transform interpolation, presence lifecycle, and attach points. Game owns model/sprite selection, team/faction styling, nameplates, and combat readability rules. |
| `WeaponSystem` | Game content | Scourge Survivors owns weapons, fire modes, recoil, reloads, muzzle flashes, first-person presentation, and balance. Extract only generic projectile/Fx seams it consumes. |
| `WEAPONS` table | Game content | Concrete content data remains in Scourge Survivors. |
| Enemy stats and enemy definitions | Game content | Keep all Scourge host families, stats, attack cadence, silhouettes, and canon language game-side. Engine may receive generic agent definitions. |
| `PveDirectorSystem` | Game content for now | Current wave pacing, breach pressure, encounter phases, spawn budgets, and difficulty curve belong to Scourge Survivors. A later generic director can be extracted only after two games share the same abstraction. |
| `SurvivorsSystem` | Game content | Co-op/revive/class behavior belongs to Scourge Survivors. Engine net seams can carry typed survivor payloads without knowing class rules. |
| `data/maps.ts` content | Game content | Authored maps, encounter names, lane meanings, faction framing, and Warline operation context stay in the game. Engine owns only schema and loader contracts. |
| `constants.ts` tunables | Game content unless geometry-generic | Speeds, damage, cooldowns, health, wave counts, pickup cadence, and UI timings stay game-side. Engine may own neutral defaults for bounds, epsilon values, and lifecycle intervals. |
| `HUD.tsx` visuals | Game content | React shell and visuals stay game-side. Engine emits typed HUD snapshots and subscribable state changes. |
| Audio | Game content | Audio assets, mix rules, music, stingers, VO, and lore tone stay in the game. Engine can expose event hooks only. |

## Proposed Package Surface

The runtime extraction should preserve the current root export while growing
around typed seams:

```ts
export interface GameDefinition<TContent, THud, TNetIn = never, TNetOut = never> {
  id: string
  createContent(): TContent
  createSystems(ctx: GameContext<TContent, THud, TNetIn, TNetOut>): GameSystem[]
  createHudSnapshot(ctx: GameContext<TContent, THud, TNetIn, TNetOut>): THud
}

export interface GameSystem {
  init?(): void
  update?(delta: number): void
  fixedUpdate?(step: number): void
  render?(): void
  dispose?(): void
}
```

Target exports for later implementation:

- `createGame`, `Game`, `GameContext`, `GameDefinition`, `GameSystem`
- `GameSystems` registry and lifecycle helpers
- `RenderSystem`, `ArenaSystem`, `HudSystem`
- `MapBounds`, `ArenaMap`, `MapObstacle`, `MapTheme`, `MapLight`
- `FxSystem`, `ProjectilesSystem`, `PickupsSystem`
- optional net seam: `PartyTransport`, `PresenceState`, `RemoteAvatar`

## Required Extension Points

Every extracted module must expose a seam where the game can provide product
logic without forking engine code:

| Extension point | Game supplies | Engine guarantees |
| --- | --- | --- |
| `CameraRigPreset` | FPS, orbit, isometric, or runner camera choice | Systems read `body`, `facing`, `pickRay`, and `groundPoint` consistently. |
| `GameContent` | weapons, enemies, pickups, audio ids, authored maps | Engine treats content as opaque typed data. |
| `MapProvider` | selected map record and game set dressing | Engine resolves bounds, obstacles, colliders, and lights. |
| `SpawnPointProvider` | arena scatter, lane mouths, scripted spawns | Systems ask for spawn points without knowing the genre. |
| `ActionMap` | key bindings to game verbs | Input movement and DOM cleanup remain shared. |
| `HudSnapshot` | typed HUD state | Engine publishes snapshots without React dependency. |
| `ProjectileDefinition` | damage, visuals, faction/team, hit policy | Engine advances instances and calls collision callbacks. |
| `PickupDefinition` | collect effect, UI message, audio cue | Engine handles proximity and lifecycle. |
| `FxDefinition` | materials, palette, sprites, semantic meaning | Engine handles pooling and disposal. |
| `NetworkCodec` | game payload encode/decode and authorization policy | Transport owns connection lifecycle and base presence. |

## Extraction Sequence

1. Add lifecycle types and `GameSystems` with tests against disposable systems.
2. Extract `GameContext` and `Game` rAF loop without moving game content.
3. Move render/resize/camera update into `RenderSystem`.
4. Move bounds, obstacles, map schema, and collider registration into
   `ArenaSystem`; leave authored maps in the game.
5. Rewire Scourge Survivors to consume engine `InputSystem`, camera rig,
   bounds, spawn provider, and lifecycle registry.
6. Extract generic `FxSystem`, `ProjectilesSystem`, and `PickupsSystem` only
   after their definitions are parameterized by game-provided content.
7. Extract the optional PartyKit transport behind typed payload codecs; keep
   co-op, hit, revive, and scoring rules in Scourge Survivors.
8. Add a second consumer before promoting any PVE director abstraction out of
   Scourge Survivors.

## Verification Gates For Follow-Up PRs

Each extraction PR should run the narrow package checks plus at least one game
consumer check:

```bash
cd packages/engine && bun run typecheck
bun run typecheck
```

When the Deadrot game checkout is present, also run the Scourge Survivors build
and an interactive smoke check covering:

- pointer capture, pause/resume, resize, and disposal
- movement, spawn, projectile collision, pickup collection, and HUD updates
- multiplayer connect/disconnect when PartyKit transport is touched

## Acceptance Mapping

- Issue #8 asks for a module audit: see "Module Classification".
- It asks for the package surface: see "Proposed Package Surface".
- It asks for extension points: see "Required Extension Points".
- It says no code yet: this document defines the boundary without moving runtime
  systems or changing gameplay.
