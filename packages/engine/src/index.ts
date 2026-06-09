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
export {
  ArenaSystem,
  pointInObstacle,
  validateArenaMap,
  type ArenaMap,
  type ArenaSystemOptions,
  type CircleMapObstacle,
  type ColorToken,
  type MapFog,
  type MapLight,
  type MapObstacle,
  type MapTheme,
  type RectMapObstacle,
} from './world/map'

// --- engine-core: render seam (scene/renderer lifecycle + map lights/theme) ---
export { RenderSystem, type RendererLike, type RenderSystemConfig } from './render/RenderSystem'

// --- engine-core: HUD snapshot fan-out (React stays game-side) ---
export {
  HudSystem,
  type StateListener,
  type StateUpdater,
  type SubscribeOptions,
} from './hud/HudSystem'

// --- engine-core: short-lived visual effects (rendering stays game-side) ---
export {
  FxSystem,
  type FxEntity,
  type FxSpawn,
  type FxSystemHooks,
  type Pop,
  type Tracer,
  type TransientEntity,
} from './fx/FxSystem'

// --- engine-core: generic data-driven transient gameplay entities ---
export {
  ProjectilesSystem,
  type Projectile,
  type ProjectileSpec,
  type ProjectileTable,
  type ProjectileUpdateOptions,
  type SpawnProjectile,
} from './projectiles/ProjectilesSystem'
export {
  PickupsSystem,
  type Pickup,
  type PickupCollectOptions,
  type PickupSpec,
  type PickupTable,
  type SpawnPickup,
} from './pickups/PickupsSystem'
export {
  addScaledVec3,
  copyVec3,
  distanceXZ,
  normalizedVec3,
  vec3,
  type MutableVec3Like,
  type Vec3Like,
} from './spatial'

// --- embodied-base: camera rig (seam: CameraRig — the spine) ---
export {
  firstPersonPointerLock,
  thirdPersonFollow,
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
  isJumpKey,
  DEFAULT_MOVE_KEYS,
  DEFAULT_MOVEMENT_CONFIG,
  type MoveIntent,
  type ActionMap,
  type ActionId,
  type CaptureRig,
  type InputActionHandler,
  type MovementConfig,
  type MovementKeyMap,
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
