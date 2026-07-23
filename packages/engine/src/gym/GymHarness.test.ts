import { expect, test } from 'bun:test'

import {
  createGymHarness,
  parseGymTuning,
  stringifyGymTuning,
  type GymGameDefinition,
  type GymPersistence,
  type GymTuningData,
} from './GymHarness'

class MemoryGymPersistence implements GymPersistence {
  readonly files = new Map<string, string>()

  async load(gameId: string): Promise<GymTuningData | null> {
    const file = this.files.get(gameId)
    return file ? parseGymTuning(file) : null
  }

  async save(data: GymTuningData): Promise<void> {
    this.files.set(data.gameId, stringifyGymTuning(data))
  }
}

function gameDefinition(id: string, prefix: string): GymGameDefinition {
  return {
    id,
    entities: [
      {
        id: `${prefix}-fighter`,
        assetId: `${prefix}-fighter-sheet`,
        clips: {
          idle: { frames: [0, 1], fps: 2 },
          attack: { frames: [2, 3, 4], fps: 10, loop: false, hitFrames: [3] },
        },
        bounds: [
          {
            id: 'body',
            kind: 'collision',
            rect: { x: 4, y: 5, width: 16, height: 22 },
          },
          {
            id: 'strike',
            kind: 'attack',
            rect: { x: 18, y: 8, width: 12, height: 8 },
          },
        ],
        parameters: {
          speed: { value: 5, min: 0, max: 10, step: 0.5 },
          armored: { value: false },
        },
      },
      {
        id: `${prefix}-element`,
        assetId: `${prefix}-element-sheet`,
        clips: { pulse: { frames: [0, 1, 2], fps: 6 } },
        parameters: { intensity: { value: 1, min: 0, max: 2 } },
      },
    ],
    scaffolds: {
      character: { entityIds: [`${prefix}-fighter`] },
      element: { entityIds: [`${prefix}-element`] },
      playground: { entityIds: [`${prefix}-fighter`, `${prefix}-element`] },
    },
  }
}

test('two games mount the same character, element, and playground scaffolds with only data definitions', async () => {
  const persistence = new MemoryGymPersistence()
  const scourge = await createGymHarness({
    definition: gameDefinition('scourge-survivors', 'warden'),
    persistence,
  })
  const starblight = await createGymHarness({
    definition: gameDefinition('starblight', 'pilot'),
    persistence,
  })

  expect(scourge.getSnapshot().entityId).toBe('warden-fighter')
  scourge.mount('element')
  expect(scourge.getSnapshot().entityId).toBe('warden-element')
  scourge.mount('playground', 'warden-element')
  expect(scourge.getSnapshot().availableEntities).toEqual([
    'warden-fighter',
    'warden-element',
  ])

  starblight.mount('character')
  expect(starblight.getSnapshot().assetId).toBe('pilot-fighter-sheet')
  starblight.mount('element')
  expect(starblight.getSnapshot().clipId).toBe('pulse')
  starblight.mount('playground', 'pilot-fighter')
  expect(starblight.getSnapshot().scaffold).toBe('playground')
})

test('cycles, scrubs, and advances animation clips without owning a render loop', async () => {
  const gym = await createGymHarness({
    definition: gameDefinition('scourge-survivors', 'warden'),
    persistence: new MemoryGymPersistence(),
  })

  gym.cycleAnimation()
  expect(gym.getSnapshot()).toMatchObject({
    clipId: 'attack',
    frame: 2,
    playing: true,
  })
  gym.scrub(1)
  expect(gym.getSnapshot().frame).toBe(3)
  gym.update(0.1)
  expect(gym.getSnapshot().frame).toBe(4)
  gym.update(0.1)
  expect(gym.getSnapshot()).toMatchObject({ frame: 4, playing: false })

  gym.cycleAnimation(-1)
  gym.update(0.5)
  expect(gym.getSnapshot()).toMatchObject({
    clipId: 'idle',
    frame: 1,
    playing: true,
  })
})

test('bound edits, hit-frame selection, and tuning knobs update the shared snapshot', async () => {
  const gym = await createGymHarness({
    definition: gameDefinition('scourge-survivors', 'warden'),
    persistence: new MemoryGymPersistence(),
  })
  gym.selectClip('attack')

  expect(
    gym.getSnapshot().bounds.find((bound) => bound.id === 'strike')?.active,
  ).toBe(false)
  gym.setHitFrame(2, true)
  expect(
    gym.getSnapshot().bounds.find((bound) => bound.id === 'strike')?.active,
  ).toBe(true)

  gym.editBound('body', { x: 3, y: 4, width: 18, height: 24 })
  gym.setParameter('speed', 7.5)
  gym.setParameter('armored', true)
  expect(gym.getSnapshot()).toMatchObject({
    dirty: true,
    parameters: { speed: 7.5, armored: true },
  })
  expect(
    gym.getSnapshot().bounds.find((bound) => bound.id === 'body')?.rect,
  ).toEqual({
    x: 3,
    y: 4,
    width: 18,
    height: 24,
  })
  expect(() => gym.setHitFrame(99, true)).toThrow('is not part of clip')
  expect(() => gym.setParameter('speed', 11)).toThrow(
    'outside its allowed range',
  )
})

test('save and reload round-trip the exact data the game consumes', async () => {
  const persistence = new MemoryGymPersistence()
  const definition = gameDefinition('starblight', 'pilot')
  const first = await createGymHarness({ definition, persistence })
  const dirtyStates: boolean[] = []
  first.subscribe((snapshot) => dirtyStates.push(snapshot.dirty))

  first.editBound('body', { x: 1, y: 2, width: 20, height: 24 })
  first.selectClip('attack')
  first.setHitFrame(2, true)
  first.setParameter('speed', 8)
  await first.save()

  expect(dirtyStates.at(-1)).toBe(false)
  expect(persistence.files.get('starblight')).toContain('"version": 1')

  const reloaded = await createGymHarness({ definition, persistence })
  reloaded.selectClip('attack')
  expect(reloaded.getSnapshot()).toMatchObject({
    dirty: false,
    hitFrames: [2, 3],
    parameters: { speed: 8, armored: false },
  })
  expect(
    reloaded.getSnapshot().bounds.find((bound) => bound.id === 'body')?.rect,
  ).toEqual({
    x: 1,
    y: 2,
    width: 20,
    height: 24,
  })
})

test('rejects invalid game definitions and stale tuning instead of corrupting a data file', async () => {
  const persistence = new MemoryGymPersistence()
  const definition = gameDefinition('starblight', 'pilot')
  persistence.files.set(
    'starblight',
    stringifyGymTuning({
      version: 1,
      gameId: 'starblight',
      entities: {
        ghost: { bounds: [], hitFrames: {}, parameters: {} },
      },
    }),
  )

  await expect(createGymHarness({ definition, persistence })).rejects.toThrow(
    'unknown entity "ghost"',
  )
  await expect(
    createGymHarness({
      definition: { ...definition, id: '../escape' },
      persistence: new MemoryGymPersistence(),
    }),
  ).rejects.toThrow('lowercase slug')
})
