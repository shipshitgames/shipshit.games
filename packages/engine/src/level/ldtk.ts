/**
 * LDtk level loader — turns a deepnight/ldtk (MIT) project export into the
 * engine's native, genre-neutral arena model: IntGrid layers become collider
 * {@link MapObstacle}s, entity layers become {@link SpawnPoint}s + typed
 * entities, and tile/auto layers become render-ready {@link LdtkTileLayer}s on
 * the XZ plane. The loader is pure data (no three.js) so a top-down arena, a
 * preview, or a test can consume it identically; rendering rides on the game's
 * tile/sprite runtime.
 *
 * Authoring lives in the LDtk editor; the `.ldtk` files are vendored per game.
 * The loader is pinned to {@link SUPPORTED_LDTK_VERSION} and fails loudly on a
 * mismatched export (override with `allowVersionMismatch`).
 */

import type { MapBounds } from '../world/bounds'
import type { ArenaMap, MapObstacle, MapTheme, RectMapObstacle } from '../world/map'
import type { SpawnPoint, SpawnPointProvider, SpawnRequest } from '../spawn'
import type {
  LdtkEntityInstance,
  LdtkLayerInstance,
  LdtkLevel,
  LdtkRoot,
  LdtkTileInstance,
} from './ldtk-types'

/** LDtk schema (`major.minor`) this loader targets. */
export const SUPPORTED_LDTK_VERSION = '1.5'

/** A loader failure that is unambiguously about the LDtk import (bad JSON, version, shape). */
export class LdtkError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LdtkError'
  }
}

export interface LdtkVersionInfo {
  raw: string
  major: number
  minor: number
}

const SUPPORTED = parseLdtkVersion(SUPPORTED_LDTK_VERSION)

export interface LdtkLoadOptions {
  /** World units per LDtk pixel. Default `1`. */
  scale?: number
  /** Centre each level on the world origin (XZ). Default `true`. */
  center?: boolean
  /** IntGrid layer identifiers to treat as colliders. Default: every IntGrid layer. */
  collisionLayers?: readonly string[]
  /** IntGrid value ids treated as solid. Default: every non-zero value. */
  solidValues?: readonly number[]
  /** Merge adjacent solid cells into larger rect colliders. Default `true`. */
  mergeColliders?: boolean
  /** Extra entity identifiers that become spawn points (overrides the name heuristic). */
  spawnIdentifiers?: readonly string[]
  /** Entity tag that marks a spawn point. Default `'spawn'`. */
  spawnTag?: string
  /** Entity field read as a spawn lane id (tower-defense lanes). Default `'lane'`. */
  laneField?: string
  /** Load a non-matching LDtk version instead of throwing (reported via `onWarn`). */
  allowVersionMismatch?: boolean
  /** Sink for non-fatal notices (version drift, unsupported layer types). */
  onWarn?: (message: string) => void
}

/** A tile placed in the world, ready for a tile/sprite runtime to draw. */
export interface LdtkTile {
  /** World centre on the XZ plane. */
  x: number
  z: number
  /** World size of the (square) tile. */
  size: number
  /** `[pixelX, pixelY]` of this tile in its tileset image. */
  src: [number, number]
  /** Tile id within the tileset. */
  tileId: number
  flipX: boolean
  flipY: boolean
  alpha: number
}

export interface LdtkTileLayer {
  identifier: string
  tilesetRelPath?: string
  /** World size of one cell. */
  cellSize: number
  tiles: LdtkTile[]
}

/** An LDtk entity mapped into world space (XZ plane). */
export interface LdtkEntity {
  identifier: string
  iid?: string
  tags: string[]
  /** World centre on the XZ plane. */
  x: number
  z: number
  /** World footprint. */
  width: number
  depth: number
  /** Field instances keyed by `__identifier`. */
  fields: Record<string, unknown>
}

/** One LDtk level mapped onto the engine's native arena model. */
export interface LdtkArena {
  id: string
  /** Engine-native arena (bounds + collider obstacles + theme). */
  map: ArenaMap
  /** Spawn points extracted from entity layers (for the spawn seam). */
  spawnPoints: SpawnPoint[]
  /** Every entity (including spawns) mapped to world space. */
  entities: LdtkEntity[]
  /** Render-ready tile layers, top-most first (matching LDtk order). */
  tileLayers: LdtkTileLayer[]
  source: { jsonVersion: string; level: string }
}

export interface LdtkProject {
  version: LdtkVersionInfo
  arenas: LdtkArena[]
}

/** Parse an LDtk `jsonVersion` string (`"1.5.3"`) into its `major.minor` parts. */
export function parseLdtkVersion(raw: string): LdtkVersionInfo {
  const match = /^(\d+)\.(\d+)/.exec(String(raw).trim())
  if (!match) throw new LdtkError(`unrecognised LDtk jsonVersion "${raw}"`)
  const [, majorStr, minorStr] = match
  return { raw, major: Number(majorStr), minor: Number(minorStr) }
}

/**
 * Assert the project was exported by a supported LDtk version. Throws an
 * {@link LdtkError} on a mismatch unless `allowVersionMismatch` is set, in which
 * case it reports via `onWarn` and continues.
 */
export function assertLdtkVersion(root: LdtkRoot, options: LdtkLoadOptions = {}): LdtkVersionInfo {
  if (!root || typeof root.jsonVersion !== 'string') {
    throw new LdtkError('not an LDtk project: missing "jsonVersion"')
  }
  const version = parseLdtkVersion(root.jsonVersion)
  const matches = version.major === SUPPORTED.major && version.minor === SUPPORTED.minor
  if (!matches) {
    const message =
      `LDtk version mismatch: file is ${version.raw}, loader targets ${SUPPORTED_LDTK_VERSION}.x. ` +
      `Re-export from LDtk ${SUPPORTED_LDTK_VERSION}, or pass { allowVersionMismatch: true } to load anyway.`
    if (!options.allowVersionMismatch) throw new LdtkError(message)
    options.onWarn?.(message)
  }
  return version
}

/** Load every level in an `.ldtk` project (JSON string or parsed object). */
export function loadLdtkProject(input: string | LdtkRoot, options: LdtkLoadOptions = {}): LdtkProject {
  const root = typeof input === 'string' ? (parseJson(input) as LdtkRoot) : input
  const version = assertLdtkVersion(root, options)
  const levels = Array.isArray(root.levels) ? root.levels : []
  if (levels.length === 0) options.onWarn?.('LDtk project has no levels')
  const arenas = levels.map((level) => loadLdtkLevel(root, level, options))
  return { version, arenas }
}

/** Map a single LDtk level onto the engine arena model. */
export function loadLdtkLevel(root: LdtkRoot, level: LdtkLevel, options: LdtkLoadOptions = {}): LdtkArena {
  if (!Number.isFinite(level?.pxWid) || level.pxWid <= 0 || !Number.isFinite(level?.pxHei) || level.pxHei <= 0) {
    throw new LdtkError(
      `LDtk level "${level?.identifier ?? '?'}" has invalid pxWid/pxHei (need finite, positive numbers, got ${level?.pxWid}x${level?.pxHei})`,
    )
  }
  const scale = options.scale ?? 1
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new LdtkError(`LDtk load scale must be a finite, positive number, got ${scale}`)
  }
  const center = options.center ?? true
  const originX = center ? (level.pxWid * scale) / 2 : 0
  const originZ = center ? (level.pxHei * scale) / 2 : 0

  const obstacles: MapObstacle[] = []
  const spawnPoints: SpawnPoint[] = []
  const entities: LdtkEntity[] = []
  const tileLayers: LdtkTileLayer[] = []

  for (const layer of level.layerInstances ?? []) {
    switch (layer.__type) {
      case 'IntGrid': {
        if (isCollisionLayer(layer, options)) {
          obstacles.push(...intGridColliders(layer, options, scale, originX, originZ))
        }
        // An IntGrid layer can also carry auto-rule tiles for rendering.
        if (layer.autoLayerTiles && layer.autoLayerTiles.length > 0) {
          tileLayers.push(toTileLayer(layer, layer.autoLayerTiles, scale, originX, originZ, root, options))
        }
        break
      }
      case 'AutoLayer': {
        if (layer.autoLayerTiles && layer.autoLayerTiles.length > 0) {
          tileLayers.push(toTileLayer(layer, layer.autoLayerTiles, scale, originX, originZ, root, options))
        }
        break
      }
      case 'Tiles': {
        if (layer.gridTiles && layer.gridTiles.length > 0) {
          tileLayers.push(toTileLayer(layer, layer.gridTiles, scale, originX, originZ, root, options))
        }
        break
      }
      case 'Entities': {
        const offX = layer.__pxTotalOffsetX ?? 0
        const offY = layer.__pxTotalOffsetY ?? 0
        for (const ent of layer.entityInstances ?? []) {
          const mapped = mapEntity(ent, scale, originX, originZ, offX, offY)
          entities.push(mapped)
          if (isSpawnEntity(ent, options)) spawnPoints.push(toSpawnPoint(mapped, options))
        }
        break
      }
      default:
        options.onWarn?.(`LDtk layer "${layer.__identifier}" has unsupported type "${layer.__type}"`)
    }
  }

  const bounds: MapBounds = {
    kind: 'rect',
    minX: center ? -originX : 0,
    maxX: level.pxWid * scale - originX,
    minZ: center ? -originZ : 0,
    maxZ: level.pxHei * scale - originZ,
  }
  const theme = levelTheme(level)
  const map: ArenaMap = {
    id: level.identifier,
    name: level.identifier,
    bounds,
    ...(theme ? { theme } : {}),
    obstacles,
  }

  return {
    id: level.identifier,
    map,
    spawnPoints,
    entities,
    tileLayers,
    source: { jsonVersion: root.jsonVersion, level: level.identifier },
  }
}

/** Inclusive grid-cell rectangle `[cx0..cx1] x [cy0..cy1]`. */
interface CellRect {
  cx0: number
  cy0: number
  cx1: number
  cy1: number
}

function isCollisionLayer(layer: LdtkLayerInstance, options: LdtkLoadOptions): boolean {
  if (!options.collisionLayers) return true
  return options.collisionLayers.includes(layer.__identifier)
}

function intGridColliders(
  layer: LdtkLayerInstance,
  options: LdtkLoadOptions,
  scale: number,
  originX: number,
  originZ: number,
): RectMapObstacle[] {
  const csv = layer.intGridCsv ?? []
  const cw = layer.__cWid
  const ch = layer.__cHei
  const gs = layer.__gridSize
  if (!cw || !ch || !gs) return []

  const isSolidValue = (v: number) =>
    v !== 0 && (!options.solidValues || options.solidValues.includes(v))
  const solid: boolean[] = new Array(cw * ch)
  for (let i = 0; i < cw * ch; i++) solid[i] = isSolidValue(csv[i] ?? 0)

  const rects = options.mergeColliders === false ? eachCellRect(solid, cw, ch) : mergeSolidRects(solid, cw, ch)
  const offX = layer.__pxTotalOffsetX ?? 0
  const offY = layer.__pxTotalOffsetY ?? 0
  return rects.map((rect) => cellRectToObstacle(layer, rect, gs, scale, originX, originZ, offX, offY))
}

/** Greedy maximal-rectangle decomposition of the solid cells (expand right, then down). */
function mergeSolidRects(solid: boolean[], cw: number, ch: number): CellRect[] {
  const used = new Array<boolean>(cw * ch).fill(false)
  const free = (x: number, y: number) => solid[y * cw + x] === true && used[y * cw + x] === false
  const rects: CellRect[] = []

  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      if (!free(x, y)) continue
      let x1 = x
      while (x1 + 1 < cw && free(x1 + 1, y)) x1++
      let y1 = y
      let canExpand = true
      while (canExpand && y1 + 1 < ch) {
        for (let xx = x; xx <= x1; xx++) {
          if (!free(xx, y1 + 1)) {
            canExpand = false
            break
          }
        }
        if (canExpand) y1++
      }
      for (let yy = y; yy <= y1; yy++) {
        for (let xx = x; xx <= x1; xx++) used[yy * cw + xx] = true
      }
      rects.push({ cx0: x, cy0: y, cx1: x1, cy1: y1 })
    }
  }
  return rects
}

function eachCellRect(solid: boolean[], cw: number, ch: number): CellRect[] {
  const rects: CellRect[] = []
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      if (solid[y * cw + x] === true) rects.push({ cx0: x, cy0: y, cx1: x, cy1: y })
    }
  }
  return rects
}

function cellRectToObstacle(
  layer: LdtkLayerInstance,
  rect: CellRect,
  gs: number,
  scale: number,
  originX: number,
  originZ: number,
  offX: number,
  offY: number,
): RectMapObstacle {
  const pxX0 = rect.cx0 * gs
  const pxX1 = (rect.cx1 + 1) * gs
  const pxY0 = rect.cy0 * gs
  const pxY1 = (rect.cy1 + 1) * gs
  return {
    kind: 'rect',
    id: `${layer.__identifier}:${rect.cx0},${rect.cy0}`,
    x: ((pxX0 + pxX1) / 2 + offX) * scale - originX,
    z: ((pxY0 + pxY1) / 2 + offY) * scale - originZ,
    width: (pxX1 - pxX0) * scale,
    depth: (pxY1 - pxY0) * scale,
    blocksMovement: true,
    tags: [layer.__identifier],
  }
}

function mapEntity(
  ent: LdtkEntityInstance,
  scale: number,
  originX: number,
  originZ: number,
  offX: number,
  offY: number,
): LdtkEntity {
  const [pxX, pxY] = ent.px ?? [0, 0]
  const w = ent.width ?? 0
  const h = ent.height ?? 0
  // LDtk `px` is the entity's PIVOT pixel, not its centre — the default pivot is
  // the top-left corner. Compensate with the pivot + footprint so the mapped
  // world position is the entity centre, matching how tile cells are centred.
  const [pivotX, pivotY] = ent.__pivot ?? [0, 0]
  const centreX = pxX + (0.5 - pivotX) * w
  const centreY = pxY + (0.5 - pivotY) * h
  const fields: Record<string, unknown> = {}
  for (const field of ent.fieldInstances ?? []) fields[field.__identifier] = field.__value
  return {
    identifier: ent.__identifier,
    ...(ent.iid ? { iid: ent.iid } : {}),
    tags: ent.__tags ? [...ent.__tags] : [],
    x: (centreX + offX) * scale - originX,
    z: (centreY + offY) * scale - originZ,
    width: w * scale,
    depth: h * scale,
    fields,
  }
}

function isSpawnEntity(ent: LdtkEntityInstance, options: LdtkLoadOptions): boolean {
  const tag = (options.spawnTag ?? 'spawn').toLowerCase()
  const tagged = (ent.__tags ?? []).some((t) => t.toLowerCase() === tag)
  const named = options.spawnIdentifiers
    ? options.spawnIdentifiers.includes(ent.__identifier)
    : /spawn/i.test(ent.__identifier)
  return tagged || named
}

function toSpawnPoint(entity: LdtkEntity, options: LdtkLoadOptions): SpawnPoint {
  const laneRaw = entity.fields[options.laneField ?? 'lane']
  const laneId = typeof laneRaw === 'number' ? laneRaw : undefined
  return { x: entity.x, z: entity.z, ...(laneId !== undefined ? { laneId } : {}) }
}

function toTileLayer(
  layer: LdtkLayerInstance,
  tiles: readonly LdtkTileInstance[],
  scale: number,
  originX: number,
  originZ: number,
  root: LdtkRoot,
  options: LdtkLoadOptions,
): LdtkTileLayer {
  // Mirror intGridColliders' guard: a missing/non-positive __gridSize poisons
  // every tile's size and centre. Fall back to the project default if it is
  // valid, otherwise warn and drop the layer rather than emit NaN geometry.
  const gs =
    Number.isFinite(layer.__gridSize) && layer.__gridSize > 0
      ? layer.__gridSize
      : Number.isFinite(root.defaultGridSize) && (root.defaultGridSize ?? 0) > 0
        ? (root.defaultGridSize as number)
        : 0
  if (gs <= 0) {
    options.onWarn?.(`LDtk layer "${layer.__identifier}" has invalid __gridSize; skipping its tiles`)
    return { identifier: layer.__identifier, cellSize: 0, tiles: [] }
  }
  const offX = layer.__pxTotalOffsetX ?? 0
  const offY = layer.__pxTotalOffsetY ?? 0
  const mapped: LdtkTile[] = tiles.map((tile) => {
    const [pxX, pxY] = tile.px
    const flip = tile.f ?? 0
    return {
      x: (pxX + gs / 2 + offX) * scale - originX,
      z: (pxY + gs / 2 + offY) * scale - originZ,
      size: gs * scale,
      src: [tile.src[0], tile.src[1]],
      tileId: tile.t,
      flipX: (flip & 1) === 1,
      flipY: (flip & 2) === 2,
      alpha: tile.a ?? 1,
    }
  })
  return {
    identifier: layer.__identifier,
    ...(layer.__tilesetRelPath ? { tilesetRelPath: layer.__tilesetRelPath } : {}),
    cellSize: gs * scale,
    tiles: mapped,
  }
}

function levelTheme(level: LdtkLevel): MapTheme | undefined {
  const ground = level.bgColor ?? level.__bgColor
  if (!ground) return undefined
  return { id: level.identifier, groundColor: ground }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch (err) {
    throw new LdtkError(`invalid LDtk JSON: ${err instanceof Error ? err.message : String(err)}`)
  }
}

export interface FixedSpawnConfig {
  /** Reject a candidate within this distance of the avoid point. Default `0` (no avoidance). */
  minAvoidDistance?: number
}

/**
 * A list-backed {@link SpawnPointProvider} over fixed authored points — pairs
 * the LDtk entity spawns with the engine spawn seam. Round-robin and
 * deterministic (no RNG), so a tower-defense map's lane mouths or an arena's
 * authored entry points drop straight into the same `next()` interface that
 * {@link RectScatterSpawnProvider} satisfies.
 */
export class FixedSpawnProvider implements SpawnPointProvider {
  private index = 0

  constructor(
    private readonly points: readonly SpawnPoint[],
    private readonly cfg: FixedSpawnConfig = {},
  ) {
    if (points.length === 0) throw new LdtkError('FixedSpawnProvider needs at least one spawn point')
  }

  next(req: SpawnRequest = {}): SpawnPoint {
    const n = this.points.length
    const minDist = this.cfg.minAvoidDistance ?? 0
    const hasAvoid = req.avoidX !== undefined && req.avoidZ !== undefined
    for (let i = 0; i < n; i++) {
      const point = this.points[(this.index + i) % n]!
      if (hasAvoid && minDist > 0 && Math.hypot(point.x - req.avoidX!, point.z - req.avoidZ!) < minDist) {
        continue
      }
      this.index = (this.index + i + 1) % n
      return { ...point }
    }
    // Every point was too close to the avoid focus — fall back to plain round-robin.
    const point = this.points[this.index % n]!
    this.index = (this.index + 1) % n
    return { ...point }
  }
}
