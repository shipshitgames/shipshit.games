import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { ArenaSystem, type RectMapObstacle } from '../world/map'
import {
  assertLdtkVersion,
  FixedSpawnProvider,
  LdtkError,
  loadLdtkLevel,
  loadLdtkProject,
  parseLdtkVersion,
  SUPPORTED_LDTK_VERSION,
  type LdtkArena,
} from './ldtk'
import type { LdtkRoot } from './ldtk-types'

const FIXTURE_PATH = join(import.meta.dir, 'fixtures/breach-arena.ldtk')
const FIXTURE_TEXT = readFileSync(FIXTURE_PATH, 'utf8')
const fixtureRoot = (): LdtkRoot => JSON.parse(FIXTURE_TEXT) as LdtkRoot

function loadArena(overrides?: Partial<Parameters<typeof loadLdtkProject>[1]>): LdtkArena {
  const project = loadLdtkProject(FIXTURE_TEXT, overrides)
  return project.arenas[0]!
}

function obstacleById(arena: LdtkArena, id: string): RectMapObstacle {
  const found = (arena.map.obstacles ?? []).find((o) => o.id === id)
  if (!found || found.kind !== 'rect') throw new Error(`missing rect obstacle ${id}`)
  return found
}

// --- version pinning ---

test('parseLdtkVersion extracts major.minor and ignores the patch', () => {
  expect(parseLdtkVersion('1.5.3')).toMatchObject({ major: 1, minor: 5 })
  expect(parseLdtkVersion('2.0')).toMatchObject({ major: 2, minor: 0 })
  expect(() => parseLdtkVersion('not-a-version')).toThrow(LdtkError)
})

test('the fixture targets the supported LDtk version', () => {
  expect(fixtureRoot().jsonVersion.startsWith(SUPPORTED_LDTK_VERSION)).toBe(true)
})

test('assertLdtkVersion throws loudly on a mismatched LDtk version', () => {
  const root = { ...fixtureRoot(), jsonVersion: '1.4.1' }
  expect(() => assertLdtkVersion(root)).toThrow(/version mismatch/i)
})

test('a mismatched version can be force-loaded with a warning instead of throwing', () => {
  const root = { ...fixtureRoot(), jsonVersion: '1.4.1' }
  const warnings: string[] = []
  const info = assertLdtkVersion(root, { allowVersionMismatch: true, onWarn: (m) => warnings.push(m) })
  expect(info.major).toBe(1)
  expect(info.minor).toBe(4)
  expect(warnings).toHaveLength(1)
  expect(warnings[0]).toMatch(/version mismatch/i)
})

test('a project without jsonVersion is rejected as not-an-LDtk-project', () => {
  expect(() => assertLdtkVersion({} as LdtkRoot)).toThrow(/missing "jsonVersion"/)
})

test('invalid JSON fails loudly as an LdtkError', () => {
  expect(() => loadLdtkProject('{ not json')).toThrow(LdtkError)
})

// --- IntGrid -> colliders ---

test('IntGrid solid cells merge into maximal rect colliders', () => {
  const arena = loadArena()
  const obstacles = arena.map.obstacles ?? []
  // border walls (top / bottom-middle / left / right) + one interior block.
  expect(obstacles).toHaveLength(5)

  const top = obstacleById(arena, 'Collision:0,0')
  expect(top).toMatchObject({ x: 0, z: -40, width: 128, depth: 16, blocksMovement: true })

  const interior = obstacleById(arena, 'Collision:3,2')
  expect(interior).toMatchObject({ x: 0, z: 0, width: 32, depth: 32 })

  const left = obstacleById(arena, 'Collision:0,1')
  expect(left).toMatchObject({ x: -56, width: 16, depth: 80 })

  expect(obstacles.every((o) => o.tags?.includes('Collision'))).toBe(true)
})

test('mergeColliders:false emits one obstacle per solid cell', () => {
  const arena = loadArena({ mergeColliders: false })
  // 28 solid cells in the fixture grid.
  expect(arena.map.obstacles).toHaveLength(28)
})

test('solidValues filters which IntGrid values count as colliders', () => {
  const none = loadArena({ solidValues: [2] }) // fixture only uses value 1
  expect(none.map.obstacles).toHaveLength(0)
  const walls = loadArena({ solidValues: [1] })
  expect(walls.map.obstacles).toHaveLength(5)
})

test('collisionLayers restricts which IntGrid layers become colliders', () => {
  expect(loadArena({ collisionLayers: ['Collision'] }).map.obstacles).toHaveLength(5)
  expect(loadArena({ collisionLayers: ['Nope'] }).map.obstacles).toHaveLength(0)
})

// --- bounds / scale / centering ---

test('a centred level maps onto symmetric rect bounds', () => {
  const arena = loadArena()
  expect(arena.map.bounds).toEqual({ kind: 'rect', minX: -64, maxX: 64, minZ: -48, maxZ: 48 })
})

test('center:false anchors the level at the world origin corner', () => {
  const arena = loadArena({ center: false })
  expect(arena.map.bounds).toEqual({ kind: 'rect', minX: 0, maxX: 128, minZ: 0, maxZ: 96 })
})

test('scale multiplies world geometry uniformly', () => {
  const arena = loadArena({ scale: 2 })
  expect(arena.map.bounds).toEqual({ kind: 'rect', minX: -128, maxX: 128, minZ: -96, maxZ: 96 })
  expect(obstacleById(arena, 'Collision:3,2')).toMatchObject({ width: 64, depth: 64 })
})

// --- entities + spawns ---

test('entity layers map to world-space entities with their fields', () => {
  const arena = loadArena()
  expect(arena.entities).toHaveLength(3)
  const pickup = arena.entities.find((e) => e.identifier === 'AmmoPickup')!
  expect(pickup).toMatchObject({ x: 24, z: -24, tags: ['pickup'] })
  expect(pickup.fields.amount).toBe(12)
})

test('spawn entities (by tag) become spawn points with lane ids', () => {
  const arena = loadArena()
  expect(arena.spawnPoints).toHaveLength(2)
  const player = arena.spawnPoints.find((s) => s.x === -40)!
  expect(player).toEqual({ x: -40, z: -24 })
  const enemy = arena.spawnPoints.find((s) => s.x === 40)!
  expect(enemy).toEqual({ x: 40, z: 24, laneId: 2 })
})

test('spawnIdentifiers overrides which entities are treated as spawns', () => {
  const arena = loadArena({ spawnIdentifiers: ['AmmoPickup'], spawnTag: '__none__' })
  expect(arena.spawnPoints).toHaveLength(1)
  expect(arena.spawnPoints[0]).toMatchObject({ x: 24, z: -24 })
})

test('a custom laneField is read off entity fields', () => {
  const arena = loadArena({ laneField: 'amount', spawnIdentifiers: ['AmmoPickup'], spawnTag: '__none__' })
  expect(arena.spawnPoints[0]).toEqual({ x: 24, z: -24, laneId: 12 })
})

test('entity position resolves to the footprint centre regardless of pivot', () => {
  // LDtk `px` is the entity PIVOT pixel. A default top-left pivot (px at the
  // cell's top-left corner) must still map to the cell centre — the same world
  // point a centre-pivot entity in that cell would produce.
  const root: LdtkRoot = {
    jsonVersion: '1.5.3',
    levels: [
      {
        identifier: 'Tiny',
        pxWid: 32,
        pxHei: 32,
        layerInstances: [
          {
            __identifier: 'Entities',
            __type: 'Entities',
            __cWid: 2,
            __cHei: 2,
            __gridSize: 16,
            entityInstances: [
              {
                __identifier: 'CornerSpawn',
                __grid: [1, 1],
                __pivot: [0, 0],
                __tags: ['spawn'],
                width: 16,
                height: 16,
                px: [16, 16],
              },
            ],
          },
        ],
      },
    ],
  }
  const arena = loadLdtkProject(root, { center: false }).arenas[0]!
  expect(arena.entities[0]).toMatchObject({ x: 24, z: 24 })
  expect(arena.spawnPoints[0]).toEqual({ x: 24, z: 24 })
})

// --- tile layers ---

test('tile layers map to render-ready tiles with flips and alpha', () => {
  const arena = loadArena()
  expect(arena.tileLayers).toHaveLength(1)
  const floor = arena.tileLayers[0]!
  expect(floor.identifier).toBe('Floor')
  expect(floor.tilesetRelPath).toBe('tiles/floor.png')
  expect(floor.tiles).toHaveLength(3)

  expect(floor.tiles[0]).toEqual({
    x: -40,
    z: -24,
    size: 16,
    src: [0, 0],
    tileId: 0,
    flipX: false,
    flipY: false,
    alpha: 1,
  })
  expect(floor.tiles[1]).toMatchObject({ flipX: true, flipY: false, src: [16, 0] })
  expect(floor.tiles[2]).toMatchObject({ flipX: false, flipY: true, alpha: 0.5 })
})

// --- layer pixel offsets ---

test('per-layer pixel offsets shift colliders, tiles and entities together', () => {
  const root = fixtureRoot()
  const OFFSET = 16
  const shifted = {
    ...root,
    levels: [
      {
        ...root.levels[0]!,
        layerInstances: (root.levels[0]!.layerInstances ?? []).map((layer) => ({
          ...layer,
          __pxTotalOffsetX: OFFSET,
          __pxTotalOffsetY: OFFSET,
        })),
      },
    ],
  }
  const base = loadLdtkProject(root).arenas[0]!
  const moved = loadLdtkProject(shifted).arenas[0]!

  const basePickup = base.entities.find((e) => e.identifier === 'AmmoPickup')!
  const movedPickup = moved.entities.find((e) => e.identifier === 'AmmoPickup')!
  expect(movedPickup).toMatchObject({ x: basePickup.x + OFFSET, z: basePickup.z + OFFSET })

  const baseInterior = obstacleById(base, 'Collision:3,2')
  const movedInterior = obstacleById(moved, 'Collision:3,2')
  expect(movedInterior).toMatchObject({ x: baseInterior.x + OFFSET, z: baseInterior.z + OFFSET })

  const baseTile = base.tileLayers[0]!.tiles[0]!
  const movedTile = moved.tileLayers[0]!.tiles[0]!
  expect(movedTile).toMatchObject({ x: baseTile.x + OFFSET, z: baseTile.z + OFFSET })
})

// --- theme + provenance ---

test('the level background colour becomes the arena ground theme', () => {
  const arena = loadArena()
  expect(arena.map.theme).toEqual({ id: 'BreachArena', groundColor: '#0d0a0a' })
})

test('the arena records its LDtk provenance', () => {
  const arena = loadArena()
  expect(arena.source).toEqual({ jsonVersion: '1.5.3', level: 'BreachArena' })
})

// --- arena round-trip into the engine ---

test('the loaded arena drives ArenaSystem blocking + bounds', () => {
  const arena = loadArena()
  const system = new ArenaSystem(arena.map)
  expect(system.isBlockedXZ(0, 0)).toBe(true) // interior wall block
  expect(system.isBlockedXZ(-40, -24)).toBe(false) // open cell
  expect(system.bounds.containsXZ(-40, -24)).toBe(true)
  for (const spawn of arena.spawnPoints) {
    expect(system.bounds.containsXZ(spawn.x, spawn.z)).toBe(true)
    expect(system.isBlockedXZ(spawn.x, spawn.z)).toBe(false)
  }
})

// --- loadLdtkLevel + multi-level projects ---

test('loadLdtkLevel maps a single level directly', () => {
  const root = fixtureRoot()
  const arena = loadLdtkLevel(root, root.levels[0]!)
  expect(arena.id).toBe('BreachArena')
})

test('a level missing pxWid/pxHei fails loudly', () => {
  const root = fixtureRoot()
  const broken = { ...root.levels[0]!, pxWid: undefined } as unknown as LdtkRoot['levels'][number]
  expect(() => loadLdtkLevel(root, broken)).toThrow(/invalid pxWid/)
})

test('a level with non-finite or non-positive pxWid fails loudly instead of poisoning coordinates', () => {
  const root = fixtureRoot()
  for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -128, 0]) {
    const broken = { ...root.levels[0]!, pxWid: bad } as unknown as LdtkRoot['levels'][number]
    expect(() => loadLdtkLevel(root, broken)).toThrow(/invalid pxWid/)
  }
})

test('a non-finite or non-positive scale option is rejected at the loader', () => {
  const root = fixtureRoot()
  for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -1, 0]) {
    expect(() => loadLdtkLevel(root, root.levels[0]!, { scale: bad })).toThrow(/scale/)
  }
})

test('a tile layer with an invalid __gridSize warns and drops its tiles', () => {
  const root: LdtkRoot = {
    jsonVersion: '1.5.3',
    levels: [
      {
        identifier: 'Tiny',
        pxWid: 32,
        pxHei: 32,
        layerInstances: [
          {
            __identifier: 'Floor',
            __type: 'Tiles',
            __cWid: 2,
            __cHei: 2,
            __gridSize: 0,
            gridTiles: [{ px: [0, 0], src: [0, 0], f: 0, t: 0 }],
          },
        ],
      },
    ],
  }
  const warnings: string[] = []
  const arena = loadLdtkProject(root, { onWarn: (m) => warnings.push(m) }).arenas[0]!
  expect(arena.tileLayers).toHaveLength(1)
  expect(arena.tileLayers[0]).toEqual({ identifier: 'Floor', cellSize: 0, tiles: [] })
  expect(warnings.some((w) => /invalid __gridSize/.test(w))).toBe(true)
})

test('a tile layer with an invalid __gridSize falls back to the project defaultGridSize', () => {
  const root: LdtkRoot = {
    jsonVersion: '1.5.3',
    defaultGridSize: 16,
    levels: [
      {
        identifier: 'Tiny',
        pxWid: 32,
        pxHei: 32,
        layerInstances: [
          {
            __identifier: 'Floor',
            __type: 'Tiles',
            __cWid: 2,
            __cHei: 2,
            __gridSize: Number.NaN as unknown as number,
            gridTiles: [{ px: [0, 0], src: [0, 0], f: 0, t: 0 }],
          },
        ],
      },
    ],
  }
  const arena = loadLdtkProject(root, { center: false }).arenas[0]!
  const floor = arena.tileLayers[0]!
  expect(floor.cellSize).toBe(16)
  expect(floor.tiles).toHaveLength(1)
  expect(floor.tiles[0]).toMatchObject({ x: 8, z: 8, size: 16 })
})

test('every level in a project is mapped to its own arena', () => {
  const root = fixtureRoot()
  const second = { ...root.levels[0]!, identifier: 'BreachArena2', iid: 'breach-arena-0002' }
  const project = loadLdtkProject({ ...root, levels: [root.levels[0]!, second] })
  expect(project.arenas.map((a) => a.id)).toEqual(['BreachArena', 'BreachArena2'])
})

test('an empty project warns and yields no arenas', () => {
  const warnings: string[] = []
  const project = loadLdtkProject({ jsonVersion: '1.5.3', levels: [] }, { onWarn: (m) => warnings.push(m) })
  expect(project.arenas).toHaveLength(0)
  expect(warnings.some((w) => /no levels/.test(w))).toBe(true)
})

// --- FixedSpawnProvider ---

test('FixedSpawnProvider round-robins over its points', () => {
  const provider = new FixedSpawnProvider([
    { x: 1, z: 1 },
    { x: 2, z: 2 },
  ])
  expect(provider.next()).toEqual({ x: 1, z: 1 })
  expect(provider.next()).toEqual({ x: 2, z: 2 })
  expect(provider.next()).toEqual({ x: 1, z: 1 })
})

test('FixedSpawnProvider honours an avoid radius', () => {
  const provider = new FixedSpawnProvider(
    [
      { x: 0, z: 0 },
      { x: 50, z: 0 },
    ],
    { minAvoidDistance: 10 },
  )
  // Avoid near (0,0): the first candidate is rejected, the far one is returned.
  expect(provider.next({ avoidX: 0, avoidZ: 0 })).toEqual({ x: 50, z: 0 })
})

test('FixedSpawnProvider falls back to round-robin when every point is too close', () => {
  const provider = new FixedSpawnProvider([{ x: 0, z: 0 }], { minAvoidDistance: 10 })
  expect(provider.next({ avoidX: 0, avoidZ: 0 })).toEqual({ x: 0, z: 0 })
})

test('FixedSpawnProvider rejects an empty point list', () => {
  expect(() => new FixedSpawnProvider([])).toThrow(LdtkError)
})

test('FixedSpawnProvider returns copies, not shared references', () => {
  const point = { x: 3, z: 4 }
  const provider = new FixedSpawnProvider([point])
  const out = provider.next()
  out.x = 999
  expect(point.x).toBe(3)
})
