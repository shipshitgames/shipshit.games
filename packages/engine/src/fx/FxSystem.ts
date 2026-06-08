import type { MutableVec3Like, Vec3Like } from '../spatial'
import { copyVec3 } from '../spatial'

export interface TransientEntity<TMeta = unknown> {
  id: string
  age: number
  ttl: number
  metadata?: TMeta
}

export interface Tracer<TMeta = unknown> extends TransientEntity<TMeta> {
  kind: 'tracer'
  from: MutableVec3Like
  to: MutableVec3Like
  color?: number | string
  width?: number
}

export interface Pop<TMeta = unknown> extends TransientEntity<TMeta> {
  kind: 'pop'
  position: MutableVec3Like
  text?: string
  value?: number
  velocityY?: number
}

export type FxEntity<TMeta = unknown> = Tracer<TMeta> | Pop<TMeta>

export type FxSpawn<T extends FxEntity> = Omit<T, 'age'> & Partial<Pick<T, 'age'>>

export interface FxSystemHooks<T extends FxEntity> {
  onSpawn?: (entity: T) => void
  onUpdate?: (entity: T, delta: number) => void
  onExpire?: (entity: T) => void
}

/**
 * Shared lifecycle for short-lived visual effects. Rendering stays game-side:
 * this system just tracks time, motion hints, and expiry for tracers/pops.
 */
export class FxSystem<T extends FxEntity = FxEntity> {
  private readonly items: T[] = []

  constructor(private readonly hooks: FxSystemHooks<T> = {}) {}

  get active(): readonly T[] {
    return this.items
  }

  add(entity: FxSpawn<T>): T {
    const item = { age: 0, ...entity } as T
    this.items.push(item)
    this.hooks.onSpawn?.(item)
    return item
  }

  tracer(input: Omit<Tracer, 'kind' | 'age' | 'from' | 'to'> & { from: Vec3Like; to: Vec3Like }): Tracer {
    return this.add({
      ...input,
      kind: 'tracer',
      from: copyVec3(input.from),
      to: copyVec3(input.to),
    } as unknown as FxSpawn<T>) as Tracer
  }

  pop(input: Omit<Pop, 'kind' | 'age' | 'position'> & { position: Vec3Like }): Pop {
    return this.add({
      ...input,
      kind: 'pop',
      position: copyVec3(input.position),
    } as unknown as FxSpawn<T>) as Pop
  }

  update(delta: number): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i]!
      item.age += delta
      if (item.kind === 'pop' && item.velocityY) item.position.y += item.velocityY * delta
      this.hooks.onUpdate?.(item, delta)
      if (item.age >= item.ttl) {
        this.items.splice(i, 1)
        this.hooks.onExpire?.(item)
      }
    }
  }

  remove(id: string): boolean {
    const index = this.items.findIndex((item) => item.id === id)
    if (index < 0) return false
    const [item] = this.items.splice(index, 1)
    if (item) this.hooks.onExpire?.(item)
    return true
  }

  clear(): void {
    for (const item of this.items) this.hooks.onExpire?.(item)
    this.items.length = 0
  }
}
