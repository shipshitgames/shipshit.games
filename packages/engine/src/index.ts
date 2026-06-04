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
