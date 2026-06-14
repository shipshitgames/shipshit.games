import { expect, test } from 'bun:test'

import {
  loadHowlerBackend,
  missingBackendFactory,
  missingBackendGlobal,
  type HowlLike,
  type HowlOptions,
} from './howl'

test('missingBackendFactory refuses loudly and names the fix', () => {
  expect(() => missingBackendFactory({ src: 'x.webm' })).toThrow(/no audio backend/)
  // it points the caller at both escape hatches: withHowler() and manual injection
  expect(() => missingBackendFactory({ src: 'x.webm' })).toThrow(/withHowler/)
  expect(() => missingBackendFactory({ src: 'x.webm' })).toThrow(/createHowl/)
})

test('missingBackendGlobal refuses loudly too', () => {
  expect(() => missingBackendGlobal()).toThrow(/no audio backend/)
  expect(() => missingBackendGlobal()).toThrow(/withHowler/)
})

test('loadHowlerBackend lazily wires the real howler module', async () => {
  const backend = await loadHowlerBackend()
  expect(typeof backend.createHowl).toBe('function')
  expect(typeof backend.audioGlobal).toBe('function')

  // the global accessor returns the real Howler singleton with master controls
  const howlerGlobal = backend.audioGlobal()
  expect(typeof howlerGlobal.volume).toBe('function')
  expect(typeof howlerGlobal.mute).toBe('function')
})

test('a structural fake satisfies HowlLike with no adapters (the whole point of the seam)', () => {
  // If this compiles, an in-memory fake can stand in for a real Howl — exactly
  // what the unit + e2e suites rely on.
  class StructuralHowl implements HowlLike {
    constructor(readonly opts: HowlOptions) {}
    play(): number {
      return 1
    }
    stop(): this {
      return this
    }
    pause(): this {
      return this
    }
    volume(): this {
      return this
    }
    stereo(): this {
      return this
    }
    loop(): this {
      return this
    }
    rate(): this {
      return this
    }
    fade(): this {
      return this
    }
    playing(): boolean {
      return false
    }
    state(): 'unloaded' | 'loading' | 'loaded' {
      return 'loaded'
    }
    once(): this {
      return this
    }
    off(): this {
      return this
    }
    unload(): void {}
  }

  const howl: HowlLike = new StructuralHowl({ src: 'x.webm' })
  expect(howl.play()).toBe(1)
  expect(howl.state()).toBe('loaded')
})
