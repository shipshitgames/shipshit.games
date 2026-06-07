import { expect, test } from 'bun:test'

import { ArenaSystem, pointInObstacle, validateArenaMap, type ArenaMap } from './map'

const testMap: ArenaMap = {
  id: 'test-arena',
  bounds: { kind: 'square', half: 10 },
  obstacles: [
    { kind: 'rect', id: 'crate', x: 0, z: 0, width: 4, depth: 2 },
    { kind: 'circle', id: 'pillar', x: 5, z: 5, radius: 1 },
    { kind: 'rect', id: 'ghost', x: -5, z: -5, width: 2, depth: 2, blocksMovement: false },
  ],
}

test('ArenaSystem resolves bounds and blocking obstacles from map data', () => {
  const arena = new ArenaSystem(testMap)

  expect(arena.bounds.containsXZ(9, 9)).toBe(true)
  expect(arena.containsXZ(0, 0)).toBe(false)
  expect(arena.obstacleAtXZ(5.5, 5)?.id).toBe('pillar')
  expect(arena.containsXZ(-5, -5)).toBe(true)
})

test('pointInObstacle supports margin expansion for rect and circle obstacles', () => {
  expect(pointInObstacle(testMap.obstacles![0]!, 2.4, 0, 0)).toBe(false)
  expect(pointInObstacle(testMap.obstacles![0]!, 2.4, 0, 0.5)).toBe(true)
  expect(pointInObstacle(testMap.obstacles![1]!, 6.2, 5, 0)).toBe(false)
  expect(pointInObstacle(testMap.obstacles![1]!, 6.2, 5, 0.25)).toBe(true)
})

test('validateArenaMap rejects malformed map bounds and obstacles', () => {
  expect(() => validateArenaMap({ id: 'bad', bounds: { kind: 'square', half: 0 } })).toThrow(
    /invalid square bounds/,
  )
  expect(() =>
    validateArenaMap({
      id: 'bad-obstacle',
      bounds: { kind: 'square', half: 4 },
      obstacles: [{ kind: 'circle', id: 'bad-circle', x: 0, z: 0, radius: 0 }],
    }),
  ).toThrow(/invalid radius/)
})
