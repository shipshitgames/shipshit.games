import { expect, test } from 'bun:test'

import { AudioSystem, type AudioSystemOptions } from './AudioSystem'
import type { AudioContextLike, HowlGlobalLike, HowlLike, HowlOptions } from './howl'
import type { AudioManifestLike, SoundSpec } from './manifest'
import type { AudioListener } from './spatial-audio'

// --- in-memory Howler fake: records every call so the runtime is fully observable ---

interface FakeSound {
  id: number
  cue?: string | number
  volume: number
  stereo: number | null
  loop: boolean | null
  rate: number | null
  playing: boolean
  fades: Array<{ from: number; to: number; durationMs: number }>
}

class FakeHowl implements HowlLike {
  readonly sounds = new Map<number, FakeSound>()
  unloaded = false
  private nextId = 1
  private fadeListeners: Array<{ fn: (id?: number) => void; id?: number }> = []

  constructor(readonly opts: HowlOptions) {}

  private sound(id?: number): FakeSound | undefined {
    if (id != null) return this.sounds.get(id)
    // "all sounds" fallback: return the most recent for getter-style reads
    let last: FakeSound | undefined
    for (const s of this.sounds.values()) last = s
    return last
  }

  play(cue?: string | number): number {
    const id = this.nextId++
    this.sounds.set(id, {
      id,
      ...(cue != null ? { cue } : {}),
      volume: 1,
      stereo: null,
      loop: null,
      rate: null,
      playing: true,
      fades: [],
    })
    return id
  }

  stop(id?: number): this {
    if (id == null) for (const s of this.sounds.values()) s.playing = false
    else {
      const s = this.sounds.get(id)
      if (s) s.playing = false
    }
    return this
  }

  pause(id?: number): this {
    const s = this.sound(id)
    if (s) s.playing = false
    return this
  }

  volume(volume: number, id?: number): this {
    const s = this.sound(id)
    if (s) s.volume = volume
    return this
  }

  stereo(pan: number, id?: number): this {
    const s = this.sound(id)
    if (s) s.stereo = pan
    return this
  }

  loop(loop: boolean, id?: number): this {
    const s = this.sound(id)
    if (s) s.loop = loop
    return this
  }

  rate(rate: number, id?: number): this {
    const s = this.sound(id)
    if (s) s.rate = rate
    return this
  }

  fade(from: number, to: number, durationMs: number, id?: number): this {
    const s = this.sound(id)
    if (s) {
      s.fades.push({ from, to, durationMs })
      s.volume = to // model the fade's end state
    }
    return this
  }

  playing(id?: number): boolean {
    return this.sound(id)?.playing ?? false
  }

  state(): 'unloaded' | 'loading' | 'loaded' {
    return this.unloaded ? 'unloaded' : 'loaded'
  }

  once(event: string, fn: (id?: number) => void, id?: number): this {
    if (event === 'fade') this.fadeListeners.push({ fn, id })
    return this
  }

  // Mirror Howler's `off(event?, fn?, id?)`: no args clears everything; a
  // (event, fn?, id?) tuple removes only the matching 'fade' listeners. This lets
  // tests observe that a hard stop detaches a specific handle's fade-listener
  // instead of leaking it (or nuking unrelated ones).
  off(event?: string, fn?: (id?: number) => void, id?: number): this {
    if (event === undefined) {
      this.fadeListeners = []
      return this
    }
    if (event !== 'fade') return this
    this.fadeListeners = this.fadeListeners.filter(
      (l) => !((fn === undefined || l.fn === fn) && (id === undefined || l.id === id)),
    )
    return this
  }

  /** Test helper: how many 'fade' listeners are still attached (leak detector). */
  pendingFades(): number {
    return this.fadeListeners.length
  }

  unload(): void {
    this.unloaded = true
    this.sounds.clear()
  }

  /** Test helper: fire howler's 'fade' event for `id` (simulate fade completion). */
  emitFade(id: number): void {
    const fired = this.fadeListeners.filter((l) => l.id == null || l.id === id)
    this.fadeListeners = this.fadeListeners.filter((l) => !(l.id == null || l.id === id))
    for (const l of fired) l.fn(id)
  }

  /** Test helper: the single sound (asserts there's exactly one). */
  only(): FakeSound {
    expect(this.sounds.size).toBe(1)
    return [...this.sounds.values()][0]!
  }
}

class FakeGlobal implements HowlGlobalLike {
  masterVolume = 1
  muted = false
  ctx: AudioContextLike | null = null
  volume(volume: number): this {
    this.masterVolume = volume
    return this
  }
  mute(muted: boolean): this {
    this.muted = muted
    return this
  }
}

/** A resumable audio context whose state flips to 'running' on resume(). */
const makeCtx = (state: string) => {
  const ctx = {
    state,
    resumeCalls: 0,
    resume(): Promise<void> {
      ctx.state = 'running'
      ctx.resumeCalls++
      return Promise.resolve()
    },
  }
  return ctx
}

const makeBackend = () => {
  const howls: FakeHowl[] = []
  const global = new FakeGlobal()
  const createHowl = (opts: HowlOptions): HowlLike => {
    const howl = new FakeHowl(opts)
    howls.push(howl)
    return howl
  }
  return { howls, global, createHowl, audioGlobal: () => global }
}

const makeAudio = (options: Omit<AudioSystemOptions, 'createHowl' | 'audioGlobal'> = {}) => {
  const backend = makeBackend()
  const system = new AudioSystem({ ...options, createHowl: backend.createHowl, audioGlobal: backend.audioGlobal })
  return { system, ...backend }
}

const spec = (over: Partial<SoundSpec> & Pick<SoundSpec, 'id'>): SoundSpec => ({
  src: `${over.id}.webm`,
  category: 'sfx',
  loop: false,
  volume: 1,
  ...over,
})

const listenerAt = (x: number, y: number, z: number, yaw = 0): AudioListener => ({ position: { x, y, z }, yaw })

// --- registry ---

test('constructor pushes the initial master volume to the global mixer', () => {
  const { global } = makeAudio({ masterVolume: 0.3 })
  expect(global.masterVolume).toBe(0.3)
})

test('register builds a Howl with src/loop/volume and forces html5 only for music', () => {
  const { system, howls } = makeAudio()
  system.register(spec({ id: 'hit', volume: 0.8, loop: false }))
  expect(howls[0]!.opts).toMatchObject({ src: 'hit.webm', loop: false, volume: 0.8 })
  expect(howls[0]!.opts.html5).toBeUndefined()

  system.register(spec({ id: 'theme', category: 'music', loop: true, volume: 0.6 }))
  expect(howls[1]!.opts.html5).toBe(true)
})

test('register passes a sprite map through to the backend only when present', () => {
  const { system, howls } = makeAudio()
  system.register(spec({ id: 'ui', sprite: { click: [0, 120] } }))
  expect(howls[0]!.opts.sprite).toEqual({ click: [0, 120] })

  system.register(spec({ id: 'plain' }))
  expect(howls[1]!.opts.sprite).toBeUndefined()
})

test('re-registering an id unloads the previous Howl', () => {
  const { system, howls } = makeAudio()
  system.register(spec({ id: 'hit' }))
  system.register(spec({ id: 'hit' }))
  expect(howls).toHaveLength(2)
  expect(howls[0]!.unloaded).toBe(true)
  expect(howls[1]!.unloaded).toBe(false)
  expect(system.get('hit')!.howl).toBe(howls[1]!)
})

test('has / get / unregister track the registry and unload on removal', () => {
  const { system, howls } = makeAudio()
  system.register(spec({ id: 'hit' }))
  expect(system.has('hit')).toBe(true)
  expect(system.get('hit')!.spec.id).toBe('hit')

  expect(system.unregister('hit')).toBe(true)
  expect(system.has('hit')).toBe(false)
  expect(howls[0]!.unloaded).toBe(true)
  expect(system.unregister('hit')).toBe(false)
})

test('registerManifest registers every audio entry through resolveUrl', () => {
  const { system } = makeAudio()
  const manifest: AudioManifestLike = {
    assets: [
      { id: 'song', kind: 'music', path: 'song.webm', volume: 0.5 },
      { id: 'hit', kind: 'sfx', path: 'hit.webm' },
      { id: 'wall', kind: 'texture', path: 'wall.png' },
    ],
  }
  const registered = system.registerManifest(manifest, (p) => `https://cdn/${p}`)
  expect(registered.map((r) => r.spec.id)).toEqual(['song', 'hit'])
  expect(system.get('song')!.spec.src).toBe('https://cdn/song.webm')
  expect(system.get('song')!.spec.loop).toBe(true)
  expect(system.has('wall')).toBe(false)

  // category-filtered registration only takes the matching kind
  const sfxOnly = makeAudio()
  const onlyHit = sfxOnly.system.registerManifest(manifest, (p) => p, { category: 'sfx' })
  expect(onlyHit.map((r) => r.spec.id)).toEqual(['hit'])
})

// --- one-shot play ---

test('play returns null for an unknown id and never touches a backend', () => {
  const { system } = makeAudio()
  expect(system.play('ghost')).toBeNull()
})

test('play applies the spec volume scaled by the per-trigger multiplier', () => {
  const { system, howls } = makeAudio()
  system.register(spec({ id: 'hit', volume: 0.8 }))

  const id = system.play('hit')!
  expect(howls[0]!.sounds.get(id)!.volume).toBeCloseTo(0.8, 6)

  const id2 = system.play('hit', { volume: 0.5 })!
  expect(howls[0]!.sounds.get(id2)!.volume).toBeCloseTo(0.4, 6)
})

test('play routes a sprite cue to the backend', () => {
  const { system, howls } = makeAudio()
  system.register(spec({ id: 'ui', sprite: { click: [0, 120] } }))
  const id = system.play('ui', { cue: 'click' })!
  expect(howls[0]!.sounds.get(id)!.cue).toBe('click')
})

test('play with a world position pans and attenuates against the listener', () => {
  const { system, howls } = makeAudio({
    listener: listenerAt(0, 0, 0),
    attenuation: { refDistance: 0, maxDistance: 10 },
  })
  system.register(spec({ id: 'hit', volume: 0.8 }))

  // source 5 units to the right at half the rolloff band: pan +1, gain 0.5
  const id = system.play('hit', { position: { x: 5, y: 0, z: 0 } })!
  const sound = howls[0]!.sounds.get(id)!
  expect(sound.stereo).toBe(1)
  expect(sound.volume).toBeCloseTo(0.4, 6) // 0.8 spec * 0.5 gain
})

test('play accepts an explicit pan and ignores it once a position is given', () => {
  const { system, howls } = makeAudio({ listener: listenerAt(0, 0, 0) })
  system.register(spec({ id: 'hit' }))

  const id = system.play('hit', { pan: -0.7 })!
  expect(howls[0]!.sounds.get(id)!.stereo).toBe(-0.7)

  // out-of-range pan is clamped
  const id2 = system.play('hit', { pan: -3 })!
  expect(howls[0]!.sounds.get(id2)!.stereo).toBe(-1)
})

test('play centers a non-finite explicit pan instead of hard-panning one ear', () => {
  const { system, howls } = makeAudio()
  system.register(spec({ id: 'hit' }))
  // a NaN pan must land dead-center (0), never floor to -1
  const id = system.play('hit', { pan: Number.NaN })!
  expect(howls[0]!.sounds.get(id)!.stereo).toBe(0)
})

test('play centers a positional sound when the listener yaw is non-finite', () => {
  const { system, howls } = makeAudio({
    listener: { position: { x: 0, y: 0, z: 0 }, yaw: Number.NaN },
    attenuation: { refDistance: 0, maxDistance: 10 },
  })
  system.register(spec({ id: 'hit' }))
  // a NaN yaw makes the raw pan NaN; it must center to 0, not slam hard-left
  const id = system.play('hit', { position: { x: 5, y: 0, z: 0 } })!
  expect(howls[0]!.sounds.get(id)!.stereo).toBe(0)
})

test('play with no position and no listener leaves the sound centered (no stereo call)', () => {
  const { system, howls } = makeAudio()
  system.register(spec({ id: 'hit' }))
  const id = system.play('hit', { position: { x: 5, y: 0, z: 0 } })! // no listener set
  expect(howls[0]!.sounds.get(id)!.stereo).toBeNull()
})

test('play forwards loop and rate overrides', () => {
  const { system, howls } = makeAudio()
  system.register(spec({ id: 'hit' }))
  const id = system.play('hit', { loop: true, rate: 1.5 })!
  const sound = howls[0]!.sounds.get(id)!
  expect(sound.loop).toBe(true)
  expect(sound.rate).toBe(1.5)
})

test('setListener updates positional mixing for subsequent plays', () => {
  const { system, howls } = makeAudio({ attenuation: { refDistance: 0, maxDistance: 10 } })
  system.register(spec({ id: 'hit' }))

  // no listener yet => no pan
  system.play('hit', { position: { x: 5, y: 0, z: 0 } })
  expect(howls[0]!.only().stereo).toBeNull()

  system.setListener(listenerAt(0, 0, 0))
  const id = system.play('hit', { position: { x: -5, y: 0, z: 0 } })!
  expect(howls[0]!.sounds.get(id)!.stereo).toBe(-1) // now to the left
})

// --- music bus ---

test('playMusic starts at zero and crossfades up, looping by default', () => {
  const { system, howls } = makeAudio()
  system.register(spec({ id: 'menu', category: 'music', volume: 0.6 }))

  const handle = system.playMusic('menu')!
  const sound = howls[0]!.sounds.get(handle)!
  expect(system.currentMusic).toBe('menu')
  expect(sound.loop).toBe(true)
  expect(sound.fades).toEqual([{ from: 0, to: 0.6, durationMs: 800 }])
})

test('playMusic crossfades between two tracks and stops the old one on fade end', () => {
  const { system, howls } = makeAudio()
  system.register(spec({ id: 'menu', category: 'music', volume: 0.6 }))
  system.register(spec({ id: 'battle', category: 'music', volume: 0.7 }))

  const menuHandle = system.playMusic('menu')!
  const battleHandle = system.playMusic('battle', { fadeMs: 500 })!
  expect(system.currentMusic).toBe('battle')

  // new track fades in to its target
  expect(howls[1]!.sounds.get(battleHandle)!.fades).toEqual([{ from: 0, to: 0.7, durationMs: 500 }])
  // old track fades out but is still playing until its fade completes
  const menuSound = howls[0]!.sounds.get(menuHandle)!
  expect(menuSound.fades).toContainEqual({ from: 0.6, to: 0, durationMs: 500 })
  expect(menuSound.playing).toBe(true)

  // when howler reports the fade done, the old track stops
  howls[0]!.emitFade(menuHandle)
  expect(menuSound.playing).toBe(false)
})

test('playMusic is a no-op when the same track is already the playing music', () => {
  const { system, howls } = makeAudio()
  system.register(spec({ id: 'menu', category: 'music', volume: 0.6 }))

  const h1 = system.playMusic('menu')!
  const h2 = system.playMusic('menu')!
  expect(h2).toBe(h1)
  expect(howls[0]!.sounds.size).toBe(1) // no second play
})

test('playMusic restarts the current track when it has stopped, instead of no-op returning a dead handle', () => {
  const { system, howls } = makeAudio()
  system.register(spec({ id: 'menu', category: 'music', volume: 0.6 }))

  const first = system.playMusic('menu')!
  // the track ends (a non-looping cue finishing) or is halted out-of-band: still
  // the "current" music, but no longer playing.
  howls[0]!.sounds.get(first)!.playing = false

  const second = system.playMusic('menu')!
  // the `&& playing(previous.handle)` guard must let this fall through and RESTART
  // the track: a fresh handle + a new backend sound, not the stale handle returned
  // by the same-track no-op path.
  expect(second).not.toBe(first)
  expect(howls[0]!.sounds.size).toBe(2)
  expect(howls[0]!.playing(second)).toBe(true)
  expect(system.currentMusic).toBe('menu')
})

test('playMusic honors a custom target volume and an explicit loop=false', () => {
  const { system, howls } = makeAudio()
  system.register(spec({ id: 'sting', category: 'music', volume: 0.6 }))
  const handle = system.playMusic('sting', { volume: 0.9, loop: false, fadeMs: 0 })!
  const sound = howls[0]!.sounds.get(handle)!
  expect(sound.loop).toBe(false)
  // a hard cut (fadeMs 0) sets the volume directly with no fade
  expect(sound.fades).toEqual([])
  expect(sound.volume).toBe(0.9)
})

test('playMusic returns null for an unknown track', () => {
  const { system } = makeAudio()
  expect(system.playMusic('nope')).toBeNull()
})

test('stopMusic fades the bus out and clears the current track', () => {
  const { system, howls } = makeAudio()
  system.register(spec({ id: 'menu', category: 'music', volume: 0.6 }))
  const handle = system.playMusic('menu')!

  system.stopMusic(300)
  expect(system.currentMusic).toBeNull()
  const sound = howls[0]!.sounds.get(handle)!
  expect(sound.fades).toContainEqual({ from: 0.6, to: 0, durationMs: 300 })
  howls[0]!.emitFade(handle)
  expect(sound.playing).toBe(false)
})

test('unregistering the current music track clears the bus', () => {
  const { system } = makeAudio()
  system.register(spec({ id: 'menu', category: 'music', volume: 0.6 }))
  system.playMusic('menu')
  expect(system.currentMusic).toBe('menu')
  system.unregister('menu')
  expect(system.currentMusic).toBeNull()
})

// --- master controls + unlock ---

test('setMasterVolume clamps and pushes to the global mixer', () => {
  const { system, global } = makeAudio()
  system.setMasterVolume(0.5)
  expect(global.masterVolume).toBe(0.5)
  expect(system.getMasterVolume()).toBe(0.5)

  system.setMasterVolume(2)
  expect(global.masterVolume).toBe(1)
  expect(system.getMasterVolume()).toBe(1)
})

test('setMuted toggles the global mute and is readable', () => {
  const { system, global } = makeAudio()
  system.setMuted(true)
  expect(global.muted).toBe(true)
  expect(system.isMuted()).toBe(true)
  system.setMuted(false)
  expect(global.muted).toBe(false)
  expect(system.isMuted()).toBe(false)
})

test('unlock resumes a suspended context and is a no-op once running', async () => {
  const ctx = makeCtx('suspended')
  const backend = makeBackend()
  backend.global.ctx = ctx
  const system = new AudioSystem({ createHowl: backend.createHowl, audioGlobal: backend.audioGlobal })

  await system.unlock()
  expect(ctx.resumeCalls).toBe(1)
  expect(ctx.state).toBe('running')

  // already running => no further resume
  const result = system.unlock()
  expect(result).toBeUndefined()
  expect(ctx.resumeCalls).toBe(1)
})

test('unlock is harmless when there is no context at all', () => {
  const { system } = makeAudio()
  expect(() => system.unlock()).not.toThrow()
})

// --- teardown ---

test('stopAll stops every sound and clears the music bus but keeps the registry', () => {
  const { system, howls } = makeAudio()
  system.register(spec({ id: 'menu', category: 'music', volume: 0.6 }))
  system.register(spec({ id: 'hit' }))
  system.playMusic('menu')
  system.play('hit')

  system.stopAll()
  expect(system.currentMusic).toBeNull()
  expect([...howls[0]!.sounds.values()].every((s) => !s.playing)).toBe(true)
  expect([...howls[1]!.sounds.values()].every((s) => !s.playing)).toBe(true)
  expect(system.has('menu')).toBe(true) // registry survives
  expect(system.has('hit')).toBe(true)
})

test('dispose unloads everything and empties the registry', () => {
  const { system, howls } = makeAudio()
  system.register(spec({ id: 'menu', category: 'music', volume: 0.6 }))
  system.register(spec({ id: 'hit' }))
  system.playMusic('menu')

  system.dispose()
  expect(howls.every((h) => h.unloaded)).toBe(true)
  expect(system.has('menu')).toBe(false)
  expect(system.has('hit')).toBe(false)
  expect(system.currentMusic).toBeNull()
})

// --- crossfade fade-listener hygiene (no dangling once('fade')) ---

const crossfaded = () => {
  const ctx = makeAudio()
  ctx.system.register(spec({ id: 'menu', category: 'music', volume: 0.6 }))
  ctx.system.register(spec({ id: 'battle', category: 'music', volume: 0.7 }))
  const menuHandle = ctx.system.playMusic('menu')!
  // crossfade out: the outgoing menu track now carries a once('fade') stop-listener
  ctx.system.playMusic('battle', { fadeMs: 500 })
  expect(ctx.howls[0]!.pendingFades()).toBe(1)
  return { ...ctx, menuHandle }
}

test('a completed crossfade leaves no residual fade-listener on the old track', () => {
  const { howls, menuHandle } = crossfaded()
  howls[0]!.emitFade(menuHandle) // howler reports the fade-out done
  expect(howls[0]!.pendingFades()).toBe(0)
})

test('stopAll detaches a pending crossfade fade-listener instead of leaking it', () => {
  const { system, howls } = crossfaded()
  system.stopAll()
  expect(howls[0]!.pendingFades()).toBe(0)
  expect(howls[1]!.pendingFades()).toBe(0)
})

test('dispose detaches any pending fade-listeners before unloading', () => {
  const { system, howls } = crossfaded()
  system.dispose()
  expect(howls[0]!.pendingFades()).toBe(0)
})

// --- no-backend safety (master controls degrade to no-ops) ---

test('a backend-less system no-ops master controls and unlock instead of throwing', () => {
  const system = new AudioSystem()
  expect(() => system.setMasterVolume(0.5)).not.toThrow()
  expect(system.getMasterVolume()).toBe(0.5)
  expect(() => system.setMuted(true)).not.toThrow()
  expect(system.isMuted()).toBe(true)
  expect(system.unlock()).toBeUndefined()
  expect(system.play('anything')).toBeNull()
})

test('a backend-less register throws the helpful missing-backend error', () => {
  const system = new AudioSystem()
  expect(() => system.register(spec({ id: 'hit' }))).toThrow(/no audio backend/)
})
