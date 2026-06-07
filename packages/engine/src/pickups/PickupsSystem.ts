import type { MutableVec3Like, Vec3Like } from '../spatial'
import { copyVec3, distanceXZ } from '../spatial'

export interface PickupSpec<TType extends string = string, TValue = unknown> {
  type: TType
  radius: number
  ttl?: number
  value?: TValue
  tags?: readonly string[]
  metadata?: Readonly<Record<string, unknown>>
}

export type PickupTable<TType extends string, TValue = unknown> = Readonly<
  Record<TType, PickupSpec<TType, TValue>>
>

export interface Pickup<TType extends string = string, TValue = unknown, TMeta = unknown> {
  id: string
  type: TType
  position: MutableVec3Like
  radius: number
  age: number
  ttl?: number
  value?: TValue
  metadata?: TMeta
}

export interface SpawnPickup<TType extends string, TValue = unknown, TMeta = unknown> {
  id?: string
  type: TType
  position: Vec3Like
  radius?: number
  ttl?: number
  value?: TValue
  metadata?: TMeta
}

export interface PickupCollectOptions<TType extends string, TValue = unknown, TMeta = unknown> {
  radius?: number
  filter?: (pickup: Pickup<TType, TValue, TMeta>) => boolean
}

/**
 * Shared pickup lifecycle. Games supply pickup definitions and decide what a
 * collected pickup does; the engine handles placement, expiry, and radius tests.
 */
export class PickupsSystem<TType extends string, TValue = unknown, TMeta = unknown> {
  private readonly items: Pickup<TType, TValue, TMeta>[] = []
  private nextId = 1

  constructor(private readonly specs: PickupTable<TType, TValue>) {}

  get active(): readonly Pickup<TType, TValue, TMeta>[] {
    return this.items
  }

  spawn(input: SpawnPickup<TType, TValue, TMeta>): Pickup<TType, TValue, TMeta> {
    const spec = this.specs[input.type]
    if (!spec) throw new Error(`Unknown pickup type: ${input.type}`)

    const pickup: Pickup<TType, TValue, TMeta> = {
      id: input.id ?? `pickup-${this.nextId++}`,
      type: input.type,
      position: copyVec3(input.position),
      radius: input.radius ?? spec.radius,
      age: 0,
      ttl: input.ttl ?? spec.ttl,
      value: input.value ?? spec.value,
      metadata: input.metadata,
    }
    this.items.push(pickup)
    return pickup
  }

  update(delta: number): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const pickup = this.items[i]!
      pickup.age += delta
      if (pickup.ttl !== undefined && pickup.age >= pickup.ttl) this.items.splice(i, 1)
    }
  }

  collectAt(
    position: Vec3Like,
    options: PickupCollectOptions<TType, TValue, TMeta> = {},
  ): Pickup<TType, TValue, TMeta>[] {
    const collected: Pickup<TType, TValue, TMeta>[] = []
    const collectorRadius = options.radius ?? 0

    for (let i = this.items.length - 1; i >= 0; i--) {
      const pickup = this.items[i]!
      if (options.filter && !options.filter(pickup)) continue
      if (distanceXZ(position, pickup.position) > pickup.radius + collectorRadius) continue
      this.items.splice(i, 1)
      collected.push(pickup)
    }

    return collected.reverse()
  }

  remove(id: string): Pickup<TType, TValue, TMeta> | undefined {
    const index = this.items.findIndex((pickup) => pickup.id === id)
    if (index < 0) return undefined
    return this.items.splice(index, 1)[0]
  }

  clear(): void {
    this.items.length = 0
  }
}
