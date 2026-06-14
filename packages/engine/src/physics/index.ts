/**
 * `@shipshitgames/engine/physics` — optional Rapier2D physics seam.
 *
 * Kept off the main entry (like `@shipshitgames/engine/net/server`) so games that
 * never touch physics don't resolve the Rapier WASM. Import from the subpath and
 * await {@link ensureRapier} once at boot:
 *
 * ```ts
 * import { PhysicsSystem } from '@shipshitgames/engine/physics'
 * const physics = await PhysicsSystem.create({ gravity: { x: 0, z: 0 } })
 * ```
 */
export { ensureRapier, type RapierModule } from './rapier'
export {
  AgentBinding,
  PhysicsBody,
  PhysicsSystem,
  type AttachAgentOptions,
  type BodyKind,
  type BodySpec,
  type ColliderShape,
  type PhysicsAgentLike,
  type PhysicsConfig,
  type PlanarVec,
} from './PhysicsSystem'
