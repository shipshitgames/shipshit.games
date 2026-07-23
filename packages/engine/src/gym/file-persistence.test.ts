import { expect, test } from 'bun:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { FileGymPersistence } from './file-persistence'

test('writes and reloads an atomic per-game JSON tuning file', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'shipshit-gym-'))
  try {
    const persistence = new FileGymPersistence({ rootDir })
    await persistence.save({
      version: 1,
      gameId: 'starblight',
      entities: {
        pilot: {
          bounds: [
            {
              id: 'body',
              kind: 'collision',
              rect: { x: 1, y: 2, width: 8, height: 12 },
            },
          ],
          hitFrames: { attack: [2] },
          parameters: { speed: 6 },
        },
      },
    })

    const expectedPath = join(rootDir, 'data', 'gyms', 'starblight.json')
    expect(persistence.filePath('starblight')).toBe(expectedPath)
    expect(JSON.parse(await readFile(expectedPath, 'utf8'))).toMatchObject({
      version: 1,
      gameId: 'starblight',
    })
    expect(await persistence.load('starblight')).toMatchObject({
      entities: {
        pilot: { hitFrames: { attack: [2] }, parameters: { speed: 6 } },
      },
    })
    expect(await persistence.load('missing-game')).toBeNull()
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
})

test('rejects configured paths that escape the game repository', () => {
  const persistence = new FileGymPersistence({
    rootDir: '/tmp/game',
    pathForGame: () => '../escape.json',
  })
  expect(() => persistence.filePath('starblight')).toThrow(
    'must stay inside rootDir',
  )
})
