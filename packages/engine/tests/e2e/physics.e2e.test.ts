/**
 * End-to-end physics seam test: the real `Agent` base class, the real
 * `RectBounds` world bounds, and a real Rapier world all driven through
 * `PhysicsSystem` exactly as a game loop would — agents steered by velocity,
 * stopped at walls by colliders (not a manual clamp), colliding with each other,
 * and integrated on a fixed timestep that is independent of the frame rate.
 */
import { afterAll, expect, test } from 'bun:test'
import * as THREE from 'three'

import { Agent } from '../../src/agents/Agent'
import { PhysicsSystem } from '../../src/physics/PhysicsSystem'
import { ensureRapier } from '../../src/physics/rapier'
import { RectBounds } from '../../src/world/bounds'

const rapier = await ensureRapier()

/** A concrete embodied agent: a body in the 3D world whose XZ is physics-driven. */
class Husk extends Agent {
  private readonly pos: THREE.Vector3

  constructor(x: number, z: number, height = 1) {
    super()
    this.pos = new THREE.Vector3(x, height, z)
    this.alive = true
    this.radius = 0.5
    this.speed = 6
  }

  get position(): THREE.Vector3 {
    return this.pos
  }
}

const ARENA_HALF = 20

/** Drive a single agent straight at the east (+x) wall and return its rest x. */
function driveIntoEastWall(opts: { walls: boolean; deltas: number[] }): { x: number; z: number; y: number } {
  const physics = new PhysicsSystem(rapier)
  try {
    const bounds = RectBounds.square(ARENA_HALF)
    if (opts.walls) physics.addBoundsWalls(bounds)
    const husk = new Husk(0, 0)
    const binding = physics.attachAgent(husk)
    for (const dt of opts.deltas) {
      binding.drive({ x: husk.speed, z: 0 })
      physics.step(dt)
    }
    return { x: husk.position.x, y: husk.position.y, z: husk.position.z }
  } finally {
    physics.dispose()
  }
}

afterAll(() => {
  // Rapier worlds are freed per-scenario via dispose(); nothing global to tear down.
})

test('an agent is stopped at the bounds wall by a collider, not by a clamp', () => {
  const steady = Array.from({ length: 600 }, () => 1 / 60) // 10s at 60fps

  const walled = driveIntoEastWall({ walls: true, deltas: steady })
  const open = driveIntoEastWall({ walls: false, deltas: steady })

  // With walls, the collider halts the body just inside the arena (~maxX - radius).
  expect(walled.x).toBeLessThan(ARENA_HALF)
  expect(walled.x).toBeGreaterThan(ARENA_HALF - 1.5)
  expect(RectBounds.square(ARENA_HALF).containsXZ(walled.x, walled.z)).toBe(true)
  expect(walled.y).toBe(1) // height is never touched by the planar sim

  // Without walls the same drive sails straight past the boundary — proving the
  // stop above was the collider, not a coordinate clamp baked into the system.
  expect(open.x).toBeGreaterThan(ARENA_HALF)
})

test('the fixed-timestep sim settles to the same place at any (jittery) frame rate', () => {
  const steady = Array.from({ length: 720 }, () => 1 / 60) // 12s @ steady 60fps

  // A deterministic but wildly irregular frame cadence summing past 12s.
  const cadence = [1 / 30, 1 / 144, 1 / 60, 1 / 90, 1 / 45, 1 / 240, 1 / 75]
  const jittery: number[] = []
  let elapsed = 0
  let i = 0
  while (elapsed < 12) {
    const dt = cadence[i % cadence.length]!
    jittery.push(dt)
    elapsed += dt
    i++
  }

  const a = driveIntoEastWall({ walls: true, deltas: steady })
  const b = driveIntoEastWall({ walls: true, deltas: jittery })

  // Both pin against the same wall face; the resting position is set by geometry
  // and the fixed step, not by how the wall-clock time was sliced into frames.
  expect(a.x).toBeCloseTo(b.x, 2)
  expect(a.z).toBeCloseTo(b.z, 2)
  expect(Math.abs(a.x - b.x)).toBeLessThan(0.05)
})

test('two agents driven into each other collide and never overlap', () => {
  const physics = new PhysicsSystem(rapier)
  try {
    physics.addBoundsWalls(RectBounds.square(ARENA_HALF))
    const west = new Husk(-6, 0)
    const east = new Husk(6, 0)
    const wb = physics.attachAgent(west)
    const eb = physics.attachAgent(east)

    for (let frame = 0; frame < 600; frame++) {
      wb.drive({ x: west.speed, z: 0 }) // east-bound
      eb.drive({ x: -east.speed, z: 0 }) // west-bound
      physics.step(1 / 60)
    }

    const gap = Math.hypot(west.position.x - east.position.x, west.position.z - east.position.z)
    // radii sum to 1.0; the contact solver must keep them from interpenetrating
    expect(gap).toBeGreaterThanOrEqual(0.9)
    // they met somewhere in the middle rather than passing through each other
    expect(west.position.x).toBeLessThan(east.position.x)
  } finally {
    physics.dispose()
  }
})

test('a walled arena contains a whole swarm pushed outward', () => {
  const physics = new PhysicsSystem(rapier)
  try {
    const bounds = RectBounds.square(ARENA_HALF)
    physics.addBoundsWalls(bounds)

    const swarm = [
      new Husk(0, 0),
      new Husk(3, -2),
      new Husk(-4, 1),
      new Husk(2, 5),
      new Husk(-3, -5),
    ]
    const bindings = swarm.map((h) => physics.attachAgent(h))
    expect(physics.agentCount).toBe(swarm.length)

    // every agent sprints toward its nearest corner; walls + mutual collision keep them in
    const corners = [
      { x: 1, z: 1 },
      { x: -1, z: 1 },
      { x: 1, z: -1 },
      { x: -1, z: -1 },
      { x: 1, z: -1 },
    ]
    for (let frame = 0; frame < 720; frame++) {
      bindings.forEach((b, idx) => {
        const c = corners[idx]!
        b.drive({ x: c.x * swarm[idx]!.speed, z: c.z * swarm[idx]!.speed })
      })
      physics.step(1 / 60)
    }

    for (const husk of swarm) {
      expect(bounds.containsXZ(husk.position.x, husk.position.z)).toBe(true)
    }
  } finally {
    physics.dispose()
  }
})
