/**
 * @shipshitgames/engine — the embodied 3D game engine shared by every Ship Shit Games title.
 *
 * Scope: engine-core (loop, context base, system registry, snapshot HUD shell, transport)
 * + embodied-base ("the player is a body in a 3D world": movement, collision, world bounds,
 * camera rig, agent kinematics, presence). FPS/genre specifics live in the games.
 *
 * Built seam-by-seam out of scourge-survivors — see that repo's ENGINE-EXTRACTION-PLAN.md.
 */

// --- embodied-base: world bounds (seam: WorldBounds) ---
export {
  RectBounds,
  makeBounds,
  type WorldBounds,
  type MapBounds,
} from './world/bounds'

// --- embodied-base: camera rig (seam: CameraRig — the spine) ---
export {
  firstPersonPointerLock,
  type CameraRig,
  type CameraRigPreset,
  type RigCaptureEvent,
  type ThirdPersonFollowConfig,
} from './camera/CameraRig'

// --- embodied-base: input (seam: DOM bindings + movement; genre verbs stay game-side) ---
export { InputSystem, type InputHooks } from './input/InputSystem'
export {
  makeMoveIntent,
  clearMoveIntent,
  applyMoveKey,
  actionFor,
  type MoveIntent,
  type ActionMap,
} from './input/bindings'

// --- embodied-base: agents (seam: kinematic Agent + pluggable SteeringStrategy) ---
export { Agent, type PlanarVec } from './agents/Agent'
export { type SteeringStrategy, type SteerView } from './agents/steering'

// --- embodied-base: spawn (seam: where the next enemy enters the world) ---
export {
  RectScatterSpawnProvider,
  type SpawnPointProvider,
  type SpawnRequest,
  type SpawnPoint,
  type RectScatterConfig,
} from './spawn'
