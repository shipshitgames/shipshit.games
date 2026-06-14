/**
 * End-to-end audio seam test: a whole play session driven through the public
 * `AudioSystem` API against an in-memory Howler backend — no Web Audio, all
 * inside bun.
 *
 * It plays out a realistic arc: unlock the context on the first gesture, load a
 * #21-shaped `assets.json`, fire positional SFX off "engine events", trigger a
 * sprite cue from a UI sheet, crossfade music between two game states, and ride
 * the master volume / mute controls — every step exercising the real registry,
 * pan/attenuation math, and music bus the modules ship.
 */
import { expect, test } from 'bun:test'

import { AudioSystem } from '../../src/audio/AudioSystem'
import type { AudioContextLike, HowlGlobalLike, HowlLike, HowlOptions } from '../../src/audio/howl'
import type { AudioManifestLike } from '../../src/audio/manifest'
import type { AudioListener } from '../../src/audio/spatial-audio'

// --- a compact, self-contained fake Howler backend ---

interface FakeSound {
  id: number
  cue?: string | number
  volume: number
  stereo: number | null
  loop: boolean | null
  playing: boolean
  fades: Array<{ from: number; to: number; durationMs: number }>
}

class FakeHowl implements HowlLike {
  readonly sounds = new Map<number, FakeSound>()
  unloaded = false
  private nextId = 1
  private fadeListeners: Array<{ fn: (id?: number) => void; id?: number }> = []

  constructor(readonly opts: HowlOptions) {}

  private at(id?: number): FakeSound | undefined {
    if (id != null) return this.sounds.get(id)
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
  pause(): this {
    return this
  }
  volume(volume: number, id?: number): this {
    const s = this.at(id)
    if (s) s.volume = volume
    return this
  }
  stereo(pan: number, id?: number): this {
    const s = this.at(id)
    if (s) s.stereo = pan
    return this
  }
  loop(loop: boolean, id?: number): this {
    const s = this.at(id)
    if (s) s.loop = loop
    return this
  }
  rate(): this {
    return this
  }
  fade(from: number, to: number, durationMs: number, id?: number): this {
    const s = this.at(id)
    if (s) {
      s.fades.push({ from, to, durationMs })
      s.volume = to // model the end state Howler converges to
    }
    return this
  }
  playing(id?: number): boolean {
    return this.at(id)?.playing ?? false
  }
  state(): 'unloaded' | 'loading' | 'loaded' {
    return this.unloaded ? 'unloaded' : 'loaded'
  }
  once(event: string, fn: (id?: number) => void, id?: number): this {
    if (event === 'fade') this.fadeListeners.push({ fn, id })
    return this
  }
  off(): this {
    return this
  }
  unload(): void {
    this.unloaded = true
  }
  emitFade(id: number): void {
    const fired = this.fadeListeners.filter((l) => l.id == null || l.id === id)
    this.fadeListeners = this.fadeListeners.filter((l) => !(l.id == null || l.id === id))
    for (const l of fired) l.fn(id)
  }
}

class FakeGlobal implements HowlGlobalLike {
  masterVolume = 1
  muted = false
  ctx: AudioContextLike | null
  constructor(ctx: AudioContextLike | null) {
    this.ctx = ctx
  }
  volume(volume: number): this {
    this.masterVolume = volume
    return this
  }
  mute(muted: boolean): this {
    this.muted = muted
    return this
  }
}

const makeResumableCtx = (state: string) => {
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

// A game's `assets.json`, exactly as the #21 generator would emit it (with the
// #76 sprite map on a one-file-many-cues UI sheet, and non-audio art mixed in).
const ASSETS: AudioManifestLike = {
  assets: [
    { id: 'menu', kind: 'music', path: 'audio/menu.webm', volume: 0.6 },
    { id: 'battle', kind: 'music', path: 'audio/battle.webm', volume: 0.7 },
    { id: 'laser', kind: 'sfx', path: 'audio/laser.webm', volume: 0.9 },
    { id: 'ui', kind: 'sfx', path: 'audio/ui.webm', volume: 1, sprite: { click: [0, 120], back: [200, 150] } },
    { id: 'narrator', kind: 'voice', path: 'audio/narrator.webm', volume: 1 },
    // a sprite-sheet art asset that must never reach the audio registry
    { id: 'hero', kind: 'sprite', path: 'art/hero.png' },
  ],
}

const cdn = (path: string) => `https://cdn.example/${path}`
const player = (x: number, z: number, yaw = 0): AudioListener => ({ position: { x, y: 0, z }, yaw })

test('a full game audio session: unlock, load, positional sfx, sprite cue, music crossfade, mixer', async () => {
  const ctx = makeResumableCtx('suspended')
  const global = new FakeGlobal(ctx)
  const howls = new Map<string, FakeHowl>()
  // map each created Howl back to the source it was built from, so we can fetch
  // a sound by its asset id the way a game never has to.
  let pending = ''
  const createHowl = (opts: HowlOptions): HowlLike => {
    const howl = new FakeHowl(opts)
    howls.set(pending, howl)
    return howl
  }
  const howlFor = (id: string) => howls.get(id)!

  const audio = new AudioSystem({
    createHowl,
    audioGlobal: () => global,
    listener: player(0, 0),
    masterVolume: 1,
    musicCrossfadeMs: 600,
    attenuation: { refDistance: 0, maxDistance: 20 },
  })

  // --- 1. first user gesture unlocks the suspended context ---
  expect(ctx.state).toBe('suspended')
  await audio.unlock()
  expect(ctx.state).toBe('running')
  expect(ctx.resumeCalls).toBe(1)

  // --- 2. load the manifest; only the audio assets register ---
  // Register one entry at a time so the createHowl shim can label each Howl by
  // its asset id (a real game just calls registerManifest once on the whole file).
  const registered: string[] = []
  for (const entry of ASSETS.assets) {
    pending = entry.id
    const before = audio.has(entry.id)
    audio.registerManifest({ assets: [entry] }, cdn)
    if (!before && audio.has(entry.id)) registered.push(entry.id)
  }
  expect(registered).toEqual(['menu', 'battle', 'laser', 'ui', 'narrator'])
  expect(audio.has('hero')).toBe(false)
  expect(audio.get('laser')!.spec.src).toBe('https://cdn.example/audio/laser.webm')
  // music streams over the html5 backend; sfx stay on web audio for panning
  expect(howlFor('menu').opts.html5).toBe(true)
  expect(howlFor('laser').opts.html5).toBeUndefined()

  // --- 3. an enemy to the player's right fires: the shot pans right + attenuates ---
  const rightShot = audio.play('laser', { position: { x: 10, y: 0, z: 0 } })!
  const right = howlFor('laser').sounds.get(rightShot)!
  expect(right.stereo).toBe(1)
  expect(right.volume).toBeCloseTo(0.9 * 0.5, 6) // 0.9 spec * (1 - 10/20) rolloff

  // --- player turns 180°; the same world point is now on their left ---
  audio.setListener(player(0, 0, Math.PI))
  const leftShot = audio.play('laser', { position: { x: 10, y: 0, z: 0 } })!
  expect(howlFor('laser').sounds.get(leftShot)!.stereo).toBeCloseTo(-1, 6)

  // --- 4. a UI sheet plays one cue out of many via the sprite map ---
  const click = audio.play('ui', { cue: 'click' })!
  expect(howlFor('ui').sounds.get(click)!.cue).toBe('click')

  // --- 5. music crossfades menu -> battle as the match starts ---
  const menuHandle = audio.playMusic('menu')!
  expect(audio.currentMusic).toBe('menu')
  expect(howlFor('menu').sounds.get(menuHandle)!.loop).toBe(true)
  // menu fades IN from silence to its 0.6 target over the 600ms window
  expect(howlFor('menu').sounds.get(menuHandle)!.fades).toEqual([{ from: 0, to: 0.6, durationMs: 600 }])

  const battleHandle = audio.playMusic('battle')!
  expect(audio.currentMusic).toBe('battle')
  // the crossfade is genuinely *scheduled* over the system's 600ms window, not
  // snapped: battle ramps 0 -> its 0.7 target while menu ramps 0.6 -> 0.
  expect(howlFor('battle').sounds.get(battleHandle)!.fades).toEqual([{ from: 0, to: 0.7, durationMs: 600 }])
  expect(howlFor('menu').sounds.get(menuHandle)!.fades).toContainEqual({ from: 0.6, to: 0, durationMs: 600 })
  // the menu track is fading out but still playing until the fade resolves...
  expect(howlFor('menu').sounds.get(menuHandle)!.playing).toBe(true)
  howlFor('menu').emitFade(menuHandle)
  expect(howlFor('menu').sounds.get(menuHandle)!.playing).toBe(false)
  // ...and the battle track is live at its target volume
  expect(howlFor('battle').sounds.get(battleHandle)!.volume).toBeCloseTo(0.7, 6)

  // re-selecting the playing track is a no-op (no restart, no new sound)
  const again = audio.playMusic('battle')!
  expect(again).toBe(battleHandle)
  expect(howlFor('battle').sounds.size).toBe(1)

  // --- 6. the mixer: pause mutes everything, a settings slider sets master volume ---
  audio.setMuted(true)
  expect(global.muted).toBe(true)
  audio.setMuted(false)
  expect(global.muted).toBe(false)

  audio.setMasterVolume(0.4)
  expect(global.masterVolume).toBe(0.4)
  expect(audio.getMasterVolume()).toBe(0.4)

  // --- 7. leaving the match: stop music, then tear the whole system down ---
  audio.stopMusic(0)
  expect(audio.currentMusic).toBeNull()
  audio.dispose()
  expect(audio.has('laser')).toBe(false)
  expect(howlFor('battle').unloaded).toBe(true)
})
