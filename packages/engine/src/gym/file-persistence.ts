import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'

import {
  parseGymTuning,
  stringifyGymTuning,
  type GymPersistence,
  type GymTuningData,
} from './GymHarness'

export interface FileGymPersistenceOptions {
  /** Game repository root. Files default to `data/gyms/<game-id>.json`. */
  rootDir: string
  /** Override the path relative to `rootDir`; absolute/escaping paths are rejected. */
  pathForGame?: (gameId: string) => string
}

/** Atomic, Node-compatible persistence for the data file consumed by a game. */
export class FileGymPersistence implements GymPersistence {
  private readonly rootDir: string
  private readonly pathForGame: (gameId: string) => string

  constructor(options: FileGymPersistenceOptions) {
    this.rootDir = resolve(options.rootDir)
    this.pathForGame =
      options.pathForGame ?? ((gameId) => `data/gyms/${gameId}.json`)
  }

  filePath(gameId: string): string {
    const configured = this.pathForGame(gameId)
    if (isAbsolute(configured)) {
      throw new Error(
        `FileGymPersistence: path for "${gameId}" must be relative to rootDir`,
      )
    }
    const path = resolve(this.rootDir, configured)
    const fromRoot = relative(this.rootDir, path)
    if (
      fromRoot === '..' ||
      fromRoot.startsWith(`..${sep}`) ||
      path === this.rootDir
    ) {
      throw new Error(
        `FileGymPersistence: path for "${gameId}" must stay inside rootDir`,
      )
    }
    return path
  }

  async load(gameId: string): Promise<GymTuningData | null> {
    try {
      return parseGymTuning(await readFile(this.filePath(gameId), 'utf8'))
    } catch (error) {
      if (isNotFound(error)) return null
      throw error
    }
  }

  async save(data: GymTuningData): Promise<void> {
    const serialized = stringifyGymTuning(data)
    const path = this.filePath(data.gameId)
    const temporary = `${path}.${randomUUID()}.tmp`
    await mkdir(dirname(path), { recursive: true })
    try {
      await writeFile(temporary, serialized, 'utf8')
      await rename(temporary, path)
    } catch (error) {
      await unlink(temporary).catch(() => {})
      throw error
    }
  }
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  )
}
