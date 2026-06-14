/**
 * Pure stereo-pan + distance-attenuation math for the audio seam (issue #76).
 *
 * No Web Audio, no Howler — just the geometry that turns "a source at world
 * position P, heard by a listener at the camera" into a stereo pan in [-1, 1]
 * and a gain in [0, 1]. Kept dependency-free so it unit-tests in bun without a
 * browser and so games can reuse the numbers for their own mixers.
 *
 * Convention (matches Three.js): yaw rotates the listener's facing about +Y,
 * with yaw=0 looking down -Z. The listener's right axis is therefore
 * `(cos yaw, 0, -sin yaw)`, so a source off to the player's right pans right
 * (+1) and one off to the left pans left (-1). Pan is computed on the XZ plane
 * only — vertical offset never moves a sound left or right.
 */
import type { Vec3Like } from '../spatial'

/** The ears of the world: where the camera/player is and which way it faces. */
export interface AudioListener {
  /** Listener world position (typically the camera or player body). */
  position: Vec3Like
  /** Facing yaw in radians about +Y; 0 looks down -Z (Three.js default). */
  yaw: number
}

/** Linear distance rolloff knobs. Full gain within `ref`, silent past `max`. */
export interface AttenuationConfig {
  /** Distance (world units) within which the sound stays at full gain. Default 1. */
  refDistance?: number
  /** Distance at which the sound has faded to silence. Default 50. */
  maxDistance?: number
}

export const DEFAULT_REF_DISTANCE = 1
export const DEFAULT_MAX_DISTANCE = 50

/**
 * Clamp `n` into the inclusive `[min, max]` range. Non-finite input drops to the
 * floor (`min`) — the right policy for a *unipolar* value like volume, whose
 * neutral is the minimum, so junk fails to silence rather than a NaN blast.
 */
export function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, n))
}

/**
 * Clamp a *bipolar* value (like stereo pan, whose neutral is the midpoint 0)
 * into `[min, max]`, sending non-finite input to the midpoint instead of the
 * floor. Pan must NOT reuse {@link clamp}: a NaN there would hard-pan a sound
 * fully to one ear instead of centering it.
 */
export function clampBipolar(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return (min + max) / 2
  return Math.min(max, Math.max(min, n))
}

/**
 * Stereo pan in [-1, 1] for a source heard by `listener`.
 *
 * Projects the (XZ) listener→source direction onto the listener's right axis:
 * directly right → +1, directly left → -1, straight ahead or behind → 0. A
 * source sitting on the listener (or within `epsilon`) is centered (0), and so
 * is any non-finite input (a NaN yaw/position/strength centers, never hard-pans).
 * `panStrength` (default 1) scales the effect before the final clamp.
 */
export function computePan(listener: AudioListener, source: Vec3Like, panStrength = 1, epsilon = 1e-6): number {
  const dx = source.x - listener.position.x
  const dz = source.z - listener.position.z
  const dist = Math.hypot(dx, dz)
  if (dist < epsilon) return 0
  // Right axis on the XZ plane for a yaw that looks down -Z at yaw=0.
  const rightX = Math.cos(listener.yaw)
  const rightZ = -Math.sin(listener.yaw)
  const pan = (dx * rightX + dz * rightZ) / dist
  return clampBipolar(pan * panStrength, -1, 1)
}

/**
 * Distance gain in [0, 1] using a linear rolloff between `refDistance` and
 * `maxDistance`. Full gain at/under ref, silence at/over max, linear between.
 * Uses full 3D distance (height counts toward how far away a sound is).
 */
export function computeAttenuation(listener: AudioListener, source: Vec3Like, config: AttenuationConfig = {}): number {
  const ref = Math.max(0, config.refDistance ?? DEFAULT_REF_DISTANCE)
  const max = Math.max(ref, config.maxDistance ?? DEFAULT_MAX_DISTANCE)
  const dist = Math.hypot(source.x - listener.position.x, source.y - listener.position.y, source.z - listener.position.z)
  if (dist <= ref) return 1
  if (dist >= max) return 0
  const span = max - ref
  if (span <= 0) return 0
  return clamp(1 - (dist - ref) / span, 0, 1)
}

export interface Spatialized {
  /** Stereo pan in [-1, 1]. */
  pan: number
  /** Distance gain in [0, 1]. */
  gain: number
}

/** Convenience: pan + gain for one source in a single call. */
export function spatialize(
  listener: AudioListener,
  source: Vec3Like,
  config: AttenuationConfig & { panStrength?: number } = {},
): Spatialized {
  return {
    pan: computePan(listener, source, config.panStrength ?? 1),
    gain: computeAttenuation(listener, source, config),
  }
}
