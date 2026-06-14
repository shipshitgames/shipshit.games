/**
 * End-to-end pathfinding seam test (issue #77): a real embodied agent paths
 * AROUND a wall to a target in a sample arena — not just steering straight into
 * it. Everything runs inside bun against the real engine code: bake a NavGrid
 * from an ArenaSystem, run grid-A* for waypoints, then drive a concrete Agent
 * each fixed timestep with a PathFollower feeding the same arrive-style steering
 * the kinematic substrate already uses, with hard wall collision in the loop.
 *
 * The acceptance criterion lives in the contrast between two otherwise identical
 * simulations:
 *   - PATHFINDING run: follow the A* waypoints → the agent rounds the wall's open
 *     end and REACHES the goal, never once standing inside blocking geometry.
 *   - CONTROL run: steer straight at the goal (ignore the path) → with the same
 *     collision the agent jams against the wall and NEVER reaches the goal.
 *
 * Fully deterministic: fixed dt, no randomness, no wall-clock reads.
 */
import { expect, test } from 'bun:test'
import type * as THREE from 'three'

import { Agent, type PlanarVec } from '../../src/agents/Agent'
import type { SteerView } from '../../src/agents/steering'
import { bakeNavGrid, findPath, PathFollower } from '../../src/agents/pathfinding'
import { ArenaSystem, type ArenaMap } from '../../src/world/map'
import { vec3, type MutableVec3Like } from '../../src/spatial'

// --- sample arena: a single long thin wall at x=0 spanning most of Z, but with
// an open gap at the negative-Z end so the only route from the left half to the
// right half is to round the wall's bottom. ---
const ARENA: ArenaMap = {
  id: 'pathfinding-e2e-arena',
  bounds: { kind: 'square', half: 10 },
  obstacles: [
    {
      kind: 'rect',
      id: 'divider-wall',
      x: 0,
      z: 2,
      width: 1, // thin in X (left edge -0.5, right edge +0.5)
      depth: 16, // spans z = -6 .. +10 (clamped by bounds), leaving a gap at z < -6
    },
  ],
}

const arena = new ArenaSystem(ARENA)

const START: PlanarVec = { x: -8, z: 0 }
const GOAL: PlanarVec = { x: 8, z: 0 }

const AGENT_RADIUS = 0.4
const DT = 1 / 60 // fixed timestep
const SPEED = 4 // metres/second
const STEP_CAP = 4000 // ~66 simulated seconds; ample for either route to finish
const GOAL_RADIUS = 0.6 // "reached" tolerance around the goal

/** A minimal concrete Agent: just a mutable planar body the sim can move + read. */
class Walker extends Agent {
  private readonly body: MutableVec3Like

  constructor(start: PlanarVec, radius: number) {
    super()
    this.alive = true
    this.radius = radius
    this.speed = SPEED
    this.body = vec3(start.x, 0, start.z)
  }

  // The kinematic substrate only ever reads x/z; a duck-typed vec satisfies it.
  get position(): THREE.Vector3 {
    return this.body as unknown as THREE.Vector3
  }
}

/** Arrive-style desired velocity toward the steering target (slows on the last metre). */
function arriveVelocity(view: SteerView, speed: number): PlanarVec {
  if (view.dist <= 0) return { x: 0, z: 0 }
  const slowing = 1
  const scale = view.dist < slowing ? view.dist / slowing : 1
  const v = speed * scale
  return { x: view.dirX * v, z: view.dirZ * v }
}

/**
 * Integrate one move with hard wall collision: try the full step; if it lands in
 * blocking geometry, try sliding along each axis independently; if both are
 * blocked, don't move. Guarantees the body never enters `isBlockedXZ`.
 */
function moveWithCollision(agent: Walker, vx: number, vz: number): void {
  const pos = agent.position
  const r = agent.radius
  const nx = pos.x + vx * DT
  const nz = pos.z + vz * DT
  if (!arena.isBlockedXZ(nx, nz, r) && arena.bounds.containsXZ(nx, nz, r)) {
    pos.x = nx
    pos.z = nz
    return
  }
  // Slide along X only.
  if (!arena.isBlockedXZ(nx, pos.z, r) && arena.bounds.containsXZ(nx, pos.z, r)) {
    pos.x = nx
    return
  }
  // Slide along Z only.
  if (!arena.isBlockedXZ(pos.x, nz, r) && arena.bounds.containsXZ(pos.x, nz, r)) {
    pos.z = nz
  }
  // Otherwise fully blocked: stay put this step.
}

interface SimResult {
  reached: boolean
  steps: number
  clipped: boolean // ever stood inside blocking geometry?
}

/**
 * Run the fixed-step sim. `desiredView(pos)` yields the steering view for this
 * frame — either the PathFollower's view toward the next waypoint, or a straight
 * shot at the goal for the control case.
 */
function simulate(agent: Walker, desiredView: (pos: PlanarVec) => SteerView): SimResult {
  let clipped = false
  for (let step = 1; step <= STEP_CAP; step++) {
    const pos = agent.position
    if (Math.hypot(pos.x - GOAL.x, pos.z - GOAL.z) <= GOAL_RADIUS) {
      return { reached: true, steps: step, clipped }
    }
    const view = desiredView({ x: pos.x, z: pos.z })
    const vel = arriveVelocity(view, agent.speed)
    moveWithCollision(agent, vel.x, vel.z)
    if (arena.isBlockedXZ(agent.position.x, agent.position.z, agent.radius)) clipped = true
  }
  const pos = agent.position
  const reached = Math.hypot(pos.x - GOAL.x, pos.z - GOAL.z) <= GOAL_RADIUS
  return { reached, steps: STEP_CAP, clipped }
}

test('an agent paths around a wall to the target instead of steering straight into it', () => {
  // The wall genuinely separates start from goal along the straight line: the
  // segment z=0 from start to goal passes through blocking geometry.
  expect(arena.isBlockedXZ(0, 0, AGENT_RADIUS)).toBe(true)
  expect(arena.isBlockedXZ(START.x, START.z, AGENT_RADIUS)).toBe(false)
  expect(arena.isBlockedXZ(GOAL.x, GOAL.z, AGENT_RADIUS)).toBe(false)

  // --- bake the grid + plan a route around the wall ---
  const grid = bakeNavGrid(arena, { cellSize: 0.5, agentRadius: AGENT_RADIUS })
  const path = findPath(grid, START, GOAL)
  expect(path.found).toBe(true)
  expect(path.waypoints.length).toBeGreaterThanOrEqual(2)
  // first waypoint is the true start, last is the true goal
  expect(path.waypoints[0]).toEqual({ x: START.x, z: START.z })
  expect(path.waypoints[path.waypoints.length - 1]!).toEqual({ x: GOAL.x, z: GOAL.z })
  // a straight line is impossible, so the planned route must detour into the
  // open negative-Z end (some waypoint sits below the wall's bottom edge).
  const detours = path.waypoints.some((w) => w.z < -6)
  expect(detours).toBe(true)

  // --- PATHFINDING run: follow the waypoints ---
  const pathfinder = new Walker(START, AGENT_RADIUS)
  const follower = new PathFollower(path.waypoints, { arriveRadius: 0.5 })
  const pathRun = simulate(pathfinder, (pos) => follower.update(pos))

  // (1) the pathfinding-driven agent reaches the goal within the step cap
  expect(pathRun.reached).toBe(true)
  expect(pathRun.steps).toBeLessThan(STEP_CAP)
  // (2) it never once clipped a wall
  expect(pathRun.clipped).toBe(false)
  // and it actually arrived at the goal
  const end = pathfinder.position
  expect(Math.hypot(end.x - GOAL.x, end.z - GOAL.z)).toBeLessThanOrEqual(GOAL_RADIUS)

  // --- CONTROL run: same arena, same collision, but steer STRAIGHT at the goal
  // (ignore the path). This is the heart of the acceptance test: dumb steering
  // jams against the wall and never gets around it. ---
  const naive = new Walker(START, AGENT_RADIUS)
  const naiveRun = simulate(naive, (pos) => {
    const dx = GOAL.x - pos.x
    const dz = GOAL.z - pos.z
    const dist = Math.hypot(dx, dz)
    if (dist <= 0) return { dist: 0, dirX: 0, dirZ: 0 }
    return { dist, dirX: dx / dist, dirZ: dz / dist }
  })

  // the naive agent must NOT reach the goal within the same step cap...
  expect(naiveRun.reached).toBe(false)
  // ...because it stalled against the wall on the start side (never crossed x=0).
  expect(naive.position.x).toBeLessThan(0)
  // collision still held for the control run too: it never tunnelled into the wall
  expect(naiveRun.clipped).toBe(false)
})
