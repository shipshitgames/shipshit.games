import type { WorldBounds } from './world/bounds'

/** Where to spawn relative to a focus point (usually the player) to avoid. */
export interface SpawnRequest {
  /** Spawn at least {@link RectScatterConfig.minAvoidDistance} away from here. */
  avoidX?: number
  avoidZ?: number
}

/** A chosen spawn location on the XZ plane. `laneId` is for lane-based (TD) spawners. */
export interface SpawnPoint {
  x: number
  z: number
  laneId?: number
}

/**
 * The spawn seam: "where does the next enemy enter the world?" An FPS arena
 * scatters them around the player; a tower-defense feeds them from lane mouths.
 * Systems request points without knowing which scheme is in play.
 */
export interface SpawnPointProvider {
  next(req?: SpawnRequest): SpawnPoint
}

export interface RectScatterConfig {
  /** Resolve the current play bounds each call, so arena rebuilds are picked up. */
  bounds(): WorldBounds
  /** Inset from the bounds edge (metres). */
  margin?: number
  /** Reject points within this distance of {@link SpawnRequest.avoidX}/avoidZ. */
  minAvoidDistance?: number
  /** Reject a candidate point (e.g. inside an obstacle). */
  blocked?: (x: number, z: number) => boolean
  /** Random tries before falling back to an arena corner. */
  attempts?: number
}

/**
 * Scatters spawns uniformly across a rectangular arena, away from a focus point
 * and clear of blocked cells. The embodied-arena default (the FPS "arena ring");
 * a tower-defense swaps in a lane-mouth provider against the same seam.
 */
export class RectScatterSpawnProvider implements SpawnPointProvider {
  constructor(private readonly cfg: RectScatterConfig) {}

  next(req: SpawnRequest = {}): SpawnPoint {
    const b = this.cfg.bounds()
    const margin = this.cfg.margin ?? 3
    const minDist = this.cfg.minAvoidDistance ?? 16
    const attempts = this.cfg.attempts ?? 24
    const spanX = Math.max(0, b.maxX - b.minX - margin * 2)
    const spanZ = Math.max(0, b.maxZ - b.minZ - margin * 2)
    const hasAvoid = req.avoidX !== undefined && req.avoidZ !== undefined

    for (let i = 0; i < attempts; i++) {
      const x = b.minX + margin + Math.random() * spanX
      const z = b.minZ + margin + Math.random() * spanZ
      if (hasAvoid && Math.hypot(x - req.avoidX!, z - req.avoidZ!) < minDist) continue
      if (this.cfg.blocked?.(x, z)) continue
      return { x, z }
    }

    // Couldn't place clear after N tries — fall back to a random inset corner.
    return {
      x: Math.random() < 0.5 ? b.minX + margin : b.maxX - margin,
      z: Math.random() < 0.5 ? b.minZ + margin : b.maxZ - margin,
    }
  }
}
