import type * as THREE from 'three'

import { makeBounds, type MapBounds, type WorldBounds } from './bounds'

export type ColorToken = number | string

export interface MapFog {
  color: ColorToken
  near?: number
  far?: number
  density?: number
  kind?: 'linear' | 'exponential'
}

export interface MapTheme {
  id: string
  skyColor?: ColorToken
  groundColor?: ColorToken
  fog?: MapFog
  metadata?: Readonly<Record<string, unknown>>
}

export interface RectMapObstacle {
  kind: 'rect'
  id: string
  x: number
  z: number
  width: number
  depth: number
  height?: number
  blocksMovement?: boolean
  tags?: readonly string[]
  metadata?: Readonly<Record<string, unknown>>
}

export interface CircleMapObstacle {
  kind: 'circle'
  id: string
  x: number
  z: number
  radius: number
  height?: number
  blocksMovement?: boolean
  tags?: readonly string[]
  metadata?: Readonly<Record<string, unknown>>
}

export type MapObstacle = RectMapObstacle | CircleMapObstacle

export interface MapLight {
  kind: 'ambient' | 'directional' | 'point'
  id: string
  color: ColorToken
  intensity: number
  position?: readonly [x: number, y: number, z: number]
  target?: readonly [x: number, y: number, z: number]
  distance?: number
  decay?: number
  metadata?: Readonly<Record<string, unknown>>
}

export interface ArenaMap {
  id: string
  name?: string
  bounds: MapBounds
  theme?: MapTheme
  obstacles?: readonly MapObstacle[]
  lights?: readonly MapLight[]
  metadata?: Readonly<Record<string, unknown>>
}

export interface ArenaSystemOptions {
  obstacleMargin?: number
  isObstacleActive?: (obstacle: MapObstacle) => boolean
}

/**
 * Data-driven arena model shared by embodied games. Games own their actual map
 * files; the engine owns the common interpretation of bounds, blocking geometry,
 * theme tokens, and render lights.
 */
export class ArenaSystem<TMap extends ArenaMap = ArenaMap> {
  private currentMap: TMap
  private currentBounds: WorldBounds

  constructor(map: TMap, private readonly options: ArenaSystemOptions = {}) {
    validateArenaMap(map)
    this.currentMap = map
    this.currentBounds = makeBounds(map.bounds)
  }

  get map(): TMap {
    return this.currentMap
  }

  get bounds(): WorldBounds {
    return this.currentBounds
  }

  get theme(): MapTheme | undefined {
    return this.currentMap.theme
  }

  get obstacles(): readonly MapObstacle[] {
    return this.currentMap.obstacles ?? []
  }

  get lights(): readonly MapLight[] {
    return this.currentMap.lights ?? []
  }

  setMap(map: TMap): void {
    validateArenaMap(map)
    this.currentMap = map
    this.currentBounds = makeBounds(map.bounds)
  }

  containsXZ(x: number, z: number, margin = 0): boolean {
    return this.currentBounds.containsXZ(x, z, margin) && !this.isBlockedXZ(x, z)
  }

  clampXZ(pos: THREE.Vector3, margin = 0): void {
    this.currentBounds.clampXZ(pos, margin)
  }

  isBlockedXZ(x: number, z: number, margin = this.options.obstacleMargin ?? 0): boolean {
    return this.obstacleAtXZ(x, z, margin) !== undefined
  }

  obstacleAtXZ(x: number, z: number, margin = this.options.obstacleMargin ?? 0): MapObstacle | undefined {
    for (const obstacle of this.obstacles) {
      if (obstacle.blocksMovement === false) continue
      if (this.options.isObstacleActive && !this.options.isObstacleActive(obstacle)) continue
      if (pointInObstacle(obstacle, x, z, margin)) return obstacle
    }
    return undefined
  }
}

export function pointInObstacle(obstacle: MapObstacle, x: number, z: number, margin = 0): boolean {
  if (obstacle.kind === 'circle') {
    return Math.hypot(x - obstacle.x, z - obstacle.z) <= obstacle.radius + margin
  }

  const halfWidth = obstacle.width / 2 + margin
  const halfDepth = obstacle.depth / 2 + margin
  return (
    x >= obstacle.x - halfWidth &&
    x <= obstacle.x + halfWidth &&
    z >= obstacle.z - halfDepth &&
    z <= obstacle.z + halfDepth
  )
}

export function validateArenaMap(map: ArenaMap): void {
  if (!map.id) throw new Error('ArenaMap.id is required')
  if (map.bounds.kind === 'square' && map.bounds.half <= 0) {
    throw new Error(`ArenaMap ${map.id} has invalid square bounds`)
  }
  if (map.bounds.kind === 'rect') {
    if (map.bounds.minX >= map.bounds.maxX || map.bounds.minZ >= map.bounds.maxZ) {
      throw new Error(`ArenaMap ${map.id} has invalid rect bounds`)
    }
  }

  for (const obstacle of map.obstacles ?? []) {
    if (!obstacle.id) throw new Error(`ArenaMap ${map.id} has an obstacle without an id`)
    if (obstacle.kind === 'rect' && (obstacle.width <= 0 || obstacle.depth <= 0)) {
      throw new Error(`Obstacle ${obstacle.id} has invalid rect dimensions`)
    }
    if (obstacle.kind === 'circle' && obstacle.radius <= 0) {
      throw new Error(`Obstacle ${obstacle.id} has invalid radius`)
    }
  }
}
