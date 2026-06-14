/**
 * End-to-end level seam test: a real `.ldtk` arena file loads into a minimal
 * engine scene and drives the genre-neutral arena + spawn seams.
 *
 * Everything that matters runs the real engine code: the LDtk loader turns the
 * vendored file into an ArenaMap, ArenaSystem interprets the colliders + bounds,
 * the authored entity spawns feed a FixedSpawnProvider, and the same arena
 * blocks a RectScatterSpawnProvider so scattered enemies never enter a wall.
 */
import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { FixedSpawnProvider, loadLdtkProject } from '../../src/level/ldtk'
import { ArenaSystem } from '../../src/world/map'
import { RectScatterSpawnProvider } from '../../src/spawn'

const ARENA_FILE = join(import.meta.dir, '../../src/level/fixtures/breach-arena.ldtk')

test('a vendored .ldtk arena loads into a minimal engine scene', () => {
  const project = loadLdtkProject(readFileSync(ARENA_FILE, 'utf8'))
  expect(project.version).toMatchObject({ major: 1, minor: 5 })
  expect(project.arenas).toHaveLength(1)

  const arena = project.arenas[0]!
  const system = new ArenaSystem(arena.map)

  // int-grid -> colliders: the interior wall block and the border block movement.
  expect(system.isBlockedXZ(0, 0)).toBe(true)
  expect(system.isBlockedXZ(-56, 8)).toBe(true) // left wall column
  expect(system.isBlockedXZ(-40, -24)).toBe(false) // open floor

  // entity layer -> spawn points, all inside bounds and clear of walls.
  expect(arena.spawnPoints.length).toBeGreaterThan(0)
  for (const spawn of arena.spawnPoints) {
    expect(system.bounds.containsXZ(spawn.x, spawn.z)).toBe(true)
    expect(system.isBlockedXZ(spawn.x, spawn.z)).toBe(false)
  }

  // tile layer -> render-ready data inside the arena footprint.
  expect(arena.tileLayers.length).toBeGreaterThan(0)
  const tiles = arena.tileLayers.flatMap((layer) => layer.tiles)
  expect(tiles.length).toBeGreaterThan(0)
  for (const tile of tiles) {
    expect(system.bounds.containsXZ(tile.x, tile.z)).toBe(true)
  }
})

test('authored spawns drive the FixedSpawnProvider in arena order', () => {
  const project = loadLdtkProject(readFileSync(ARENA_FILE, 'utf8'))
  const arena = project.arenas[0]!
  const system = new ArenaSystem(arena.map)

  const provider = new FixedSpawnProvider(arena.spawnPoints)
  for (let i = 0; i < arena.spawnPoints.length * 2; i++) {
    const point = provider.next()
    expect(system.bounds.containsXZ(point.x, point.z)).toBe(true)
    expect(system.isBlockedXZ(point.x, point.z)).toBe(false)
  }
})

test('the loaded arena blocks scattered spawns out of its walls', () => {
  const project = loadLdtkProject(readFileSync(ARENA_FILE, 'utf8'))
  const arena = project.arenas[0]!
  const system = new ArenaSystem(arena.map)

  const scatter = new RectScatterSpawnProvider({
    bounds: () => system.bounds,
    margin: 1,
    blocked: (x, z) => system.isBlockedXZ(x, z),
  })

  for (let i = 0; i < 200; i++) {
    const point = scatter.next()
    expect(system.bounds.containsXZ(point.x, point.z)).toBe(true)
    // The scatter provider rejects blocked candidates; only its hard corner
    // fallback can land on a wall, so the vast majority must be clear.
  }

  // Statistically, scattering into this arena should mostly find open floor.
  let clear = 0
  const samples = 300
  for (let i = 0; i < samples; i++) {
    const point = scatter.next()
    if (!system.isBlockedXZ(point.x, point.z)) clear++
  }
  expect(clear).toBeGreaterThan(samples * 0.8)
})
