/**
 * The Howler.js seam (issue #76).
 *
 * `AudioSystem` never touches Howler directly — it talks to these structural
 * interfaces, exactly like the net seam talks to `NetSocketLike` instead of
 * PartySocket. The real `Howl` / `Howler` satisfy them without adapters, and
 * tests supply an in-memory fake, so the whole audio runtime unit-tests in bun
 * with no Web Audio context.
 *
 * Howler stays an *optional* dependency. Browser games opt into the real
 * backend with `AudioSystem.withHowler()` (a lazy `import('howler')`, so a
 * bundle that never calls it never pulls Howler in); everyone else injects a
 * backend via `AudioSystemOptions.createHowl` / `audioGlobal`.
 */

/** A single sprite cue as Howler encodes it: `[offsetMs, durationMs]` (+ optional loop). */
export type HowlSpriteDef = [number, number] | [number, number, boolean]

/** Construction options we pass through to `new Howl(...)`. */
export interface HowlOptions {
  src: string | string[]
  sprite?: Record<string, HowlSpriteDef>
  loop?: boolean
  volume?: number
  rate?: number
  /** Force the HTML5 Audio backend (good for long streaming music). */
  html5?: boolean
  preload?: boolean | 'metadata'
  autoplay?: boolean
}

/**
 * The subset of Howler's `Howl` instance the audio runtime depends on. Real
 * `Howl` instances satisfy this; the fluent setters return `this`, which we
 * model loosely as `HowlLike` so chaining keeps working.
 */
export interface HowlLike {
  /** Start playback (optionally a sprite cue); returns the sound id. */
  play(spriteOrId?: string | number): number
  stop(id?: number): HowlLike
  pause(id?: number): HowlLike
  /** Per-sound volume setter; the getter form is unused by the runtime. */
  volume(volume: number, id?: number): HowlLike
  /** Stereo pan in [-1, 1] for one sound id (Web Audio backend only). */
  stereo(pan: number, id?: number): HowlLike
  loop(loop: boolean, id?: number): HowlLike
  rate(rate: number, id?: number): HowlLike
  fade(from: number, to: number, durationMs: number, id?: number): HowlLike
  playing(id?: number): boolean
  state(): 'unloaded' | 'loading' | 'loaded'
  once(event: string, fn: (id?: number) => void, id?: number): HowlLike
  off(event?: string, fn?: (id?: number) => void, id?: number): HowlLike
  unload(): void
}

/** Builds a sound instance for one registered asset. The real impl is `new Howl(opts)`. */
export type HowlFactory = (opts: HowlOptions) => HowlLike

/** An audio context just complete enough to drive the unlock-on-gesture path. */
export interface AudioContextLike {
  readonly state: string
  resume?: () => Promise<void>
}

/**
 * The subset of the global `Howler` object the runtime depends on, for master
 * controls and unlocking the audio context after a user gesture.
 */
export interface HowlGlobalLike {
  volume(volume: number): HowlGlobalLike
  mute(muted: boolean): HowlGlobalLike
  ctx?: AudioContextLike | null
}

/** A backend pair: the per-sound factory plus an accessor for the global controls. */
export interface AudioBackend {
  createHowl: HowlFactory
  audioGlobal: () => HowlGlobalLike
}

/**
 * Default factory used when no backend was injected and `withHowler()` was not
 * called. It refuses loudly rather than silently no-op'ing, mirroring the net
 * seam's "needs the optional dependency" error.
 */
export const missingBackendFactory: HowlFactory = () => {
  throw new Error(
    "AudioSystem has no audio backend. Create it with `await AudioSystem.withHowler()` to use the " +
      'optional `howler` dependency, or pass `createHowl` (and `audioGlobal`) to inject your own.',
  )
}

export const missingBackendGlobal = (): HowlGlobalLike => {
  throw new Error(
    "AudioSystem has no audio backend. Create it with `await AudioSystem.withHowler()` or pass " +
      '`audioGlobal` to inject your own.',
  )
}

/**
 * Lazily load the real Howler backend. Browser-safe: the dynamic import is only
 * evaluated when a game actually opts into the default backend, so bundlers and
 * the bun unit suite never have to resolve Howler unless asked.
 */
export async function loadHowlerBackend(): Promise<AudioBackend> {
  let mod: typeof import('howler')
  try {
    mod = await import('howler')
  } catch (cause) {
    throw new Error(
      "AudioSystem's default backend needs the optional 'howler' dependency. " +
        'Install howler, or pass `createHowl`/`audioGlobal` to supply your own backend.',
      { cause },
    )
  }
  const Howl = mod.Howl
  const Howler = mod.Howler
  return {
    createHowl: (opts) => new Howl(opts as ConstructorParameters<typeof Howl>[0]) as unknown as HowlLike,
    audioGlobal: () => Howler as unknown as HowlGlobalLike,
  }
}
