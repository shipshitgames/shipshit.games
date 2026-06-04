import type * as THREE from 'three'

/** Accumulator for a planar (XZ) steering vector. */
export interface PlanarVec {
  x: number
  z: number
}

/**
 * Kinematic agent base — the genre-neutral motion substrate every embodied NPC
 * shares (an FPS chaser, a tower-defense lane-walker). It owns the motion state
 * (alive / speed / radius + a decaying knockback shove) and the two reusable
 * kinematic primitives (boids-style peer separation, knockback integration).
 *
 * What it does NOT own: the render representation and *where to go*. Subclasses
 * keep their own meshes/sprites and expose the body's world position via
 * {@link position}; movement intent comes from a {@link SteeringStrategy}; combat
 * and animation stay in the subclass. So a TD lane-walker reuses the kinematics
 * with a different strategy + different visuals and zero copy-paste.
 */
export abstract class Agent {
  alive = false
  /** Proximity / collision radius (metres). */
  radius = 0.5
  /** Current planar move speed (units/s). */
  speed = 1
  /** Decaying knockback shove (units/s); applied + bled off each frame. */
  knockX = 0
  knockZ = 0

  /** World transform of this agent's body — the subclass-owned render root's position. */
  abstract get position(): THREE.Vector3

  /**
   * Accumulate boids-style peer separation into `out` so agents don't perfectly
   * stack. `gap` is the base personal space; `gapBonus` adds per-peer spacing
   * (e.g. give a boss a wider berth). Skips dead peers and self. Matches the
   * classic 1/d-weighted push, normalised by `minGap`.
   */
  protected separation<P extends Agent>(
    peers: Iterable<P>,
    gap: number,
    out: PlanarVec,
    gapBonus?: (peer: P) => number,
  ): void {
    const pos = this.position
    for (const other of peers) {
      if ((other as Agent) === this || !other.alive) continue
      const ox = pos.x - other.position.x
      const oz = pos.z - other.position.z
      const od = Math.hypot(ox, oz)
      const minGap = gap + (gapBonus ? gapBonus(other) : 0)
      if (od > 0.0001 && od < minGap) {
        const push = (minGap - od) / minGap
        out.x += (ox / od) * push
        out.z += (oz / od) * push
      }
    }
  }

  /**
   * Apply the knockback shove to `position` and decay it. Reads as a brief flinch
   * (default decay clears a hit's shove in a few frames). No-op when at rest.
   */
  protected applyKnockback(delta: number, decayRate = 9): void {
    if (this.knockX === 0 && this.knockZ === 0) return
    const pos = this.position
    pos.x += this.knockX * delta
    pos.z += this.knockZ * delta
    const k = Math.max(0, 1 - delta * decayRate)
    this.knockX *= k
    this.knockZ *= k
    if (Math.abs(this.knockX) < 0.02) this.knockX = 0
    if (Math.abs(this.knockZ) < 0.02) this.knockZ = 0
  }
}
