import type * as THREE from 'three'

/**
 * Axis-aligned horizontal play-area bounds (the XZ plane). Genre-neutral: an FPS
 * arena is a centered square; an embodied tower-defense map may be an asymmetric
 * rectangle. Systems clamp/cull/spawn against this instead of a global ARENA_HALF.
 */
export interface WorldBounds {
  readonly minX: number
  readonly maxX: number
  readonly minZ: number
  readonly maxZ: number

  /** Clamp pos.x / pos.z into the bounds, optionally inset by `margin` metres. Mutates `pos`. */
  clampXZ(pos: THREE.Vector3, margin?: number): void

  /** Is (x,z) inside the bounds, optionally inset by `margin`? */
  containsXZ(x: number, z: number, margin?: number): boolean

  /** Write a uniformly-random point inside the bounds (inset by `margin`) into `out.x`/`out.z`
   *  (leaves out.y untouched); returns `out`. */
  randomPointXZ(margin: number, out: THREE.Vector3): THREE.Vector3
}

/** A rectangular {@link WorldBounds}. Use {@link RectBounds.square} for a centered arena. */
export class RectBounds implements WorldBounds {
  constructor(
    readonly minX: number,
    readonly maxX: number,
    readonly minZ: number,
    readonly maxZ: number,
  ) {}

  /** Centered square of half-extent `half` — the FPS-arena default (seeded from ARENA_HALF). */
  static square(half: number): RectBounds {
    return new RectBounds(-half, half, -half, half)
  }

  clampXZ(pos: THREE.Vector3, margin = 0): void {
    pos.x = Math.max(this.minX + margin, Math.min(this.maxX - margin, pos.x))
    pos.z = Math.max(this.minZ + margin, Math.min(this.maxZ - margin, pos.z))
  }

  containsXZ(x: number, z: number, margin = 0): boolean {
    return (
      x >= this.minX + margin &&
      x <= this.maxX - margin &&
      z >= this.minZ + margin &&
      z <= this.maxZ - margin
    )
  }

  randomPointXZ(margin: number, out: THREE.Vector3): THREE.Vector3 {
    const spanX = Math.max(0, this.maxX - this.minX - margin * 2)
    const spanZ = Math.max(0, this.maxZ - this.minZ - margin * 2)
    out.x = this.minX + margin + Math.random() * spanX
    out.z = this.minZ + margin + Math.random() * spanZ
    return out
  }
}

/** Serialisable bounds spec a map can declare; resolved to a {@link WorldBounds} via {@link makeBounds}. */
export type MapBounds =
  | { kind: 'square'; half: number }
  | { kind: 'rect'; minX: number; maxX: number; minZ: number; maxZ: number }

export function makeBounds(spec: MapBounds): WorldBounds {
  return spec.kind === 'square'
    ? RectBounds.square(spec.half)
    : new RectBounds(spec.minX, spec.maxX, spec.minZ, spec.maxZ)
}
