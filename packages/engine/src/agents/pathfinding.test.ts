import { expect, test } from 'bun:test'

import { ArenaSystem, type ArenaMap, type MapObstacle } from '../world/map'
import {
  bakeNavGrid,
  findPath,
  hasLineOfSight,
  smoothPath,
  steerViewToWaypoint,
  NavGrid,
  PathFollower,
  type GridCell,
} from './pathfinding'

// A 10x10-cell arena: square bounds half=5 spans -5..5 (10 metres each axis), so
// at cellSize=1 we get exactly 10 cols x 10 rows. Cell (col,row) centre is at
// world (col - 4.5, row - 4.5); worldToCell(x,z) = (floor(x+5), floor(z+5)).
function makeOpenMap(obstacles: readonly MapObstacle[] = []): ArenaMap {
  return {
    id: 'pathfinding-test',
    bounds: { kind: 'square', half: 5 },
    obstacles,
  }
}

/** Cell centre world coordinate for the half=5 / cellSize=1 grid. */
function centre(col: number): number {
  return col - 4.5
}

function cellKey(cell: GridCell): string {
  return `${cell.col},${cell.row}`
}

// --- bakeNavGrid ---------------------------------------------------------------

test('bakeNavGrid derives grid dimensions from bounds and cellSize', () => {
  const grid = bakeNavGrid(makeOpenMap(), { cellSize: 1 })
  expect(grid.cols).toBe(10)
  expect(grid.rows).toBe(10)
  expect(grid.cellSize).toBe(1)
  expect(grid.agentRadius).toBe(0)
  expect(grid.minX).toBe(-5)
  expect(grid.minZ).toBe(-5)
})

test('bakeNavGrid clamps to at least one cell and respects cellSize ceiling', () => {
  // half=5 span 10, cellSize 3 -> ceil(10/3) = 4 cells each axis.
  const coarse = bakeNavGrid(makeOpenMap(), { cellSize: 3 })
  expect(coarse.cols).toBe(4)
  expect(coarse.rows).toBe(4)
})

test('bakeNavGrid accepts a live ArenaSystem as well as plain map data', () => {
  const arena = new ArenaSystem(makeOpenMap())
  const grid = bakeNavGrid(arena, { cellSize: 1 })
  expect(grid.cols).toBe(10)
  expect(grid.rows).toBe(10)
  // Open arena: every cell walkable.
  let walkable = 0
  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.cols; col++) {
      if (grid.isWalkable(col, row)) walkable++
    }
  }
  expect(walkable).toBe(100)
})

test('bakeNavGrid marks the cells covered by a wall obstacle non-walkable', () => {
  // A 2-wide x 8-deep rect wall centred at x=0 spans x in [-1,1], z in [-4,4].
  // Cell centres are on the half-integer line (col - 4.5). The cells whose centre
  // x is within [-1,1] are cols 4 (-0.5) and 5 (0.5); rows 1..8 have centre z in
  // [-3.5,3.5] which lies inside [-4,4].
  const grid = bakeNavGrid(
    makeOpenMap([{ kind: 'rect', id: 'wall', x: 0, z: 0, width: 2, depth: 8 }]),
    { cellSize: 1 },
  )
  for (let row = 1; row <= 8; row++) {
    expect(grid.isWalkable(4, row)).toBe(false)
    expect(grid.isWalkable(5, row)).toBe(false)
  }
  // Columns to either side of the wall stay open.
  expect(grid.isWalkable(3, 4)).toBe(true)
  expect(grid.isWalkable(6, 4)).toBe(true)
  // The wall's top and bottom edges (rows 0 and 9, centre z = +-4.5) are clear.
  expect(grid.isWalkable(4, 0)).toBe(true)
  expect(grid.isWalkable(5, 9)).toBe(true)
})

test('bakeNavGrid agentRadius inflation blocks cells adjacent to a wall', () => {
  const obstacles: readonly MapObstacle[] = [
    { kind: 'rect', id: 'wall', x: 0, z: 0, width: 2, depth: 8 },
  ]
  const tight = bakeNavGrid(makeOpenMap(obstacles), { cellSize: 1, agentRadius: 0 })
  // Without inflation the column next to the wall (col 3, centre x=-1.5) is open.
  expect(tight.isWalkable(3, 4)).toBe(true)

  const inflated = bakeNavGrid(makeOpenMap(obstacles), { cellSize: 1, agentRadius: 0.6 })
  expect(inflated.agentRadius).toBe(0.6)
  // With a 0.6 inflation the wall edge x=+-1 reaches centre x=-1.5 (gap 0.5 < 0.6),
  // so col 3 is now considered blocked.
  expect(inflated.isWalkable(3, 4)).toBe(false)
  // col 2 (centre x=-2.5, gap 1.5 > 0.6) stays walkable.
  expect(inflated.isWalkable(2, 4)).toBe(true)
})

test('bakeNavGrid agentRadius insets the bounds (perimeter cells become unwalkable)', () => {
  const grid = bakeNavGrid(makeOpenMap(), { cellSize: 1, agentRadius: 0.6 })
  // Edge cell col 0 centre x=-4.5; bounds.containsXZ requires x >= -5 + 0.6 = -4.4,
  // so -4.5 < -4.4 fails and the perimeter ring is unwalkable.
  expect(grid.isWalkable(0, 5)).toBe(false)
  expect(grid.isWalkable(9, 5)).toBe(false)
  expect(grid.isWalkable(5, 0)).toBe(false)
  expect(grid.isWalkable(5, 9)).toBe(false)
  // Interior cells stay open.
  expect(grid.isWalkable(5, 5)).toBe(true)
})

test('worldToCell and cellCenter round-trip within half a cell', () => {
  const grid = bakeNavGrid(makeOpenMap(), { cellSize: 1 })
  for (const [col, row] of [
    [0, 0],
    [3, 7],
    [9, 9],
    [5, 2],
  ] as const) {
    const c = grid.cellCenter(col, row)
    const back = grid.worldToCell(c.x, c.z)
    expect(back.col).toBe(col)
    expect(back.row).toBe(row)
    // The centre is exactly the cell centre, so the round-trip error is 0.
    const recentre = grid.cellCenter(back.col, back.row)
    expect(Math.abs(recentre.x - c.x)).toBeLessThanOrEqual(grid.cellSize / 2)
    expect(Math.abs(recentre.z - c.z)).toBeLessThanOrEqual(grid.cellSize / 2)
  }
})

test('worldToCell clamps out-of-range points into the grid', () => {
  const grid = bakeNavGrid(makeOpenMap(), { cellSize: 1 })
  expect(grid.worldToCell(-1000, -1000)).toEqual({ col: 0, row: 0 })
  expect(grid.worldToCell(1000, 1000)).toEqual({ col: 9, row: 9 })
})

test('cellCenter writes into the provided out vector', () => {
  const grid = bakeNavGrid(makeOpenMap(), { cellSize: 1 })
  const out = { x: 0, z: 0 }
  const result = grid.cellCenter(2, 3, out)
  expect(result).toBe(out)
  expect(out.x).toBeCloseTo(centre(2), 10)
  expect(out.z).toBeCloseTo(centre(3), 10)
})

test('isWalkable and inBounds reject out-of-range cells', () => {
  const grid = bakeNavGrid(makeOpenMap(), { cellSize: 1 })
  expect(grid.inBounds(-1, 0)).toBe(false)
  expect(grid.inBounds(0, 10)).toBe(false)
  expect(grid.inBounds(0, 0)).toBe(true)
  expect(grid.isWalkable(-1, 0)).toBe(false)
  expect(grid.isWalkable(0, 10)).toBe(false)
})

test('nearestWalkable returns an adjacent walkable cell for a point inside an obstacle', () => {
  // Circle obstacle blocks a small cluster of cells around (0.5, 0.5).
  const grid = bakeNavGrid(
    makeOpenMap([{ kind: 'circle', id: 'pillar', x: 0.5, z: 0.5, radius: 1 }]),
    { cellSize: 1 },
  )
  // The cell containing (0.5,0.5) is col 5 row 5 and it is blocked.
  const seed = grid.worldToCell(0.5, 0.5)
  expect(grid.isWalkable(seed.col, seed.row)).toBe(false)

  const near = grid.nearestWalkable(0.5, 0.5)
  expect(near).not.toBeNull()
  expect(grid.isWalkable(near!.col, near!.row)).toBe(true)
  // Result is within the immediate Chebyshev ring of the seed cell.
  expect(Math.abs(near!.col - seed.col)).toBeLessThanOrEqual(2)
  expect(Math.abs(near!.row - seed.row)).toBeLessThanOrEqual(2)
})

test('nearestWalkable returns the seed cell when it is already walkable', () => {
  const grid = bakeNavGrid(makeOpenMap(), { cellSize: 1 })
  const seed = grid.worldToCell(0, 0)
  expect(grid.nearestWalkable(0, 0)).toEqual(seed)
})

test('nearestWalkable returns null when no cell in the grid is walkable', () => {
  // A circle big enough to swallow the whole 10x10 arena leaves zero walkable cells.
  const grid = bakeNavGrid(
    makeOpenMap([{ kind: 'circle', id: 'dome', x: 0, z: 0, radius: 50 }]),
    { cellSize: 1 },
  )
  let walkable = 0
  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.cols; col++) {
      if (grid.isWalkable(col, row)) walkable++
    }
  }
  expect(walkable).toBe(0)
  expect(grid.nearestWalkable(0, 0)).toBeNull()
})

// --- findPath ------------------------------------------------------------------

test('findPath finds a near-straight short route across open space', () => {
  const grid = bakeNavGrid(makeOpenMap(), { cellSize: 1 })
  const start: { x: number; z: number } = { x: centre(1), z: centre(1) }
  const goal: { x: number; z: number } = { x: centre(8), z: centre(1) }
  const result = findPath(grid, start, goal)

  expect(result.found).toBe(true)
  expect(result.waypoints.length).toBeGreaterThanOrEqual(2)
  // First waypoint is the true start, last is the true goal.
  expect(result.waypoints[0]).toEqual(start)
  expect(result.waypoints[result.waypoints.length - 1]).toEqual(goal)

  // After smoothing a straight open shot collapses to a single segment.
  expect(result.waypoints.length).toBe(2)

  const straight = Math.hypot(goal.x - start.x, goal.z - start.z)
  // Length is the straight-line distance (smoothed, open space).
  expect(result.length).toBeCloseTo(straight, 6)
})

test('findPath start === goal returns a trivial found path', () => {
  const grid = bakeNavGrid(makeOpenMap(), { cellSize: 1 })
  const p: { x: number; z: number } = { x: 0.5, z: 0.5 }
  const result = findPath(grid, p, p)
  expect(result.found).toBe(true)
  expect(result.length).toBe(0)
  expect(result.waypoints.length).toBeGreaterThanOrEqual(1)
  // Every waypoint coincides with the point.
  for (const wp of result.waypoints) {
    expect(wp.x).toBeCloseTo(0.5, 10)
    expect(wp.z).toBeCloseTo(0.5, 10)
  }
})

test('findPath keeps both endpoints when distinct start/goal share one cell', () => {
  const grid = bakeNavGrid(makeOpenMap(), { cellSize: 1 })
  // Two distinct points that both fall in cell (5,5): worldToCell(0.2,0.2) === worldToCell(0.6,0.6).
  const start: { x: number; z: number } = { x: 0.2, z: 0.2 }
  const goal: { x: number; z: number } = { x: 0.6, z: 0.6 }
  expect(grid.worldToCell(start.x, start.z)).toEqual(grid.worldToCell(goal.x, goal.z))

  const result = findPath(grid, start, goal)
  expect(result.found).toBe(true)
  // The start must survive as the first waypoint and the goal as the last — a
  // single-cell path must not collapse both endpoints onto one index.
  expect(result.waypoints[0]!).toEqual({ x: start.x, z: start.z })
  expect(result.waypoints[result.waypoints.length - 1]!).toEqual({ x: goal.x, z: goal.z })
  // Length is the true start→goal distance, not 0.
  expect(result.length).toBeCloseTo(Math.hypot(0.4, 0.4), 10)
})

test('findPath routes around a wall: longer than straight-line and avoids blocked cells', () => {
  // Vertical wall in cols 4 and 5 spanning rows 0..8, leaving a gap only at row 9.
  // width 2 (x in [-1,1] -> cols 4,5), depth 9 centred at z=-0.5 -> z in [-5,4].
  const obstacles: readonly MapObstacle[] = [
    { kind: 'rect', id: 'wall', x: 0, z: -0.5, width: 2, depth: 9 },
  ]
  const grid = bakeNavGrid(makeOpenMap(obstacles), { cellSize: 1 })

  // Confirm the wall really separates the two halves except at the very top row.
  for (let row = 0; row <= 8; row++) {
    expect(grid.isWalkable(4, row)).toBe(false)
    expect(grid.isWalkable(5, row)).toBe(false)
  }
  expect(grid.isWalkable(4, 9)).toBe(true)
  expect(grid.isWalkable(5, 9)).toBe(true)

  const start: { x: number; z: number } = { x: centre(1), z: centre(1) }
  const goal: { x: number; z: number } = { x: centre(8), z: centre(1) }
  const result = findPath(grid, start, goal, { smooth: false })

  expect(result.found).toBe(true)
  // Forced detour around the wall is strictly longer than the straight line.
  const straight = Math.hypot(goal.x - start.x, goal.z - start.z)
  expect(result.length).toBeGreaterThan(straight)

  // Not one cell of the path touches a blocked cell.
  for (const cell of result.cells) {
    expect(grid.isWalkable(cell.col, cell.row)).toBe(true)
  }
  // The route must pass through the only gap row (row 9).
  const usesGap = result.cells.some((c) => c.row === 9)
  expect(usesGap).toBe(true)
})

test('findPath never cuts a corner through a 2x2 diagonal pinch of blockers', () => {
  // Two diagonally-opposite blockers form a pinch around cell (5,5)/(4,4) etc.
  // Block cell (5,4) and (4,5). A diagonal step from (4,4) to (5,5) would clip
  // between them; corner-cutting must be forbidden, so the path goes around.
  // Cell (5,4) centre = (0.5, -0.5); cell (4,5) centre = (-0.5, 0.5).
  const obstacles: readonly MapObstacle[] = [
    { kind: 'rect', id: 'b1', x: 0.5, z: -0.5, width: 0.5, depth: 0.5 },
    { kind: 'rect', id: 'b2', x: -0.5, z: 0.5, width: 0.5, depth: 0.5 },
  ]
  const grid = bakeNavGrid(makeOpenMap(obstacles), { cellSize: 1 })
  expect(grid.isWalkable(5, 4)).toBe(false)
  expect(grid.isWalkable(4, 5)).toBe(false)
  expect(grid.isWalkable(4, 4)).toBe(true)
  expect(grid.isWalkable(5, 5)).toBe(true)

  const start: { x: number; z: number } = { x: centre(4), z: centre(4) }
  const goal: { x: number; z: number } = { x: centre(5), z: centre(5) }
  const result = findPath(grid, start, goal, { smooth: false })

  expect(result.found).toBe(true)
  // The raw cell path must never contain the forbidden diagonal squeeze: there is
  // no consecutive (4,4)->(5,5) (or reverse) hop in the cell list.
  for (let i = 1; i < result.cells.length; i++) {
    const a = result.cells[i - 1]!
    const b = result.cells[i]!
    const dc = Math.abs(a.col - b.col)
    const dr = Math.abs(a.row - b.row)
    const diagonal = dc === 1 && dr === 1
    if (diagonal) {
      // For any diagonal step both shared orthogonal cells must be walkable.
      expect(grid.isWalkable(b.col, a.row)).toBe(true)
      expect(grid.isWalkable(a.col, b.row)).toBe(true)
    }
  }
  // And every visited cell is walkable.
  for (const cell of result.cells) {
    expect(grid.isWalkable(cell.col, cell.row)).toBe(true)
  }
})

test('findPath returns found=false for an unreachable goal', () => {
  // A full wall across cols 4,5 spanning every row seals the arena into two halves.
  const obstacles: readonly MapObstacle[] = [
    { kind: 'rect', id: 'wall', x: 0, z: 0, width: 2, depth: 10 },
  ]
  const grid = bakeNavGrid(makeOpenMap(obstacles), { cellSize: 1 })
  for (let row = 0; row < 10; row++) {
    expect(grid.isWalkable(4, row)).toBe(false)
    expect(grid.isWalkable(5, row)).toBe(false)
  }
  const start: { x: number; z: number } = { x: centre(1), z: centre(5) }
  const goal: { x: number; z: number } = { x: centre(8), z: centre(5) }
  const result = findPath(grid, start, goal)
  expect(result.found).toBe(false)
  expect(result.waypoints).toEqual([])
  expect(result.cells).toEqual([])
  expect(result.length).toBe(0)
})

test('findPath snaps start/goal inside an obstacle when snapToWalkable (default)', () => {
  const obstacles: readonly MapObstacle[] = [
    { kind: 'circle', id: 'pillar', x: 0.5, z: 0.5, radius: 1 },
  ]
  const grid = bakeNavGrid(makeOpenMap(obstacles), { cellSize: 1 })
  // Start sits inside the blocked circle.
  const start: { x: number; z: number } = { x: 0.5, z: 0.5 }
  const goal: { x: number; z: number } = { x: centre(9), z: centre(9) }
  const result = findPath(grid, start, goal, { snapToWalkable: true })
  expect(result.found).toBe(true)
  expect(result.waypoints.length).toBeGreaterThanOrEqual(2)
})

test('findPath respects snapToWalkable=false: blocked start yields found=false', () => {
  const obstacles: readonly MapObstacle[] = [
    { kind: 'circle', id: 'pillar', x: 0.5, z: 0.5, radius: 1 },
  ]
  const grid = bakeNavGrid(makeOpenMap(obstacles), { cellSize: 1 })
  const start: { x: number; z: number } = { x: 0.5, z: 0.5 }
  const goal: { x: number; z: number } = { x: centre(9), z: centre(9) }
  const result = findPath(grid, start, goal, { snapToWalkable: false })
  expect(result.found).toBe(false)
})

test('findPath is deterministic: identical inputs yield identical output', () => {
  const obstacles: readonly MapObstacle[] = [
    { kind: 'rect', id: 'wall', x: 0, z: -0.5, width: 2, depth: 9 },
  ]
  const grid = bakeNavGrid(makeOpenMap(obstacles), { cellSize: 1 })
  const start: { x: number; z: number } = { x: centre(1), z: centre(1) }
  const goal: { x: number; z: number } = { x: centre(8), z: centre(1) }
  const a = findPath(grid, start, goal)
  const b = findPath(grid, start, goal)
  expect(a.cells.map(cellKey)).toEqual(b.cells.map(cellKey))
  expect(a.length).toBe(b.length)
})

test('findPath orthogonal mode (diagonal=false) produces a 4-connected path', () => {
  const grid = bakeNavGrid(makeOpenMap(), { cellSize: 1 })
  const start: { x: number; z: number } = { x: centre(1), z: centre(1) }
  const goal: { x: number; z: number } = { x: centre(4), z: centre(4) }
  const result = findPath(grid, start, goal, { diagonal: false, smooth: false })
  expect(result.found).toBe(true)
  // Every step is orthogonal (no diagonal hops).
  for (let i = 1; i < result.cells.length; i++) {
    const a = result.cells[i - 1]!
    const b = result.cells[i]!
    const manhattan = Math.abs(a.col - b.col) + Math.abs(a.row - b.row)
    expect(manhattan).toBe(1)
  }
})

// --- hasLineOfSight ------------------------------------------------------------

test('hasLineOfSight is true across open space', () => {
  const grid = bakeNavGrid(makeOpenMap(), { cellSize: 1 })
  const a: { x: number; z: number } = { x: centre(1), z: centre(1) }
  const b: { x: number; z: number } = { x: centre(8), z: centre(8) }
  expect(hasLineOfSight(grid, a, b)).toBe(true)
})

test('hasLineOfSight is false through a wall', () => {
  const obstacles: readonly MapObstacle[] = [
    { kind: 'rect', id: 'wall', x: 0, z: 0, width: 2, depth: 10 },
  ]
  const grid = bakeNavGrid(makeOpenMap(obstacles), { cellSize: 1 })
  const a: { x: number; z: number } = { x: centre(1), z: centre(5) }
  const b: { x: number; z: number } = { x: centre(8), z: centre(5) }
  expect(hasLineOfSight(grid, a, b)).toBe(false)
})

test('hasLineOfSight is false when an endpoint sits in a blocked cell', () => {
  const obstacles: readonly MapObstacle[] = [
    { kind: 'circle', id: 'pillar', x: 0.5, z: 0.5, radius: 1 },
  ]
  const grid = bakeNavGrid(makeOpenMap(obstacles), { cellSize: 1 })
  const open: { x: number; z: number } = { x: centre(1), z: centre(1) }
  const blocked: { x: number; z: number } = { x: 0.5, z: 0.5 }
  expect(hasLineOfSight(grid, open, blocked)).toBe(false)
})

test('hasLineOfSight rejects a chord that clips an inflated obstacle corner between walkable cells', () => {
  // A cell is baked walkable when its CENTRE is clear, but an obstacle inflated by
  // agentRadius can still cover part of that walkable cell's area. A straight chord
  // between two walkable cells must NOT be approved if it sweeps through that
  // covered sliver — otherwise smoothing would let an agent clip the wall corner.
  const obstacles: readonly MapObstacle[] = [
    { kind: 'rect', id: 'corner', x: 2.5, z: -1.5, width: 1, depth: 1 },
  ]
  const grid = bakeNavGrid(makeOpenMap(obstacles), { cellSize: 1, agentRadius: 0.4 })
  // Inflated obstacle spans x in [1.6,3.4], z in [-2.4,-0.6].
  const a: { x: number; z: number } = { x: -4.8816, z: -1.1857 }
  const b: { x: number; z: number } = { x: 4.6715, z: -2.6688 }
  // Both endpoints sit in walkable cells (their centres are clear of the inflation).
  const ca = grid.worldToCell(a.x, a.z)
  const cb = grid.worldToCell(b.x, b.z)
  expect(grid.isWalkable(ca.col, ca.row)).toBe(true)
  expect(grid.isWalkable(cb.col, cb.row)).toBe(true)
  // The chord dips ~0.18 m into the inflated obstacle, so visibility must be denied.
  expect(hasLineOfSight(grid, a, b)).toBe(false)
})

test('hasLineOfSight still approves a chord that skirts an inflated obstacle without entering it', () => {
  // Guard against over-conservatism: a clear straight shot well clear of the
  // inflated obstacle must remain visible.
  const obstacles: readonly MapObstacle[] = [
    { kind: 'rect', id: 'corner', x: 2.5, z: -1.5, width: 1, depth: 1 },
  ]
  const grid = bakeNavGrid(makeOpenMap(obstacles), { cellSize: 1, agentRadius: 0.4 })
  // A horizontal chord along z = centre(8) = 3.5 is far from the obstacle (z in
  // [-2.4,-0.6]) and entirely within the inset bounds.
  const a: { x: number; z: number } = { x: centre(1), z: centre(8) }
  const b: { x: number; z: number } = { x: centre(8), z: centre(8) }
  expect(hasLineOfSight(grid, a, b)).toBe(true)
})

// --- smoothPath ----------------------------------------------------------------

test('smoothPath collapses collinear/visible waypoints', () => {
  const grid = bakeNavGrid(makeOpenMap(), { cellSize: 1 })
  const waypoints = [
    { x: centre(1), z: centre(1) },
    { x: centre(2), z: centre(1) },
    { x: centre(3), z: centre(1) },
    { x: centre(8), z: centre(1) },
  ]
  const smoothed = smoothPath(grid, waypoints)
  // All on one open line -> only endpoints survive.
  expect(smoothed.length).toBe(2)
  expect(smoothed[0]).toEqual(waypoints[0])
  expect(smoothed[smoothed.length - 1]).toEqual(waypoints[waypoints.length - 1])
})

test('smoothPath never yields a segment crossing a blocked cell', () => {
  // Wall in cols 4,5 with a single gap at row 9. A raw L-path around the wall must
  // remain collision-safe after smoothing.
  const obstacles: readonly MapObstacle[] = [
    { kind: 'rect', id: 'wall', x: 0, z: -0.5, width: 2, depth: 9 },
  ]
  const grid = bakeNavGrid(makeOpenMap(obstacles), { cellSize: 1 })
  const start: { x: number; z: number } = { x: centre(1), z: centre(1) }
  const goal: { x: number; z: number } = { x: centre(8), z: centre(1) }
  const result = findPath(grid, start, goal, { smooth: true })
  expect(result.found).toBe(true)

  // Every smoothed segment has line of sight (no segment crosses a blocked cell).
  for (let i = 1; i < result.waypoints.length; i++) {
    expect(hasLineOfSight(grid, result.waypoints[i - 1]!, result.waypoints[i]!)).toBe(true)
  }
})

test('smoothPath returns fresh copies for short paths (<= 2 waypoints)', () => {
  const grid = bakeNavGrid(makeOpenMap(), { cellSize: 1 })
  const waypoints = [
    { x: centre(1), z: centre(1) },
    { x: centre(8), z: centre(8) },
  ]
  const smoothed = smoothPath(grid, waypoints)
  expect(smoothed).toEqual(waypoints)
  // Copies, not the same object references.
  expect(smoothed[0]).not.toBe(waypoints[0])
})

// --- PathFollower / steerViewToWaypoint ----------------------------------------

test('steerViewToWaypoint returns distance and a normalised direction', () => {
  const view = steerViewToWaypoint({ x: 0, z: 0 }, { x: 3, z: 4 })
  expect(view.dist).toBeCloseTo(5, 10)
  expect(view.dirX).toBeCloseTo(0.6, 10)
  expect(view.dirZ).toBeCloseTo(0.8, 10)
  expect(Math.hypot(view.dirX, view.dirZ)).toBeCloseTo(1, 10)
})

test('steerViewToWaypoint returns a zero view for coincident points', () => {
  const view = steerViewToWaypoint({ x: 2, z: 2 }, { x: 2, z: 2 })
  expect(view).toEqual({ dist: 0, dirX: 0, dirZ: 0 })
})

test('PathFollower walks through waypoints as the position arrives at each', () => {
  const waypoints = [
    { x: 0, z: 0 },
    { x: 5, z: 0 },
    { x: 10, z: 0 },
  ]
  const follower = new PathFollower(waypoints, { arriveRadius: 0.5 })

  // Cursor starts at the first waypoint; not done.
  expect(follower.done).toBe(false)
  expect(follower.index).toBe(0)
  expect(follower.target()).toEqual({ x: 0, z: 0 })

  // Standing on waypoint 0 advances to waypoint 1; the returned view points +X.
  const v0 = follower.update({ x: 0, z: 0 })
  expect(follower.index).toBe(1)
  expect(follower.target()).toEqual({ x: 5, z: 0 })
  expect(v0.dirX).toBeCloseTo(1, 10)
  expect(v0.dirZ).toBeCloseTo(0, 10)
  expect(v0.dist).toBeCloseTo(5, 10)

  // Partway to waypoint 1 (outside arriveRadius): no advance, still pointing at it.
  const vMid = follower.update({ x: 3, z: 0 })
  expect(follower.index).toBe(1)
  expect(vMid.dist).toBeCloseTo(2, 10)
  expect(vMid.dirX).toBeCloseTo(1, 10)

  // Arrive at waypoint 1 -> advance to waypoint 2.
  follower.update({ x: 5, z: 0 })
  expect(follower.index).toBe(2)
  expect(follower.target()).toEqual({ x: 10, z: 0 })

  // Arrive at the final waypoint -> done, zero view.
  const vEnd = follower.update({ x: 10, z: 0 })
  expect(follower.done).toBe(true)
  expect(follower.index).toBe(3)
  expect(follower.target()).toBeNull()
  expect(vEnd).toEqual({ dist: 0, dirX: 0, dirZ: 0 })
})

test('PathFollower skips multiple already-arrived waypoints in one update', () => {
  const waypoints = [
    { x: 0, z: 0 },
    { x: 0.2, z: 0 },
    { x: 0.4, z: 0 },
    { x: 5, z: 0 },
  ]
  const follower = new PathFollower(waypoints, { arriveRadius: 0.5 })
  // From the origin the first three waypoints are all within arriveRadius=0.5.
  const view = follower.update({ x: 0, z: 0 })
  expect(follower.index).toBe(3)
  expect(follower.target()).toEqual({ x: 5, z: 0 })
  expect(view.dirX).toBeCloseTo(1, 10)
})

test('PathFollower setPath resets the cursor to the start of the new route', () => {
  const follower = new PathFollower([
    { x: 0, z: 0 },
    { x: 5, z: 0 },
  ])
  follower.update({ x: 0, z: 0 })
  expect(follower.index).toBe(1)

  follower.setPath([
    { x: 2, z: 2 },
    { x: 9, z: 9 },
  ])
  expect(follower.index).toBe(0)
  expect(follower.done).toBe(false)
  expect(follower.target()).toEqual({ x: 2, z: 2 })
})

test('PathFollower defaults to a 0.5 arriveRadius', () => {
  const follower = new PathFollower([
    { x: 0, z: 0 },
    { x: 5, z: 0 },
  ])
  // 0.4 from the first waypoint is within the default 0.5 radius -> advance.
  follower.update({ x: 0.4, z: 0 })
  expect(follower.index).toBe(1)
})

test('PathFollower is immediately done for an empty route', () => {
  const follower = new PathFollower([])
  expect(follower.done).toBe(true)
  expect(follower.target()).toBeNull()
  expect(follower.update({ x: 0, z: 0 })).toEqual({ dist: 0, dirX: 0, dirZ: 0 })
})

test('PathFollower copies its waypoints (mutating the source is harmless)', () => {
  const source = [
    { x: 0, z: 0 },
    { x: 5, z: 0 },
  ]
  const follower = new PathFollower(source)
  source[1]!.x = 999
  // The follower kept its own copy; the active second target is unchanged.
  follower.update({ x: 0, z: 0 })
  expect(follower.target()).toEqual({ x: 5, z: 0 })
})

// --- NavGrid construction guard -----------------------------------------------

test('NavGrid is exported and constructed by bakeNavGrid', () => {
  const grid = bakeNavGrid(makeOpenMap(), { cellSize: 1 })
  expect(grid).toBeInstanceOf(NavGrid)
})
