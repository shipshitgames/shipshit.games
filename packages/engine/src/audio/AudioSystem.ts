/**
 * The audio runtime seam (issue #76): the playback side of the #21 music/SFX
 * generator. One small, shared way for every game to trigger SFX and music.
 *
 * Responsibilities:
 *  - a `Sound` registry built from `assets.json` audio entries (#21) — including
 *    one-file-many-cues SFX via the sprite map (#76),
 *  - `play()` with stereo pan + distance attenuation from a world position vs.
 *    the listener (camera/player),
 *  - a music bus that crossfades between tracks,
 *  - unlocking the audio context after the first user gesture (web autoplay).
 *
 * Howler is reached only through the injected `HowlLike` backend (see howl.ts),
 * so this whole class unit-tests in bun with an in-memory fake and pulls in no
 * Web Audio. Browser games get the real backend from `AudioSystem.withHowler()`.
 */
import type { Vec3Like } from '../spatial'
import {
  loadHowlerBackend,
  missingBackendFactory,
  missingBackendGlobal,
  type HowlFactory,
  type HowlGlobalLike,
  type HowlLike,
} from './howl'
import {
  selectAudioEntries,
  toSoundSpec,
  type AudioKind,
  type AudioManifestLike,
  type SoundSpec,
} from './manifest'
import {
  clamp,
  clampBipolar,
  spatialize,
  type AttenuationConfig,
  type AudioListener,
} from './spatial-audio'

export const DEFAULT_MUSIC_CROSSFADE_MS = 800

/** A registered sound: its resolved spec plus the backing Howl instance. */
export interface RegisteredSound {
  spec: SoundSpec
  howl: HowlLike
}

/** Per-trigger overrides for {@link AudioSystem.play}. */
export interface PlayOptions {
  /** Sprite cue name for one-file-many-cues SFX sheets (#76). */
  cue?: string
  /** Source world position — drives stereo pan + distance attenuation. */
  position?: Vec3Like
  /** Explicit stereo pan in [-1, 1]; ignored when `position` is given. */
  pan?: number
  /** Extra volume multiplier in [0, 1] on top of the spec volume. */
  volume?: number
  /** Override the registered loop flag for this trigger. */
  loop?: boolean
  /** Playback rate multiplier. */
  rate?: number
}

/** Options for the music bus ({@link AudioSystem.playMusic}). */
export interface MusicOptions {
  /** Crossfade duration in ms; defaults to the system crossfade. 0 = hard cut. */
  fadeMs?: number
  /** Loop the track. Music loops by default. */
  loop?: boolean
  /** Target volume in [0, 1]; defaults to the track's spec volume. */
  volume?: number
}

export interface AudioSystemOptions {
  /** Per-sound factory. Defaults to a backend that errors until one is injected. */
  createHowl?: HowlFactory
  /** Global controls accessor (master volume, mute, ctx unlock). */
  audioGlobal?: () => HowlGlobalLike
  /** Initial listener (camera/player). Set later with {@link AudioSystem.setListener}. */
  listener?: AudioListener
  /** Master volume in [0, 1]. Default 1. */
  masterVolume?: number
  /** Default music crossfade in ms. Default {@link DEFAULT_MUSIC_CROSSFADE_MS}. */
  musicCrossfadeMs?: number
  /** Distance rolloff applied to positional plays. */
  attenuation?: AttenuationConfig
  /** Pan strength multiplier in [0, ∞); 1 = full stereo spread. */
  panStrength?: number
}

interface MusicTrack {
  id: string
  handle: number
  sound: RegisteredSound
  volume: number
}

export class AudioSystem {
  private readonly registry = new Map<string, RegisteredSound>()
  private readonly createHowl: HowlFactory
  private readonly audioGlobal: () => HowlGlobalLike
  private readonly hasBackend: boolean
  private readonly attenuation: AttenuationConfig
  private readonly panStrength: number

  private listener: AudioListener | null
  private masterVolume: number
  private muted = false
  private musicCrossfadeMs: number
  private music: MusicTrack | null = null

  constructor(options: AudioSystemOptions = {}) {
    this.hasBackend = options.createHowl != null
    this.createHowl = options.createHowl ?? missingBackendFactory
    this.audioGlobal = options.audioGlobal ?? missingBackendGlobal
    this.listener = options.listener ?? null
    this.masterVolume = clamp(options.masterVolume ?? 1, 0, 1)
    this.musicCrossfadeMs = Math.max(0, options.musicCrossfadeMs ?? DEFAULT_MUSIC_CROSSFADE_MS)
    this.attenuation = options.attenuation ?? {}
    this.panStrength = Math.max(0, options.panStrength ?? 1)
    if (this.hasBackend) this.applyMasterVolume()
  }

  /**
   * Build an `AudioSystem` wired to the real Howler backend via a lazy
   * `import('howler')`. Use this in browser games; tests inject `createHowl`.
   */
  static async withHowler(options: Omit<AudioSystemOptions, 'createHowl' | 'audioGlobal'> = {}): Promise<AudioSystem> {
    const backend = await loadHowlerBackend()
    return new AudioSystem({ ...options, createHowl: backend.createHowl, audioGlobal: backend.audioGlobal })
  }

  /** Register (or replace) one sound. Replacing an id unloads the previous Howl. */
  register(spec: SoundSpec): RegisteredSound {
    const previous = this.registry.get(spec.id)
    if (previous) previous.howl.unload()
    const howl = this.createHowl({
      src: spec.src,
      loop: spec.loop,
      volume: spec.volume,
      ...(spec.sprite ? { sprite: spec.sprite } : {}),
      // Long music streams better on the HTML5 backend; SFX stay on Web Audio
      // so stereo panning works.
      ...(spec.category === 'music' ? { html5: true } : {}),
    })
    const sound: RegisteredSound = { spec, howl }
    this.registry.set(spec.id, sound)
    return sound
  }

  /** Register every audio entry in a manifest. `resolveUrl` maps paths to playable URLs. */
  registerManifest(
    manifest: AudioManifestLike,
    resolveUrl: (path: string) => string,
    opts: { category?: AudioKind } = {},
  ): RegisteredSound[] {
    return selectAudioEntries(manifest, opts).map((entry) => this.register(toSoundSpec(entry, resolveUrl)))
  }

  has(id: string): boolean {
    return this.registry.has(id)
  }

  get(id: string): RegisteredSound | undefined {
    return this.registry.get(id)
  }

  /** Unregister and unload one sound. Returns whether it existed. */
  unregister(id: string): boolean {
    const sound = this.registry.get(id)
    if (!sound) return false
    sound.howl.unload()
    this.registry.delete(id)
    if (this.music?.id === id) this.music = null
    return true
  }

  /** Update the listener (camera/player) used for positional pan + attenuation. */
  setListener(listener: AudioListener): void {
    this.listener = listener
  }

  /**
   * Trigger a one-shot (or sprite-cue) sound. Returns the backend sound id, or
   * `null` if `id` is not registered. When `position` and a listener are set,
   * the sound is panned and attenuated by world geometry.
   */
  play(id: string, opts: PlayOptions = {}): number | null {
    const sound = this.registry.get(id)
    if (!sound) return null
    const { howl, spec } = sound

    const soundId = opts.cue != null ? howl.play(opts.cue) : howl.play()

    let volume = spec.volume * (opts.volume ?? 1)
    let pan = 0
    let panned = false
    if (opts.position && this.listener) {
      const { pan: p, gain } = spatialize(this.listener, opts.position, {
        ...this.attenuation,
        panStrength: this.panStrength,
      })
      volume *= gain
      pan = p
      panned = true
    } else if (opts.pan != null) {
      pan = clampBipolar(opts.pan, -1, 1)
      panned = true
    }

    howl.volume(clamp(volume, 0, 1), soundId)
    if (panned) howl.stereo(pan, soundId)
    if (opts.loop != null) howl.loop(opts.loop, soundId)
    if (opts.rate != null) howl.rate(opts.rate, soundId)
    return soundId
  }

  /** The id of the music track currently on the bus, if any. */
  get currentMusic(): string | null {
    return this.music?.id ?? null
  }

  /**
   * Bring `id` onto the music bus, crossfading from whatever was playing. A
   * no-op (returns the live handle) if that track is already the current,
   * playing music. Returns `null` if `id` is not registered.
   */
  playMusic(id: string, opts: MusicOptions = {}): number | null {
    const sound = this.registry.get(id)
    if (!sound) return null

    const previous = this.music
    if (previous && previous.id === id && sound.howl.playing(previous.handle)) {
      return previous.handle
    }

    const fadeMs = Math.max(0, opts.fadeMs ?? this.musicCrossfadeMs)
    const targetVolume = clamp(opts.volume ?? sound.spec.volume, 0, 1)
    const loop = opts.loop ?? true

    const handle = sound.howl.play()
    sound.howl.loop(loop, handle)
    sound.howl.volume(0, handle)
    if (fadeMs > 0) sound.howl.fade(0, targetVolume, fadeMs, handle)
    else sound.howl.volume(targetVolume, handle)

    if (previous) this.fadeOutAndStop(previous, fadeMs)
    this.music = { id, handle, sound, volume: targetVolume }
    return handle
  }

  /** Fade the music bus out (and stop it). */
  stopMusic(fadeMs: number = this.musicCrossfadeMs): void {
    if (!this.music) return
    this.fadeOutAndStop(this.music, Math.max(0, fadeMs))
    this.music = null
  }

  private fadeOutAndStop(track: MusicTrack, fadeMs: number): void {
    const { sound, handle } = track
    if (fadeMs > 0) {
      sound.howl.fade(track.volume, 0, fadeMs, handle)
      sound.howl.once('fade', () => this.hardStop(sound, handle), handle)
    } else {
      this.hardStop(sound, handle)
    }
  }

  /**
   * Stop one sound id now. The leading `off('fade', …, handle)` is defensive: on
   * the normal crossfade path Howler has already self-removed the `once('fade')`
   * listener that invoked us, and the hard-cut path (fadeMs 0) never attached one
   * — but detaching by handle keeps `hardStop` safe to call on any handle without
   * risking a leaked listener. The teardown leak fix proper lives in `stopAll` /
   * `dispose`, which clear every listener with a no-arg `off()` before stopping
   * or unloading (Howler's `unload()` does not drop fade listeners on its own).
   */
  private hardStop(sound: RegisteredSound, handle: number): void {
    sound.howl.off('fade', undefined, handle)
    sound.howl.stop(handle)
  }

  /** Set master volume in [0, 1]. Applied to the global mixer when a backend exists. */
  setMasterVolume(volume: number): void {
    this.masterVolume = clamp(volume, 0, 1)
    this.applyMasterVolume()
  }

  getMasterVolume(): number {
    return this.masterVolume
  }

  private applyMasterVolume(): void {
    if (this.hasBackend) this.audioGlobal().volume(this.masterVolume)
  }

  /** Mute or unmute the whole mixer. */
  setMuted(muted: boolean): void {
    this.muted = muted
    if (this.hasBackend) this.audioGlobal().mute(muted)
  }

  isMuted(): boolean {
    return this.muted
  }

  /**
   * Resume a suspended audio context — call from a user-gesture handler (click,
   * keydown) to satisfy browser autoplay policy. Returns the resume promise when
   * one is in flight, else nothing. Safe to call repeatedly.
   */
  unlock(): Promise<void> | void {
    if (!this.hasBackend) return
    const ctx = this.audioGlobal().ctx
    if (ctx && ctx.state !== 'running' && typeof ctx.resume === 'function') {
      return ctx.resume()
    }
  }

  /** Stop every playing sound and clear the music bus (registry kept). */
  stopAll(): void {
    for (const sound of this.registry.values()) {
      // Drop any pending crossfade fade-listeners before the hard stop.
      sound.howl.off()
      sound.howl.stop()
    }
    this.music = null
  }

  /** Stop, unload, and forget every registered sound. */
  dispose(): void {
    for (const sound of this.registry.values()) {
      sound.howl.off()
      sound.howl.unload()
    }
    this.registry.clear()
    this.music = null
  }
}
