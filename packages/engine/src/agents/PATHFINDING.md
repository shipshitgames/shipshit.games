# Pathfinding: grid A\* over the existing steering substrate

Issue: shipshitgames/shipshit.games#77 — "Yuka navmesh vs. recastnavigation vs. grid-A\*"
Status: accepted; implemented in this PR (`src/agents/pathfinding.ts`)
Last updated: 2026-06-14

## Context

Engine arenas are top-down tile grids: an `ArenaSystem` exposes rectangular
`WorldBounds` plus a flat list of rect/circle obstacles, and answers two point
queries — `bounds.containsXZ(x, z, margin)` and `isBlockedXZ(x, z, margin)`.

Embodied NPCs already move through a hand-rolled kinematic substrate. `Agent`
(`src/agents/Agent.ts`) owns the motion state and the reusable primitives
(boids-style `separation`, `applyKnockback`); a pluggable `SteeringStrategy`
(`src/agents/steering.ts`) reads a `SteerView` (distance + normalised direction
to a target) and writes a desired planar velocity. Strategies like a chaser or a
lane-walker work by pointing the agent straight at the player or the core.

That straight-line intent has no awareness of walls — agents push into obstacles
and wedge against corners. We need to route *around* blocking geometry without
discarding the steering work (separation, knockback, arrive) that already exists.

## Decision

Adopt a **dependency-free grid A\*** (this PR). The flow:

1. `bakeNavGrid(arena, { cellSize, agentRadius })` rasterises the arena's
   bounds + obstacles into a row-major walkability bitmap. A cell is walkable iff
   its centre is inside the bounds **and** clear of every blocking obstacle, with
   both the bounds and the obstacles **inflated by `agentRadius`** — so the grid
   only reports cells the agent's footprint physically fits in.
2. `findPath(grid, start, goal)` runs deterministic A\* over that grid and returns
   world-space waypoints (optionally string-pulled by `smoothPath`).
3. A `PathFollower` walks the waypoint list and emits a `SteerView` toward the
   active waypoint — **the exact shape the steering layer already consumes**.

So pathfinding does **not** add a second movement system. It feeds the *existing*
steering: a path simply swaps "look at the player" for "look at the next corner,"
and every kinematic primitive (separation, knockback, arrive) is untouched.

We do **not** pull in [Yuka](https://mugen87.github.io/yuka/) or
[recast-navigation-js](https://github.com/isaac-mason/recast-navigation-js).

## Why

- **The arenas are top-down tile grids.** Walkability is a 2D point query against
  AABB/circle obstacles. A navmesh — polygon decomposition, off-mesh links, agent
  crowds — is solving a 3D problem we don't have. Rasterising to a grid is a
  near-exact model of the actual geometry.
- **Zero new runtime dependency.** The engine is pure-sim with `three` as its only
  (peer) dependency. `pathfinding.ts` imports *types* from `three` and nothing
  else — no randomness, no wall-clock reads, fully deterministic, guaranteed to
  terminate (closed set + node-expansion cap). Pulling Yuka or the recast WASM
  bundle would break that pure, peerDep-only profile and bloat consumers.
- **No competing movement systems.** Yuka and recast crowds want to *own* agent
  motion (their own velocities, avoidance, local steering). We already have that
  layer. Drawing the seam cleanly — pathfinding owns **WHERE** (waypoints),
  steering owns **HOW** (kinematics, separation, knockback) — avoids two engines
  fighting over the same transform.
- **The upgrade path stays open.** If a title ships true 3D traversal, multi-floor
  levels, ramps, or jump links, a navmesh becomes the right tool. Yuka (pure JS,
  lighter) or recast-navigation-js (WASM, industry-grade recast/detour) are the
  documented escalation — and because consumers only touch waypoints + `SteerView`,
  swapping the *WHERE* producer leaves the steering layer unchanged.

## Comparison

| | grid A\* (this PR) | Yuka navmesh | recast-navigation-js |
| --- | --- | --- | --- |
| New runtime dep | none (types-only `three`) | one JS lib | one lib + WASM bundle |
| Fit for top-down tile arenas | native — grid *is* the geometry | overkill — polygon mesh for a grid world | overkill — 3D recast pipeline |
| Complexity | one self-contained file, deterministic | mesh authoring/bake + crowd API | navmesh build + WASM lifecycle |
| Owns agent motion? | no — feeds existing steering | yes — its own steering/crowd | yes — detour crowd |
| When to switch | — | lightweight 3D / sloped levels | complex 3D, off-mesh links, big crowds |

## Public API

All re-exported from the package root (`@shipshitgames/engine`):

- `NavGrid` — baked immutable walkability grid; `worldToCell`, `cellCenter`,
  `isWalkable`, `nearestWalkable`.
- `bakeNavGrid(source, options?)` — build a `NavGrid` from an `ArenaSystem` or a
  plain `ArenaMap`. `NavGridOptions`: `cellSize` (default 1), `agentRadius`
  (default 0).
- `findPath(grid, start, goal, options?)` — deterministic A\* → `PathResult`
  (`found`, world-space `waypoints`, raw `cells`, `length`). `FindPathOptions`:
  `diagonal` (default true, corner-safe), `snapToWalkable` (default true),
  `smooth` (default true), `maxExpansions`.
- `smoothPath(grid, waypoints)` — greedy string-pull via line-of-sight; collapses
  collinear/visible waypoints without crossing a blocked cell.
- `hasLineOfSight(grid, a, b)` — visibility test the `smoothPath` primitive is
  built on. Two layers: a supercover/DDA cell walk (corner-safe, never tunnels a
  blocked corner) **and** an exact continuous check against the inflated
  obstacle/bounds geometry, so a chord can't clip the part of an inflated obstacle
  that bulges across an otherwise-walkable (centre-clear) cell.
- `PathFollower` — cursor over a waypoint list. `update(position)` advances past
  reached waypoints (within `arriveRadius`, default 0.5) and returns a `SteerView`
  toward the active one; `done`, `target()`, `setPath()`.
- `steerViewToWaypoint(from, to)` — adapter that builds the `SteerView` (distance +
  normalised direction) a waypoint feeds into steering.

### Usage

```ts
import { bakeNavGrid, findPath, PathFollower } from '@shipshitgames/engine'

const grid = bakeNavGrid(arena, { cellSize: 1, agentRadius: agent.radius })
const path = findPath(grid, agent.position, target)
const follower = new PathFollower(path.waypoints, { arriveRadius: 0.5 })

// per frame: path picks WHERE, steering decides HOW
const view = follower.update(agent.position) // SteerView toward the next waypoint
strategy.desiredVelocity(agent, view, out) // existing SteeringStrategy, unchanged
// agent then integrates `out` on top of separation + knockback as before
```

## The steering / pathfinding boundary

Keep these two layers separate; do not reinvent movement on either side.

- **Pathfinding owns WHERE.** Static graph search over baked geometry → a list of
  waypoints. No kinematics, no per-agent state beyond the `PathFollower` cursor.
- **Steering owns HOW.** `SteeringStrategy` + `Agent` turn a `SteerView` into
  motion — speed, separation, knockback, arrive. They never read the grid.
- **`SteerView` is the only contract between them.** Whether the direction comes
  from "chase the player" or "head to the next corner," steering can't tell. That
  is what lets the *WHERE* producer (grid A\* today, a navmesh later) be swapped
  without touching the *HOW*.

New navigation work belongs on the WHERE side (better baking, hierarchical or
flow-field search, dynamic obstacle rebakes). New motion behaviour belongs on the
HOW side (new `SteeringStrategy` implementations). Nothing should grow a parallel
mover that bypasses `SteerView`.
