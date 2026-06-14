import type { PlanarVec } from './Agent'
import type { SteerView } from './steering'
import type { ArenaMap, ArenaSystem, MapObstacle } from '../world/map'
import { ArenaSystem as ArenaSystemImpl } from '../world/map'
import type { WorldBounds } from '../world/bounds'

/**
 * The pathfinding ⇄ steering seam. This module decides *WHERE* an embodied agent
 * should go: it bakes the arena's bounds + blocking geometry into a walkable grid,
 * runs deterministic grid-A* to produce a list of world-space waypoints, and hands
 * those waypoints to a {@link PathFollower}. It does NOT decide *HOW* the agent
 * moves frame-to-frame — that stays with the existing {@link SteeringStrategy}
 * substrate. The follower emits a {@link SteerView} (distance + normalised
 * direction toward the active waypoint), the exact shape the steering layer
 * already consumes, so a path simply replaces "look at the player" with "look at
 * the next corner" while every kinematic primitive (separation, knockback) is
 * untouched.
 *
 * Everything here is pure and free of external runtime dependencies — it imports
 * only engine-internal types plus `ArenaSystem` (to wrap a plain map), never
 * touches `three` at runtime, is fully deterministic (no randomness, no
 * wall-clock reads), and is guaranteed to terminate (closed set + a
 * node-expansion cap).
 */

/** A small structural view of {@link ArenaSystem} — the only surface the grid baker reads. */
interface BlockingSource {
  bounds: WorldBounds
  obstacles: readonly MapObstacle[]
  isBlockedXZ(x: number, z: number, margin?: number): boolean
}

/** Options for {@link bakeNavGrid}. */
export interface NavGridOptions {
  /** World metres per cell. Smaller = finer paths but more cells. Default 1. */
  cellSize?: number
  /**
   * Inflate blocking geometry + bounds by this radius so the grid is walkable
   * only where an agent of this size physically fits. Default 0 (point agent).
   */
  agentRadius?: number
}

/** An integer grid coordinate (column = X axis, row = Z axis). */
export interface GridCell {
  col: number
  row: number
}

/**
 * Detect an {@link ArenaSystem} (vs a plain {@link ArenaMap} data object) by
 * feature-testing the public `isBlockedXZ` method. Plain maps carry no methods,
 * so this is a safe, deterministic discriminator.
 */
function isArenaSystem(source: ArenaSystem | ArenaMap): source is ArenaSystem {
  return typeof (source as { isBlockedXZ?: unknown }).isBlockedXZ === 'function'
}

/**
 * A baked, immutable walkability grid over an arena's XZ play area. Pathfinding
 * reads this grid; it never mutates the arena. A cell is walkable iff its centre
 * is inside the (inset) bounds AND clear of all blocking geometry, both inflated
 * by {@link agentRadius}. Build one with {@link bakeNavGrid}; rebuild only when
 * the map's static geometry changes.
 */
export class NavGrid {
  /** Number of columns (cells along +X). */
  readonly cols: number
  /** Number of rows (cells along +Z). */
  readonly rows: number
  /** World metres per cell. */
  readonly cellSize: number
  /** Inflation radius baked into walkability. */
  readonly agentRadius: number
  /** World X of the grid's minimum edge (column 0 starts here). */
  readonly minX: number
  /** World Z of the grid's minimum edge (row 0 starts here). */
  readonly minZ: number

  /** Row-major walkability bitmap; index = row * cols + col. */
  private readonly walkable: Uint8Array

  /**
   * The blocking geometry this grid was baked from, retained so continuous
   * visibility ({@link segmentClear}, used by {@link hasLineOfSight}) can re-check
   * the *real* inflated obstacle a swept chord touches — not just the cell centres
   * the bitmap sampled. Undefined only for grids built without a source.
   */
  private readonly source?: BlockingSource

  /** @internal Use {@link bakeNavGrid}. */
  constructor(
    cols: number,
    rows: number,
    cellSize: number,
    agentRadius: number,
    minX: number,
    minZ: number,
    walkable: Uint8Array,
    source?: BlockingSource,
  ) {
    this.cols = cols
    this.rows = rows
    this.cellSize = cellSize
    this.agentRadius = agentRadius
    this.minX = minX
    this.minZ = minZ
    this.walkable = walkable
    this.source = source
  }

  /** Is `(col,row)` a real, walkable cell? Out-of-range cells are never walkable. */
  isWalkable(col: number, row: number): boolean {
    if (!this.inBounds(col, row)) return false
    return this.walkable[row * this.cols + col] === 1
  }

  /** Is `(col,row)` inside the grid (regardless of walkability)? */
  inBounds(col: number, row: number): boolean {
    return col >= 0 && col < this.cols && row >= 0 && row < this.rows
  }

  /**
   * Map a world XZ point to its grid cell, clamped into
   * `[0..cols-1] × [0..rows-1]` so callers always get a valid cell.
   */
  worldToCell(x: number, z: number): GridCell {
    const col = Math.floor((x - this.minX) / this.cellSize)
    const row = Math.floor((z - this.minZ) / this.cellSize)
    return {
      col: col < 0 ? 0 : col > this.cols - 1 ? this.cols - 1 : col,
      row: row < 0 ? 0 : row > this.rows - 1 ? this.rows - 1 : row,
    }
  }

  /**
   * World-space centre of cell `(col,row)`:
   * `minX + (col + 0.5) * cellSize`, likewise for Z. Writes into `out` if given.
   */
  cellCenter(col: number, row: number, out?: PlanarVec): PlanarVec {
    const result = out ?? { x: 0, z: 0 }
    result.x = this.minX + (col + 0.5) * this.cellSize
    result.z = this.minZ + (row + 0.5) * this.cellSize
    return result
  }

  /**
   * Find the walkable cell nearest to world `(x,z)` via an expanding Chebyshev
   * (square-ring) search out from the clamped seed cell. Returns the first
   * walkable cell found at the smallest ring radius, scanning each ring in a
   * fixed order for determinism. Returns `null` only when the ENTIRE grid is
   * unwalkable. O(cols·rows) worst case — fine for occasional snapping, but cache
   * the result rather than calling it per frame.
   */
  nearestWalkable(x: number, z: number): GridCell | null {
    const seed = this.worldToCell(x, z)
    if (this.isWalkable(seed.col, seed.row)) return seed

    const maxRadius = Math.max(this.cols, this.rows)
    for (let r = 1; r <= maxRadius; r++) {
      const colLo = seed.col - r
      const colHi = seed.col + r
      const rowLo = seed.row - r
      const rowHi = seed.row + r

      // Top + bottom edges of the ring.
      for (let col = colLo; col <= colHi; col++) {
        if (this.isWalkable(col, rowLo)) return { col, row: rowLo }
        if (this.isWalkable(col, rowHi)) return { col, row: rowHi }
      }
      // Left + right edges (excluding the corners already scanned above).
      for (let row = rowLo + 1; row <= rowHi - 1; row++) {
        if (this.isWalkable(colLo, row)) return { col: colLo, row }
        if (this.isWalkable(colHi, row)) return { col: colHi, row }
      }
    }
    return null
  }

  /**
   * Is the straight world segment `a → b` clear of the *continuous* inflated
   * blocking geometry (every obstacle grown by {@link agentRadius}, plus the
   * agent-inset play bounds)? This is the exact-geometry counterpart to the grid's
   * centre-sampled {@link isWalkable} bitmap: a cell can be "walkable" (its centre
   * is clear) while the inflated obstacle still covers part of that cell's area, so
   * a chord string-pulled across two walkable cells can still clip an inflated
   * corner. {@link hasLineOfSight} consults this so smoothing never emits such a
   * segment.
   *
   * Returns true when no source geometry was baked in (nothing to clip against).
   * Uses analytic segment ∩ inflated-AABB / segment ∩ inflated-circle tests and an
   * inset-bounds containment test — no sampling, so it cannot tunnel a thin
   * obstacle.
   */
  segmentClear(a: PlanarVec, b: PlanarVec): boolean {
    const src = this.source
    if (!src) return true
    const r = this.agentRadius
    // The whole segment must stay inside the agent-inset play bounds.
    const { minX, maxX, minZ, maxZ } = src.bounds
    if (!segmentInsideRect(a, b, minX + r, maxX - r, minZ + r, maxZ - r)) return false
    // …and must miss every (movement-blocking) obstacle inflated by the radius.
    for (const obstacle of src.obstacles) {
      if (obstacle.blocksMovement === false) continue
      if (obstacle.kind === 'circle') {
        if (segmentIntersectsCircle(a, b, obstacle.x, obstacle.z, obstacle.radius + r)) return false
      } else {
        const hw = obstacle.width / 2 + r
        const hd = obstacle.depth / 2 + r
        if (segmentIntersectsRect(a, b, obstacle.x - hw, obstacle.x + hw, obstacle.z - hd, obstacle.z + hd)) {
          return false
        }
      }
    }
    return true
  }
}

/**
 * Bake a {@link NavGrid} from an arena. Accepts either a live {@link ArenaSystem}
 * or a plain {@link ArenaMap} (which is wrapped in a fresh `ArenaSystem`). The
 * grid spans `arena.bounds`; `cols = ceil(spanX / cellSize)` and
 * `rows = ceil(spanZ / cellSize)`, each clamped to `>= 1`. A cell is walkable iff
 * its centre `c` satisfies:
 *
 * ```
 * arena.bounds.containsXZ(c.x, c.z, agentRadius) === true
 *   AND arena.isBlockedXZ(c.x, c.z, agentRadius) === false
 * ```
 *
 * so the grid already accounts for the agent's footprint and never reports a cell
 * the agent couldn't stand in.
 */
export function bakeNavGrid(source: ArenaSystem | ArenaMap, options: NavGridOptions = {}): NavGrid {
  const arena: BlockingSource = isArenaSystem(source) ? source : new ArenaSystemImpl(source as ArenaMap)
  const cellSize = options.cellSize ?? 1
  const agentRadius = options.agentRadius ?? 0

  const { minX, maxX, minZ, maxZ } = arena.bounds
  const spanX = maxX - minX
  const spanZ = maxZ - minZ
  const cols = Math.max(1, Math.ceil(spanX / cellSize))
  const rows = Math.max(1, Math.ceil(spanZ / cellSize))

  const walkable = new Uint8Array(cols * rows)
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cx = minX + (col + 0.5) * cellSize
      const cz = minZ + (row + 0.5) * cellSize
      const open = arena.bounds.containsXZ(cx, cz, agentRadius) && !arena.isBlockedXZ(cx, cz, agentRadius)
      walkable[row * cols + col] = open ? 1 : 0
    }
  }

  return new NavGrid(cols, rows, cellSize, agentRadius, minX, minZ, walkable, arena)
}

/** Options for {@link findPath}. */
export interface FindPathOptions {
  /**
   * 8-connected search (diagonals allowed) when true (default); 4-connected
   * otherwise. Diagonal steps NEVER cut corners — both shared orthogonal
   * neighbours must be walkable for the diagonal to be taken.
   */
  diagonal?: boolean
  /** Snap start/goal to their {@link NavGrid.nearestWalkable} cell. Default true. */
  snapToWalkable?: boolean
  /** String-pull the raw cell path into fewer waypoints. Default true. */
  smooth?: boolean
  /** Node-expansion cap guarding pathological inputs. Default `cols * rows * 4`. */
  maxExpansions?: number
}

/** Result of {@link findPath}. */
export interface PathResult {
  /** Did A* reach the goal? */
  found: boolean
  /**
   * World-space waypoints to follow, first = true start, last = true goal.
   * Empty when `!found`. Feed these to a {@link PathFollower}.
   */
  waypoints: PlanarVec[]
  /** Raw grid cells of the path, pre-smoothing. Empty when `!found`. */
  cells: GridCell[]
  /** Total world-metre length along `waypoints`. 0 when `!found`. */
  length: number
}

/** A fresh "no path" result. Never a shared instance, so callers may safely mutate it. */
function emptyPath(): PathResult {
  return { found: false, waypoints: [], cells: [], length: 0 }
}

/** Octile heuristic: exact cost on an 8-connected uniform grid (diagonal = √2). */
function octileHeuristic(dc: number, dr: number): number {
  const ac = dc < 0 ? -dc : dc
  const ar = dr < 0 ? -dr : dr
  const lo = ac < ar ? ac : ar
  const hi = ac < ar ? ar : ac
  return hi + (Math.SQRT2 - 1) * lo
}

/** Manhattan heuristic: exact cost on a 4-connected uniform grid. */
function manhattanHeuristic(dc: number, dr: number): number {
  const ac = dc < 0 ? -dc : dc
  const ar = dr < 0 ? -dr : dr
  return ac + ar
}

/**
 * Indexed binary min-heap over A* node ids, ordered by `f` ascending; ties broken
 * by LARGER `g` (favours nodes deeper toward the goal), then by smaller stable
 * insertion `seq` (deterministic — no randomness, no clock). Stores node ids and
 * looks up their `f`/`g`/`seq` from parallel arrays owned by the search.
 */
class NodeHeap {
  private readonly ids: number[] = []

  constructor(
    private readonly f: Float64Array,
    private readonly g: Float64Array,
    private readonly seq: Int32Array,
  ) {}

  get size(): number {
    return this.ids.length
  }

  /** True if node `a` sorts before node `b` under the deterministic ordering. */
  private less(a: number, b: number): boolean {
    const fa = this.f[a] as number
    const fb = this.f[b] as number
    if (fa !== fb) return fa < fb
    const ga = this.g[a] as number
    const gb = this.g[b] as number
    if (ga !== gb) return ga > gb
    return (this.seq[a] as number) < (this.seq[b] as number)
  }

  push(id: number): void {
    const ids = this.ids
    ids.push(id)
    let i = ids.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (!this.less(ids[i] as number, ids[parent] as number)) break
      const tmp = ids[i] as number
      ids[i] = ids[parent] as number
      ids[parent] = tmp
      i = parent
    }
  }

  pop(): number {
    const ids = this.ids
    const top = ids[0] as number
    const last = ids.pop() as number
    if (ids.length > 0) {
      ids[0] = last
      let i = 0
      const n = ids.length
      for (;;) {
        const left = 2 * i + 1
        const right = left + 1
        let smallest = i
        if (left < n && this.less(ids[left] as number, ids[smallest] as number)) smallest = left
        if (right < n && this.less(ids[right] as number, ids[smallest] as number)) smallest = right
        if (smallest === i) break
        const tmp = ids[i] as number
        ids[i] = ids[smallest] as number
        ids[smallest] = tmp
        i = smallest
      }
    }
    return top
  }
}

/** 8 neighbour offsets: the first 4 are orthogonal, the last 4 are diagonal. */
const NEIGHBOURS: ReadonlyArray<readonly [dc: number, dr: number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
]

/**
 * Deterministic grid-A* from `start` to `goal` (world XZ). Uses an octile
 * heuristic when diagonal, manhattan when orthogonal — both admissible, so A*
 * returns a shortest grid path. The open set is a real binary min-heap
 * ({@link NodeHeap}); ties resolve by larger `g` then stable insertion order, so
 * the same inputs always yield the same path. Diagonal moves are corner-safe: a
 * step to `(col±1, row±1)` is allowed only when BOTH shared orthogonal cells
 * `(col±1, row)` and `(col, row±1)` are walkable, so agents never clip a wall
 * corner. The search always terminates via a closed set plus `maxExpansions`.
 *
 * Returns world-space {@link PathResult.waypoints} (cell centres along the path),
 * but with the first waypoint replaced by the true `start` and the last by the
 * true `goal`. When `smooth`, the cell path is string-pulled
 * ({@link smoothPath}) into fewer waypoints first. `found` is false when no path
 * exists or when start/goal can't be snapped to a walkable cell. These waypoints
 * are the *WHERE*; a {@link PathFollower} + {@link SteeringStrategy} handle the
 * *HOW*.
 */
export function findPath(
  grid: NavGrid,
  start: PlanarVec,
  goal: PlanarVec,
  options: FindPathOptions = {},
): PathResult {
  const diagonal = options.diagonal ?? true
  const snap = options.snapToWalkable ?? true
  const smooth = options.smooth ?? true
  const maxExpansions = options.maxExpansions ?? grid.cols * grid.rows * 4

  const startCell = resolveCell(grid, start, snap)
  const goalCell = resolveCell(grid, goal, snap)
  if (!startCell || !goalCell) return emptyPath()

  const cols = grid.cols
  const total = cols * grid.rows
  const startId = startCell.row * cols + startCell.col
  const goalId = goalCell.row * cols + goalCell.col

  const g = new Float64Array(total).fill(Infinity)
  const f = new Float64Array(total).fill(Infinity)
  const seq = new Int32Array(total).fill(-1)
  const cameFrom = new Int32Array(total).fill(-1)
  const closed = new Uint8Array(total)

  const heuristic = diagonal ? octileHeuristic : manhattanHeuristic
  const neighbourCount = diagonal ? 8 : 4

  let nextSeq = 0
  g[startId] = 0
  f[startId] = heuristic(goalCell.col - startCell.col, goalCell.row - startCell.row)
  seq[startId] = nextSeq++

  const open = new NodeHeap(f, g, seq)
  open.push(startId)

  let expansions = 0
  let reached = false

  while (open.size > 0) {
    const current = open.pop()
    if (closed[current] === 1) continue
    if (current === goalId) {
      reached = true
      break
    }
    closed[current] = 1
    if (++expansions > maxExpansions) break

    const col = current % cols
    const row = (current - col) / cols
    const currentG = g[current] as number
    for (let n = 0; n < neighbourCount; n++) {
      const offset = NEIGHBOURS[n] as readonly [number, number]
      const dc = offset[0]
      const dr = offset[1]
      const ncol = col + dc
      const nrow = row + dr
      if (!grid.isWalkable(ncol, nrow)) continue
      if (dc !== 0 && dr !== 0) {
        // Corner-cutting guard: both shared orthogonal cells must be open.
        if (!grid.isWalkable(col + dc, row) || !grid.isWalkable(col, row + dr)) continue
      }
      const nid = nrow * cols + ncol
      if (closed[nid] === 1) continue
      const step = dc !== 0 && dr !== 0 ? Math.SQRT2 : 1
      const tentative = currentG + step
      if (tentative < (g[nid] as number)) {
        cameFrom[nid] = current
        g[nid] = tentative
        f[nid] = tentative + heuristic(goalCell.col - ncol, goalCell.row - nrow)
        seq[nid] = nextSeq++
        open.push(nid)
      }
    }
  }

  if (!reached) return emptyPath()

  // Reconstruct cell path start→goal.
  const cells: GridCell[] = []
  for (let id = goalId; id !== -1; id = cameFrom[id] as number) {
    const col = id % cols
    const row = (id - col) / cols
    cells.push({ col, row })
    if (id === startId) break
  }
  cells.reverse()

  // Cell centres → world waypoints, then pin the true endpoints. When the whole
  // path collapses to a single cell, the start and goal still need to be two
  // distinct waypoints — a single shared index would otherwise drop the start
  // and report length 0.
  let waypoints: PlanarVec[]
  if (cells.length === 1) {
    waypoints = [
      { x: start.x, z: start.z },
      { x: goal.x, z: goal.z },
    ]
  } else {
    waypoints = cells.map((cell) => grid.cellCenter(cell.col, cell.row))
    waypoints[0] = { x: start.x, z: start.z }
    waypoints[waypoints.length - 1] = { x: goal.x, z: goal.z }
  }

  if (smooth) waypoints = smoothPath(grid, waypoints)

  return { found: true, waypoints, cells, length: pathLength(waypoints) }
}

/** Snap `point` to a walkable cell, or use its clamped cell directly. Null when unsnappable. */
function resolveCell(grid: NavGrid, point: PlanarVec, snap: boolean): GridCell | null {
  if (snap) return grid.nearestWalkable(point.x, point.z)
  const cell = grid.worldToCell(point.x, point.z)
  return grid.isWalkable(cell.col, cell.row) ? cell : null
}

/**
 * Is the whole segment `a → b` inside the axis-aligned rectangle
 * `[minX,maxX] × [minZ,maxZ]`? The rectangle is convex, so a segment lies inside
 * iff both endpoints do. A degenerate (inverted) rectangle — produced when
 * `agentRadius` inset collapses tiny bounds — contains nothing.
 */
function segmentInsideRect(
  a: PlanarVec,
  b: PlanarVec,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
): boolean {
  if (minX > maxX || minZ > maxZ) return false
  return (
    a.x >= minX && a.x <= maxX && a.z >= minZ && a.z <= maxZ &&
    b.x >= minX && b.x <= maxX && b.z >= minZ && b.z <= maxZ
  )
}

/**
 * Does the segment `a → b` touch or enter the axis-aligned rectangle
 * `[minX,maxX] × [minZ,maxZ]`? Liang–Barsky slab clip on the XZ plane; a grazing
 * contact counts as a hit (closed rectangle, matching `pointInObstacle`).
 */
function segmentIntersectsRect(
  a: PlanarVec,
  b: PlanarVec,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
): boolean {
  const dx = b.x - a.x
  const dz = b.z - a.z
  // Clip the parameter range [0,1] against the four slabs; survives ⇒ overlap.
  let t0 = 0
  let t1 = 1
  const edges: ReadonlyArray<readonly [p: number, q: number]> = [
    [-dx, a.x - minX],
    [dx, maxX - a.x],
    [-dz, a.z - minZ],
    [dz, maxZ - a.z],
  ]
  for (const [p, q] of edges) {
    if (p === 0) {
      // Segment parallel to this slab: outside it ⇒ no intersection at all.
      if (q < 0) return false
      continue
    }
    const t = q / p
    if (p < 0) {
      if (t > t1) return false
      if (t > t0) t0 = t
    } else {
      if (t < t0) return false
      if (t < t1) t1 = t
    }
  }
  return t0 <= t1
}

/**
 * Does the segment `a → b` come within `radius` of `(cx,cz)` (i.e. touch/enter
 * the circle)? Computes the minimum distance from the centre to the segment and
 * compares its square against `radius²`. A grazing contact counts as a hit.
 */
function segmentIntersectsCircle(
  a: PlanarVec,
  b: PlanarVec,
  cx: number,
  cz: number,
  radius: number,
): boolean {
  const dx = b.x - a.x
  const dz = b.z - a.z
  const lenSq = dx * dx + dz * dz
  let t = 0
  if (lenSq > 0) {
    t = ((cx - a.x) * dx + (cz - a.z) * dz) / lenSq
    if (t < 0) t = 0
    else if (t > 1) t = 1
  }
  const px = a.x + t * dx
  const pz = a.z + t * dz
  const distSq = (px - cx) * (px - cx) + (pz - cz) * (pz - cz)
  return distSq <= radius * radius
}

/** Sum of segment lengths along `waypoints`. */
function pathLength(waypoints: readonly PlanarVec[]): number {
  let length = 0
  for (let i = 1; i < waypoints.length; i++) {
    const prev = waypoints[i - 1] as PlanarVec
    const curr = waypoints[i] as PlanarVec
    length += Math.hypot(curr.x - prev.x, curr.z - prev.z)
  }
  return length
}

/**
 * Is the straight world segment `a → b` clear of blocking geometry? Two layers,
 * both of which must pass:
 *
 * 1. An integer supercover/DDA grid traversal (visits every cell the segment
 *    touches, including the cells flanking a corner crossing) that returns false
 *    the moment it enters a non-walkable cell — so it never tunnels diagonally
 *    through a blocked corner.
 * 2. An exact continuous {@link NavGrid.segmentClear} check against the *inflated*
 *    obstacle/bounds geometry. The grid bitmap only samples cell centres, so a
 *    cell can be "walkable" while the inflated obstacle still covers part of its
 *    area; without this layer a string-pulled chord could clip that covered
 *    corner even though every stepped cell's centre is clear.
 *
 * Both endpoints are expected to lie in walkable cells. This is the visibility
 * test {@link smoothPath} uses to collapse waypoints.
 */
export function hasLineOfSight(grid: NavGrid, a: PlanarVec, b: PlanarVec): boolean {
  const start = grid.worldToCell(a.x, a.z)
  const end = grid.worldToCell(b.x, b.z)
  if (!grid.isWalkable(start.col, start.row)) return false
  if (!grid.isWalkable(end.col, end.row)) return false
  if (!grid.segmentClear(a, b)) return false

  let col = start.col
  let row = start.row
  const dCol = end.col - col
  const dRow = end.row - row
  const stepCol = dCol > 0 ? 1 : dCol < 0 ? -1 : 0
  const stepRow = dRow > 0 ? 1 : dRow < 0 ? -1 : 0
  const absCol = dCol < 0 ? -dCol : dCol
  const absRow = dRow < 0 ? -dRow : dRow

  // Supercover traversal: step the axis whose next grid line is nearer; on a tie
  // (an exact corner crossing) check both flanking cells before the diagonal step
  // so visibility can't slip through a blocked corner.
  let n = absCol + absRow
  let err = absCol - absRow
  const ddCol = absCol * 2
  const ddRow = absRow * 2

  for (; n > 0; n--) {
    if (!grid.isWalkable(col, row)) return false
    if (err > 0) {
      col += stepCol
      err -= ddRow
    } else if (err < 0) {
      row += stepRow
      err += ddCol
    } else {
      // Exact diagonal crossing: both flanking cells must be open.
      if (!grid.isWalkable(col + stepCol, row) || !grid.isWalkable(col, row + stepRow)) return false
      col += stepCol
      row += stepRow
      err = err - ddRow + ddCol
      n--
    }
  }
  return grid.isWalkable(col, row)
}

/**
 * Greedy string-pull smoothing. Keeps `waypoints[0]`, then from the current
 * anchor advances to the FURTHEST later waypoint still directly visible
 * ({@link hasLineOfSight}) and pins that, repeating until the end. Always keeps
 * the final waypoint, and never emits a segment that crosses a non-walkable cell
 * — so the smoothed path is shorter but still collision-safe. Runtime scales with
 * waypoint count × the line-of-sight cell count per check.
 */
export function smoothPath(grid: NavGrid, waypoints: readonly PlanarVec[]): PlanarVec[] {
  if (waypoints.length <= 2) return waypoints.map((p) => ({ x: p.x, z: p.z }))

  const first = waypoints[0] as PlanarVec
  const out: PlanarVec[] = [{ x: first.x, z: first.z }]
  let anchor = 0
  while (anchor < waypoints.length - 1) {
    const from = waypoints[anchor] as PlanarVec
    // Furthest waypoint still visible from the anchor (at least anchor + 1).
    let furthest = anchor + 1
    for (let j = waypoints.length - 1; j > anchor; j--) {
      if (hasLineOfSight(grid, from, waypoints[j] as PlanarVec)) {
        furthest = j
        break
      }
    }
    const pick = waypoints[furthest] as PlanarVec
    out.push({ x: pick.x, z: pick.z })
    anchor = furthest
  }
  return out
}

/** Options for {@link PathFollower}. */
export interface PathFollowerOptions {
  /** Distance at which the active waypoint counts as reached. Default 0.5. */
  arriveRadius?: number
}

/**
 * Cursor over a waypoint list. Each {@link update} advances past any waypoints
 * already within `arriveRadius` of the agent, then returns a {@link SteerView}
 * pointing at the active waypoint — the exact contract the steering layer
 * consumes, so the follower is the bridge from a *path* (where) to *steering*
 * (how). When the last waypoint is reached it is `done` and returns a zero view
 * (`dist=0, dirX=0, dirZ=0`). Swap routes mid-flight with {@link setPath}.
 */
export class PathFollower {
  private waypoints: PlanarVec[]
  private cursor = 0
  private readonly arriveRadius: number

  constructor(waypoints: readonly PlanarVec[], options: PathFollowerOptions = {}) {
    this.waypoints = waypoints.map((p) => ({ x: p.x, z: p.z }))
    this.arriveRadius = options.arriveRadius ?? 0.5
  }

  /** True once every waypoint has been consumed. */
  get done(): boolean {
    return this.cursor >= this.waypoints.length
  }

  /** Index of the active (next) waypoint; equals the waypoint count when `done`. */
  get index(): number {
    return this.cursor
  }

  /** The active waypoint, or null when `done`. */
  target(): PlanarVec | null {
    if (this.done) return null
    const wp = this.waypoints[this.cursor] as PlanarVec
    return { x: wp.x, z: wp.z }
  }

  /**
   * Advance past any waypoints within `arriveRadius` of `position`, then return a
   * {@link SteerView} toward the active waypoint. Returns a zero view when `done`.
   */
  update(position: PlanarVec): SteerView {
    while (this.cursor < this.waypoints.length) {
      const wp = this.waypoints[this.cursor] as PlanarVec
      const dist = Math.hypot(wp.x - position.x, wp.z - position.z)
      if (dist <= this.arriveRadius) {
        this.cursor++
        continue
      }
      return steerViewToWaypoint(position, wp)
    }
    return { dist: 0, dirX: 0, dirZ: 0 }
  }

  /** Replace the route and rewind the cursor to the start of the new path. */
  setPath(waypoints: readonly PlanarVec[]): void {
    this.waypoints = waypoints.map((p) => ({ x: p.x, z: p.z }))
    this.cursor = 0
  }
}

/**
 * Build the {@link SteerView} from `from` toward `to`: `dist = hypot(dx, dz)` and
 * a normalised `(dirX, dirZ)`, or `(0, 0)` when the points coincide. This is the
 * adapter that lets a pathfinding waypoint drive the same steering input a
 * "chase the player" target would — pathfinding picks `to`, steering decides what
 * to do with the direction.
 */
export function steerViewToWaypoint(from: PlanarVec, to: PlanarVec): SteerView {
  const dx = to.x - from.x
  const dz = to.z - from.z
  const dist = Math.hypot(dx, dz)
  if (dist <= 0) return { dist: 0, dirX: 0, dirZ: 0 }
  return { dist, dirX: dx / dist, dirZ: dz / dist }
}
