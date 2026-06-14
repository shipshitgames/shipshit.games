import { beforeAll, describe, expect, test } from 'bun:test'

import { RectBounds } from '../world/bounds'
import { PhysicsSystem, type PhysicsAgentLike } from './PhysicsSystem'
import { ensureRapier, type RapierModule } from './rapier'

let rapier: RapierModule

beforeAll(async () => {
  rapier = await ensureRapier()
})

/** A minimal {@link PhysicsAgentLike} backed by a plain mutable position. */
function makeAgent(x: number, z: number, radius = 0.5, y = 1.8): PhysicsAgentLike {
  return { position: { x, y, z }, radius }
}

function distance(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

describe('ensureRapier', () => {
  test('memoises a single WASM init', async () => {
    const a = await ensureRapier()
    const b = await ensureRapier()
    expect(a).toBe(b)
    expect(typeof a.World).toBe('function')
  })
})

describe('PhysicsSystem construction', () => {
  test('applies defaults: 1/60 step, 5 sub-steps, zero gravity', () => {
    const physics = new PhysicsSystem(rapier)
    try {
      expect(physics.fixedTimeStep).toBeCloseTo(1 / 60, 10)
      expect(physics.maxSubSteps).toBe(5)
      // world.timestep round-trips through Rapier's f32 WASM, so tolerate f32 precision
      expect(physics.world.timestep).toBeCloseTo(1 / 60, 5)
      expect(physics.world.gravity.x).toBe(0)
      expect(physics.world.gravity.y).toBe(0)
      expect(physics.bodyCount).toBe(0)
      expect(physics.agentCount).toBe(0)
    } finally {
      physics.dispose()
    }
  })

  test('honours overrides and maps planar gravity z -> rapier y', () => {
    const physics = new PhysicsSystem(rapier, {
      gravity: { x: 2, z: 9.81 },
      fixedTimeStep: 1 / 120,
      maxSubSteps: 8,
    })
    try {
      expect(physics.fixedTimeStep).toBeCloseTo(1 / 120, 10)
      expect(physics.maxSubSteps).toBe(8)
      expect(physics.world.gravity.x).toBeCloseTo(2, 6)
      expect(physics.world.gravity.y).toBeCloseTo(9.81, 6)
    } finally {
      physics.dispose()
    }
  })

  test('static create() awaits init and builds a usable system', async () => {
    const physics = await PhysicsSystem.create({ fixedTimeStep: 1 / 50 })
    try {
      expect(physics).toBeInstanceOf(PhysicsSystem)
      expect(physics.fixedTimeStep).toBeCloseTo(1 / 50, 10)
    } finally {
      physics.dispose()
    }
  })
})

describe('bodies and colliders', () => {
  test('reports body position on the world XZ plane and tracks count', () => {
    const physics = new PhysicsSystem(rapier)
    try {
      const body = physics.createBody({
        position: { x: 3, z: -4 },
        shape: { kind: 'ball', radius: 0.5 },
        userData: 'husk-7',
      })
      expect(physics.bodyCount).toBe(1)
      expect(body.position.x).toBeCloseTo(3, 6)
      expect(body.position.z).toBeCloseTo(-4, 6)
      expect(body.userData).toBe('husk-7')
      expect(body.handle).toBeGreaterThanOrEqual(0)
    } finally {
      physics.dispose()
    }
  })

  test('velocity and impulse drive a dynamic body; setPosition teleports it', () => {
    const physics = new PhysicsSystem(rapier)
    try {
      const body = physics.createBody({
        position: { x: 0, z: 0 },
        shape: { kind: 'ball', radius: 0.5 },
      })
      body.setVelocity({ x: 3, z: 0 })
      expect(body.velocity.x).toBeCloseTo(3, 4)
      for (let i = 0; i < 30; i++) physics.step(1 / 60)
      expect(body.position.x).toBeGreaterThan(0.5)

      body.setPosition({ x: -7, z: 2 })
      expect(body.position.x).toBeCloseTo(-7, 4)
      expect(body.position.z).toBeCloseTo(2, 4)
    } finally {
      physics.dispose()
    }
  })

  test('a fixed body ignores impulses', () => {
    const physics = new PhysicsSystem(rapier)
    try {
      const wall = physics.createBody({
        kind: 'fixed',
        position: { x: 5, z: 0 },
        shape: { kind: 'cuboid', halfX: 0.5, halfZ: 5 },
      })
      wall.applyImpulse({ x: 100, z: 100 })
      for (let i = 0; i < 60; i++) physics.step(1 / 60)
      expect(wall.position.x).toBeCloseTo(5, 6)
      expect(wall.position.z).toBeCloseTo(0, 6)
    } finally {
      physics.dispose()
    }
  })

  test('applyImpulse maps both planar axes (and sign) onto a moving dynamic body', () => {
    const physics = new PhysicsSystem(rapier)
    try {
      // +z impulse must displace along world z only — pins the z->rapier.y mapping
      // on a body that actually moves (a fixed body would hide a swapped axis).
      const alongZ = physics.createBody({
        position: { x: 0, z: 0 },
        shape: { kind: 'ball', radius: 0.5 },
        linearDamping: 0,
      })
      alongZ.applyImpulse({ x: 0, z: 5 })
      for (let i = 0; i < 30; i++) physics.step(1 / 60)
      expect(alongZ.position.z).toBeGreaterThan(0.2)
      expect(alongZ.velocity.z).toBeGreaterThan(0)
      expect(Math.abs(alongZ.position.x)).toBeLessThan(0.05)

      // symmetric +x impulse pins the other axis and its sign
      const alongX = physics.createBody({
        position: { x: 0, z: 0 },
        shape: { kind: 'ball', radius: 0.5 },
        linearDamping: 0,
      })
      alongX.applyImpulse({ x: 5, z: 0 })
      for (let i = 0; i < 30; i++) physics.step(1 / 60)
      expect(alongX.position.x).toBeGreaterThan(0.2)
      expect(Math.abs(alongX.position.z)).toBeLessThan(0.05)
    } finally {
      physics.dispose()
    }
  })

  test('two overlapping dynamic bodies collide and resolve apart', () => {
    const physics = new PhysicsSystem(rapier)
    try {
      const left = physics.createBody({
        position: { x: -0.3, z: 0 },
        shape: { kind: 'ball', radius: 0.5 },
        linearDamping: 2,
      })
      const right = physics.createBody({
        position: { x: 0.3, z: 0 },
        shape: { kind: 'ball', radius: 0.5 },
        linearDamping: 2,
      })
      // start overlapping (centres 0.6 apart, radii sum 1.0)
      expect(distance(left.position, right.position)).toBeLessThan(1)
      for (let i = 0; i < 300; i++) physics.step(1 / 60)
      // the contact solver must push them out of overlap
      expect(distance(left.position, right.position)).toBeGreaterThanOrEqual(0.9)
      expect(left.position.x).toBeLessThan(-0.3)
      expect(right.position.x).toBeGreaterThan(0.3)
    } finally {
      physics.dispose()
    }
  })

  test('gravity accelerates a dynamic body along +z', () => {
    const physics = new PhysicsSystem(rapier, { gravity: { x: 0, z: 12 } })
    try {
      const body = physics.createBody({
        position: { x: 0, z: 0 },
        shape: { kind: 'ball', radius: 0.5 },
      })
      for (let i = 0; i < 30; i++) physics.step(1 / 60)
      expect(body.position.z).toBeGreaterThan(0.2)
      expect(body.velocity.z).toBeGreaterThan(0)
    } finally {
      physics.dispose()
    }
  })

  test('removeBody and clear release bodies', () => {
    const physics = new PhysicsSystem(rapier)
    try {
      const a = physics.createBody({ position: { x: 0, z: 0 }, shape: { kind: 'ball', radius: 0.5 } })
      physics.createBody({ position: { x: 1, z: 0 }, shape: { kind: 'ball', radius: 0.5 } })
      expect(physics.bodyCount).toBe(2)
      physics.removeBody(a)
      expect(physics.bodyCount).toBe(1)
      physics.removeBody(a) // idempotent
      expect(physics.bodyCount).toBe(1)
      physics.clear()
      expect(physics.bodyCount).toBe(0)
    } finally {
      physics.dispose()
    }
  })

  test('dispose is idempotent — a second call is a safe no-op', () => {
    const physics = new PhysicsSystem(rapier)
    physics.createBody({ position: { x: 0, z: 0 }, shape: { kind: 'ball', radius: 0.5 } })
    physics.dispose()
    // Rapier's World.free() throws if called twice; the guard makes repeat
    // dispose() (explicit teardown + effect-cleanup, finally blocks) safe.
    expect(() => physics.dispose()).not.toThrow()
  })
})

describe('fixed timestep decoupling from frame rate', () => {
  test('runs one fixed sub-step per banked fixedTimeStep, carrying the remainder', () => {
    const physics = new PhysicsSystem(rapier)
    try {
      expect(physics.step(1 / 120)).toBe(0) // less than one fixed step: bank it
      expect(physics.step(1 / 120)).toBe(1) // now a whole 1/60 has accrued
      expect(physics.step(1 / 60)).toBe(1)
    } finally {
      physics.dispose()
    }
  })

  test('clamps to maxSubSteps so a long pause cannot spiral', () => {
    const physics = new PhysicsSystem(rapier, { maxSubSteps: 5 })
    try {
      expect(physics.step(100)).toBe(5)
      // accumulator was clamped, not banked — the next normal frame is normal
      expect(physics.step(1 / 60)).toBe(1)
    } finally {
      physics.dispose()
    }
  })

  test('a non-finite frameDelta is dropped, not banked — the sim never dead-freezes', () => {
    const physics = new PhysicsSystem(rapier)
    try {
      expect(physics.step(NaN)).toBe(0) // garbage delta runs no steps...
      expect(physics.step(Infinity)).toBe(0) // ...and does not poison the accumulator
      // a normal frame after the bad ones still accrues and steps as usual
      expect(physics.step(1 / 60)).toBe(1)
      expect(physics.step(1 / 60)).toBe(1)
    } finally {
      physics.dispose()
    }
  })

  test('identical simulation regardless of how a second of time is sliced', () => {
    const run = (slices: number, dt: number): { x: number; z: number } => {
      const physics = new PhysicsSystem(rapier)
      try {
        const body = physics.createBody({
          position: { x: 0, z: 0 },
          shape: { kind: 'ball', radius: 0.5 },
          linearDamping: 1.5, // makes the path depend on the integration, not just v*t
        })
        body.setVelocity({ x: 6, z: 0 })
        let steps = 0
        for (let i = 0; i < slices; i++) steps += physics.step(dt)
        expect(steps).toBe(60) // every slicing banks exactly one simulated second
        return { ...body.position }
      } finally {
        physics.dispose()
      }
    }

    const at60 = run(60, 1 / 60)
    const at30 = run(30, 1 / 30)
    const at120 = run(120, 1 / 120)
    expect(at30.x).toBeCloseTo(at60.x, 4)
    expect(at120.x).toBeCloseTo(at60.x, 4)
    expect(at60.x).toBeGreaterThan(0)
  })
})

describe('agent bridge', () => {
  test('drives a bound agent transform and preserves height (y)', () => {
    const physics = new PhysicsSystem(rapier)
    try {
      const agent = makeAgent(0, 0, 0.5, 1.8)
      const binding = physics.attachAgent(agent)
      expect(physics.agentCount).toBe(1)
      binding.drive({ x: 4, z: 0 })
      for (let i = 0; i < 40; i++) physics.step(1 / 60)
      expect(agent.position.x).toBeGreaterThan(0.5)
      expect(agent.position.y).toBe(1.8) // height untouched by the planar sim
    } finally {
      physics.dispose()
    }
  })

  test('an agent stops at a bounds wall via the collider, not a clamp', () => {
    const physics = new PhysicsSystem(rapier)
    try {
      const bounds = RectBounds.square(10)
      physics.addBoundsWalls(bounds)
      expect(physics.bodyCount).toBe(4)

      const agent = makeAgent(0, 0, 0.5)
      const binding = physics.attachAgent(agent)
      // shove east into the wall for a few seconds of simulated time
      for (let i = 0; i < 600; i++) {
        binding.drive({ x: 8, z: 0 })
        physics.step(1 / 60)
      }
      // the collider halts the body short of maxX (10) at roughly maxX - radius
      expect(agent.position.x).toBeLessThan(bounds.maxX)
      expect(agent.position.x).toBeGreaterThan(bounds.maxX - 1.5)
      expect(bounds.containsXZ(agent.position.x, agent.position.z)).toBe(true)
      expect(Math.abs(agent.position.z)).toBeLessThan(0.5)
    } finally {
      physics.dispose()
    }
  })

  test('detachAgent removes the binding and its body', () => {
    const physics = new PhysicsSystem(rapier)
    try {
      const binding = physics.attachAgent(makeAgent(0, 0))
      expect(physics.agentCount).toBe(1)
      expect(physics.bodyCount).toBe(1)
      physics.detachAgent(binding)
      expect(physics.agentCount).toBe(0)
      expect(physics.bodyCount).toBe(0)
    } finally {
      physics.dispose()
    }
  })

  test('removeBody on a bound agent drops the binding and leaves step() safe', () => {
    const physics = new PhysicsSystem(rapier)
    try {
      const agent = makeAgent(2, 0, 0.5, 1.8)
      const binding = physics.attachAgent(agent)
      expect(physics.agentCount).toBe(1)
      expect(physics.bodyCount).toBe(1)

      // remove the bound body DIRECTLY (not via detachAgent) — this is the only
      // path that exercises removeBody's binding-cleanup loop
      physics.removeBody(binding.body)
      expect(physics.agentCount).toBe(0)
      expect(physics.bodyCount).toBe(0)

      // the next step must not touch the freed body and must no longer write the
      // now-detached agent's transform
      const frozen = { ...agent.position }
      expect(() => physics.step(1 / 60)).not.toThrow()
      expect(agent.position.x).toBe(frozen.x)
      expect(agent.position.z).toBe(frozen.z)
    } finally {
      physics.dispose()
    }
  })

  test('a kinematic agent is not blocked by a wall it is driven through', () => {
    const physics = new PhysicsSystem(rapier)
    try {
      physics.addBoundsWalls(RectBounds.square(5))
      const agent = makeAgent(0, 0, 0.5)
      const binding = physics.attachAgent(agent, { kind: 'kinematic' })
      for (let i = 0; i < 120; i++) {
        binding.drive({ x: 6, z: 0 })
        physics.step(1 / 60)
      }
      // kinematic bodies push through static geometry rather than colliding to a stop
      expect(agent.position.x).toBeGreaterThan(5)
    } finally {
      physics.dispose()
    }
  })
})
