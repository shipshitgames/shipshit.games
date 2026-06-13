import type { Collider, RigidBody, World } from '@dimforge/rapier2d-compat'

import type { MutableVec3Like } from '../spatial'
import type { WorldBounds } from '../world/bounds'
import { ensureRapier, type RapierModule } from './rapier'

/**
 * Planar vector on the world **XZ** plane — the same ground plane the rest of the
 * engine moves on (`Agent`, `WorldBounds`, steering). Rapier is a 2D engine, so
 * the seam maps world `x → rapier.x` and world `z → rapier.y`; nothing outside
 * this module deals in Rapier's `(x, y)` so games stay in one coordinate space.
 */
export interface PlanarVec {
  x: number
  z: number
}

/** Rapier body class for a body the seam creates. */
export type BodyKind = 'dynamic' | 'fixed' | 'kinematic'

/** Collider geometry, in world units on the XZ plane. */
export type ColliderShape =
  | { kind: 'ball'; radius: number }
  | { kind: 'cuboid'; halfX: number; halfZ: number }

export interface BodySpec {
  /** Body class. Defaults to `'dynamic'`. */
  kind?: BodyKind
  /** Spawn position on the world XZ plane. */
  position: PlanarVec
  /** Collider geometry. */
  shape: ColliderShape
  /** Velocity drag (1/s); higher stops a body sooner once it is no longer driven. */
  linearDamping?: number
  /** Bounciness `0..1`. Defaults to `0` (no bounce) for grounded top-down play. */
  restitution?: number
  /** Surface friction. Defaults to `0`. */
  friction?: number
  /** Collider mass density. */
  density?: number
  /** Lock planar rotation so a body cannot spin. Defaults to `true` for dynamic bodies. */
  lockRotation?: boolean
  /** Opaque tag carried on the rigid body (e.g. the owning entity id). */
  userData?: unknown
}

/**
 * Handle to one rigid body + its collider. Created by {@link PhysicsSystem}; do
 * not construct directly. All positions/velocities are reported and accepted on
 * the world XZ plane.
 */
export class PhysicsBody {
  /** @internal — created by {@link PhysicsSystem.createBody}. */
  constructor(
    private readonly rigidBody: RigidBody,
    /** The single collider attached to this body. */
    readonly collider: Collider,
  ) {}

  /** Rapier's stable integer handle for the underlying rigid body. */
  get handle(): number {
    return this.rigidBody.handle
  }

  /** Current world-XZ position. */
  get position(): PlanarVec {
    const t = this.rigidBody.translation()
    return { x: t.x, z: t.y }
  }

  /** Current world-XZ linear velocity. */
  get velocity(): PlanarVec {
    const v = this.rigidBody.linvel()
    return { x: v.x, z: v.y }
  }

  /** The tag passed as {@link BodySpec.userData}. */
  get userData(): unknown {
    return this.rigidBody.userData
  }

  /** Drive the body by setting its linear velocity (world XZ). */
  setVelocity(velocity: PlanarVec): void {
    this.rigidBody.setLinvel({ x: velocity.x, y: velocity.z }, true)
  }

  /** Teleport the body to a world-XZ position. */
  setPosition(position: PlanarVec): void {
    this.rigidBody.setTranslation({ x: position.x, y: position.z }, true)
  }

  /** Apply an instantaneous impulse (world XZ). */
  applyImpulse(impulse: PlanarVec): void {
    this.rigidBody.applyImpulse({ x: impulse.x, y: impulse.z }, true)
  }

  /** @internal — the wrapped Rapier body, for {@link PhysicsSystem} removal. */
  get raw(): RigidBody {
    return this.rigidBody
  }
}

/**
 * The minimum an {@link PhysicsSystem.attachAgent} subject must expose: a mutable
 * planar position and a collision radius. The engine's `Agent` satisfies this
 * structurally, but the seam never imports `Agent` (or Three.js) so a plain
 * `{ position, radius }` works in tests and non-Three games.
 */
export interface PhysicsAgentLike {
  /** Body position; only `x`/`z` are written back, `y` (height) is left untouched. */
  readonly position: MutableVec3Like
  /** Collision radius in metres — becomes the agent body's ball collider. */
  readonly radius: number
}

export interface AttachAgentOptions {
  /**
   * `'dynamic'` (default): the agent body collides with and is stopped by walls
   * and other bodies. `'kinematic'`: the agent drives through the world, pushing
   * dynamic bodies but never blocked by them.
   */
  kind?: 'dynamic' | 'kinematic'
  /** Drag applied to the agent body; the default brings it to rest quickly when undriven. */
  linearDamping?: number
  /** Bounciness of the agent body. Defaults to `0`. */
  restitution?: number
  /** Friction of the agent body. Defaults to `0`. */
  friction?: number
}

/**
 * Binds an agent to a rigid body so the physics step drives the agent's
 * transform. Steer with {@link AgentBinding.drive}; after
 * {@link PhysicsSystem.step} the agent's `position.x/z` mirror the resolved body.
 */
export class AgentBinding {
  /** @internal — created by {@link PhysicsSystem.attachAgent}. */
  constructor(
    readonly agent: PhysicsAgentLike,
    readonly body: PhysicsBody,
  ) {}

  /** Set the body's desired planar velocity (world XZ) — the steering input. */
  drive(velocity: PlanarVec): void {
    this.body.setVelocity(velocity)
  }
}

export interface PhysicsConfig {
  /** Planar gravity (world XZ). Defaults to none — top-down arenas have no fall. */
  gravity?: PlanarVec
  /** Fixed simulation step in seconds. Defaults to `1/60`. */
  fixedTimeStep?: number
  /** Max fixed sub-steps per {@link PhysicsSystem.step} — the spiral-of-death clamp. Defaults to `5`. */
  maxSubSteps?: number
}

const DEFAULT_FIXED_STEP = 1 / 60
const DEFAULT_MAX_SUBSTEPS = 5

/**
 * Fixed-timestep 2D physics for the engine's XZ ground plane, wrapping Rapier2D.
 *
 * The simulation advances in fixed `fixedTimeStep` increments decoupled from the
 * render frame: {@link step} banks the frame's elapsed time in an accumulator and
 * runs as many whole fixed sub-steps as have accrued (capped at `maxSubSteps`),
 * so a 30fps and a 144fps client integrate identical physics. Keep this on the
 * imperative game loop — it is a system the loop steps, not a React concern.
 *
 * ```ts
 * const physics = await PhysicsSystem.create()
 * physics.addBoundsWalls(RectBounds.square(20))
 * const binding = physics.attachAgent(enemy)
 * // each frame, after steering:
 * binding.drive({ x: dirX * enemy.speed, z: dirZ * enemy.speed })
 * physics.step(frameDelta) // resolves collisions, then writes enemy.position
 * ```
 */
export class PhysicsSystem {
  /** The underlying Rapier world. Escape hatch for advanced, game-specific needs. */
  readonly world: World
  /** Fixed simulation step (seconds) — every `world.step()` integrates exactly this. */
  readonly fixedTimeStep: number
  /** Max fixed sub-steps run per {@link step}. */
  readonly maxSubSteps: number

  private accumulator = 0
  private disposed = false
  private readonly bodies = new Set<PhysicsBody>()
  private readonly bindings = new Set<AgentBinding>()

  constructor(
    private readonly rapier: RapierModule,
    config: PhysicsConfig = {},
  ) {
    const gravity = config.gravity ?? { x: 0, z: 0 }
    this.world = new rapier.World({ x: gravity.x, y: gravity.z })
    this.fixedTimeStep = config.fixedTimeStep ?? DEFAULT_FIXED_STEP
    this.maxSubSteps = config.maxSubSteps ?? DEFAULT_MAX_SUBSTEPS
    this.world.timestep = this.fixedTimeStep
  }

  /** Convenience: await {@link ensureRapier}, then construct the system. */
  static async create(config: PhysicsConfig = {}): Promise<PhysicsSystem> {
    const rapier = await ensureRapier()
    return new PhysicsSystem(rapier, config)
  }

  /** Number of live bodies the system owns. */
  get bodyCount(): number {
    return this.bodies.size
  }

  /** Number of agents currently bound to bodies. */
  get agentCount(): number {
    return this.bindings.size
  }

  /** Create a rigid body + collider from a spec. */
  createBody(spec: BodySpec): PhysicsBody {
    const kind = spec.kind ?? 'dynamic'
    const r = this.rapier
    const desc =
      kind === 'dynamic'
        ? r.RigidBodyDesc.dynamic()
        : kind === 'fixed'
          ? r.RigidBodyDesc.fixed()
          : r.RigidBodyDesc.kinematicVelocityBased()
    desc.setTranslation(spec.position.x, spec.position.z)
    if (spec.linearDamping !== undefined) desc.setLinearDamping(spec.linearDamping)
    if (spec.userData !== undefined) desc.setUserData(spec.userData)

    const rigidBody = this.world.createRigidBody(desc)
    if (spec.lockRotation ?? kind === 'dynamic') rigidBody.lockRotations(true, false)

    const colliderDesc =
      spec.shape.kind === 'ball'
        ? r.ColliderDesc.ball(spec.shape.radius)
        : r.ColliderDesc.cuboid(spec.shape.halfX, spec.shape.halfZ)
    if (spec.restitution !== undefined) colliderDesc.setRestitution(spec.restitution)
    if (spec.friction !== undefined) colliderDesc.setFriction(spec.friction)
    if (spec.density !== undefined) colliderDesc.setDensity(spec.density)

    const collider = this.world.createCollider(colliderDesc, rigidBody)
    const body = new PhysicsBody(rigidBody, collider)
    this.bodies.add(body)
    return body
  }

  /**
   * Wall off a {@link WorldBounds} rectangle with four fixed colliders so bodies
   * are stopped at the edges *by collision* — the physical replacement for a
   * manual `clampXZ`. Inner wall faces sit exactly on `minX/maxX/minZ/maxZ`.
   * Returns the four wall bodies (e.g. to remove them when the arena changes).
   */
  addBoundsWalls(bounds: WorldBounds, options: { thickness?: number } = {}): PhysicsBody[] {
    const t = options.thickness ?? 1
    const half = t / 2
    const midX = (bounds.minX + bounds.maxX) / 2
    const midZ = (bounds.minZ + bounds.maxZ) / 2
    const spanZ = bounds.maxZ - bounds.minZ
    const spanX = bounds.maxX - bounds.minX
    // Long axis is over-extended by `t` so the corners overlap and leave no gap.
    return [
      this.createBody({
        kind: 'fixed',
        position: { x: bounds.minX - half, z: midZ },
        shape: { kind: 'cuboid', halfX: half, halfZ: spanZ / 2 + t },
      }),
      this.createBody({
        kind: 'fixed',
        position: { x: bounds.maxX + half, z: midZ },
        shape: { kind: 'cuboid', halfX: half, halfZ: spanZ / 2 + t },
      }),
      this.createBody({
        kind: 'fixed',
        position: { x: midX, z: bounds.minZ - half },
        shape: { kind: 'cuboid', halfX: spanX / 2 + t, halfZ: half },
      }),
      this.createBody({
        kind: 'fixed',
        position: { x: midX, z: bounds.maxZ + half },
        shape: { kind: 'cuboid', halfX: spanX / 2 + t, halfZ: half },
      }),
    ]
  }

  /**
   * Attach an agent to a freshly-created ball body (radius = `agent.radius`) at
   * its current position. {@link AgentBinding.drive} feeds steering velocity in;
   * {@link step} writes the resolved body position back onto `agent.position`.
   */
  attachAgent(agent: PhysicsAgentLike, options: AttachAgentOptions = {}): AgentBinding {
    const body = this.createBody({
      kind: options.kind === 'kinematic' ? 'kinematic' : 'dynamic',
      position: { x: agent.position.x, z: agent.position.z },
      shape: { kind: 'ball', radius: agent.radius },
      linearDamping: options.linearDamping ?? 8,
      restitution: options.restitution ?? 0,
      friction: options.friction ?? 0,
      lockRotation: true,
    })
    const binding = new AgentBinding(agent, body)
    this.bindings.add(binding)
    return binding
  }

  /** Detach an agent binding and remove its body. */
  detachAgent(binding: AgentBinding): void {
    if (!this.bindings.delete(binding)) return
    this.removeBody(binding.body)
  }

  /** Remove a body (and its collider, and any agent binding using it). */
  removeBody(body: PhysicsBody): void {
    if (!this.bodies.delete(body)) return
    for (const binding of this.bindings) {
      if (binding.body === body) this.bindings.delete(binding)
    }
    this.world.removeRigidBody(body.raw)
  }

  /**
   * Advance the simulation by `frameDelta` seconds of real frame time using the
   * fixed-timestep accumulator, then sync bound agents. Returns how many fixed
   * sub-steps ran (`0..maxSubSteps`). The accumulator is clamped so a long pause
   * can never trigger more than `maxSubSteps` steps (no spiral of death); the
   * sub-`fixedTimeStep` remainder carries to the next call.
   */
  step(frameDelta: number): number {
    const dt = this.fixedTimeStep
    // A non-finite frameDelta (NaN/Infinity from a bad clock — a zero divisor, a
    // first-frame timestamp, a paused tab) must never poison the accumulator: NaN
    // would make it NaN forever and silently dead-freeze the sim. Treat any
    // non-finite delta as a dropped frame (0); real long pauses stay finite and
    // are bounded by the maxSubSteps clamp below.
    const delta = Number.isFinite(frameDelta) ? Math.max(0, frameDelta) : 0
    this.accumulator = Math.min(this.accumulator + delta, dt * this.maxSubSteps)
    let steps = 0
    while (this.accumulator >= dt) {
      this.world.step()
      this.accumulator -= dt
      steps++
    }
    this.syncAgents()
    return steps
  }

  private syncAgents(): void {
    for (const binding of this.bindings) {
      const { x, z } = binding.body.position
      binding.agent.position.x = x
      binding.agent.position.z = z
    }
  }

  /** Remove every body + binding and reset the accumulator. Keeps the world. */
  clear(): void {
    for (const body of this.bodies) this.world.removeRigidBody(body.raw)
    this.bodies.clear()
    this.bindings.clear()
    this.accumulator = 0
  }

  /**
   * Free the underlying Rapier world and drop all handles. The system is unusable
   * after. Idempotent — a second call is a safe no-op (Rapier's `World.free()`
   * throws if called twice), matching the rest of the engine's `dispose()` seams.
   */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.bindings.clear()
    this.bodies.clear()
    this.world.free()
  }
}
