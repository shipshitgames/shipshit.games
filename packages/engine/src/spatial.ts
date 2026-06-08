/** Duck-typed 3D vector used by systems that should not require a Three.js instance. */
export interface Vec3Like {
  readonly x: number
  readonly y: number
  readonly z: number
}

export interface MutableVec3Like {
  x: number
  y: number
  z: number
}

export function vec3(x = 0, y = 0, z = 0): MutableVec3Like {
  return { x, y, z }
}

export function copyVec3(from: Vec3Like): MutableVec3Like {
  return { x: from.x, y: from.y, z: from.z }
}

export function addScaledVec3(target: MutableVec3Like, velocity: Vec3Like, scale: number): void {
  target.x += velocity.x * scale
  target.y += velocity.y * scale
  target.z += velocity.z * scale
}

export function normalizedVec3(direction: Vec3Like, fallback: Vec3Like = { x: 0, y: 0, z: -1 }): MutableVec3Like {
  const length = Math.hypot(direction.x, direction.y, direction.z)
  if (length <= 0.000001) return copyVec3(fallback)
  return {
    x: direction.x / length,
    y: direction.y / length,
    z: direction.z / length,
  }
}

export function distanceXZ(a: Vec3Like, b: Vec3Like): number {
  return Math.hypot(a.x - b.x, a.z - b.z)
}
