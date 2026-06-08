import type { MutableVec3Like, Vec3Like } from '../spatial'
import { addScaledVec3, copyVec3, normalizedVec3 } from '../spatial'
import type { WorldBounds } from '../world/bounds'

export interface ProjectileSpec<TType extends string = string> {
  type: TType
  speed: number
  radius: number
  ttl: number
  damage?: number
  tags?: readonly string[]
  metadata?: Readonly<Record<string, unknown>>
}

export type ProjectileTable<TType extends string> = Readonly<Record<TType, ProjectileSpec<TType>>>

export interface Projectile<TType extends string = string, TMeta = unknown> {
  id: string
  type: TType
  position: MutableVec3Like
  velocity: MutableVec3Like
  radius: number
  ttl: number
  age: number
  damage?: number
  ownerId?: string
  metadata?: TMeta
}

export interface SpawnProjectile<TType extends string, TMeta = unknown> {
  id?: string
  type: TType
  position: Vec3Like
  direction: Vec3Like
  speed?: number
  radius?: number
  ttl?: number
  damage?: number
  ownerId?: string
  metadata?: TMeta
}

export interface ProjectileUpdateOptions<TType extends string, TMeta = unknown> {
  bounds?: WorldBounds
  margin?: number
  isBlocked?: (projectile: Projectile<TType, TMeta>) => boolean
  onExpire?: (projectile: Projectile<TType, TMeta>) => void
}

/**
 * Data-driven projectile lifecycle. Games supply the projectile table and own
 * collision policy; the engine handles spawn normalization, motion, and culling.
 */
export class ProjectilesSystem<TType extends string, TMeta = unknown> {
  private readonly items: Projectile<TType, TMeta>[] = []
  private nextId = 1

  constructor(private readonly specs: ProjectileTable<TType>) {}

  get active(): readonly Projectile<TType, TMeta>[] {
    return this.items
  }

  spawn(input: SpawnProjectile<TType, TMeta>): Projectile<TType, TMeta> {
    const spec = this.specs[input.type]
    if (!spec) throw new Error(`Unknown projectile type: ${input.type}`)

    const direction = normalizedVec3(input.direction)
    const speed = input.speed ?? spec.speed
    const projectile: Projectile<TType, TMeta> = {
      id: input.id ?? `projectile-${this.nextId++}`,
      type: input.type,
      position: copyVec3(input.position),
      velocity: {
        x: direction.x * speed,
        y: direction.y * speed,
        z: direction.z * speed,
      },
      radius: input.radius ?? spec.radius,
      ttl: input.ttl ?? spec.ttl,
      age: 0,
      damage: input.damage ?? spec.damage,
      ownerId: input.ownerId,
      metadata: input.metadata,
    }
    this.items.push(projectile)
    return projectile
  }

  update(delta: number, options: ProjectileUpdateOptions<TType, TMeta> = {}): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const projectile = this.items[i]!
      projectile.age += delta
      addScaledVec3(projectile.position, projectile.velocity, delta)

      const outOfBounds =
        options.bounds &&
        !options.bounds.containsXZ(projectile.position.x, projectile.position.z, options.margin ?? 0)
      const expired = projectile.age >= projectile.ttl || outOfBounds || options.isBlocked?.(projectile)
      if (expired) {
        this.items.splice(i, 1)
        options.onExpire?.(projectile)
      }
    }
  }

  remove(id: string): Projectile<TType, TMeta> | undefined {
    const index = this.items.findIndex((projectile) => projectile.id === id)
    if (index < 0) return undefined
    return this.items.splice(index, 1)[0]
  }

  clear(): void {
    this.items.length = 0
  }
}
