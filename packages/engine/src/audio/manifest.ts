/**
 * Reading audio out of a game's `assets.json` (issues #21 + #76).
 *
 * The asset generator (#21) writes audio entries shaped like every other
 * `AssetEntry`: `{ id, kind, path, category?, volume?, loop?, duration?, … }`
 * with `kind` one of `music` / `sfx` / `voice` and `path` pointing at an
 * encoded `.webm`/opus file. This module turns those entries into `SoundSpec`s
 * the runtime can register, and pins down the **sprite map** — the one
 * jointly-defined addition for #76 so a single SFX file can carry many cues.
 */
import type { HowlSpriteDef } from './howl'

export const AUDIO_KINDS = ['music', 'sfx', 'voice'] as const
export type AudioKind = (typeof AUDIO_KINDS)[number]

/** `true` for `music`/`sfx`/`voice`, narrowing the string. */
export function isAudioKind(kind: string): kind is AudioKind {
  return (AUDIO_KINDS as readonly string[]).includes(kind)
}

/** Music loops by default; SFX and voice are one-shots. Mirrors assetgen #21. */
export function defaultLoopForKind(kind: string): boolean {
  return kind === 'music'
}

/**
 * Cue name → `[offsetMs, durationMs]` (+ optional loop) within one file. This is
 * exactly Howler's sprite encoding, and the contract #76 adds to the audio
 * `AssetEntry` so "one file, many cues" SFX sheets round-trip through the
 * manifest. Entries without a `sprite` map are plain single-cue sounds.
 */
export type AudioCueMap = Record<string, HowlSpriteDef>

/**
 * Structural subset of the assetgen `AssetEntry` (#21) the audio runtime reads.
 * Deliberately loose (extra fields ignored) so it consumes real manifests
 * without importing the generator's types across the package boundary.
 */
export interface AudioAssetEntry {
  id: string
  kind: string
  path: string
  /** Playback category; falls back to `kind` when absent. */
  category?: string
  /** Authoring volume in [0, 1]. */
  volume?: number
  loop?: boolean
  duration?: number
  /** Per-file cue map for multi-cue SFX sheets (#76). */
  sprite?: AudioCueMap
}

/** The slice of a manifest we care about: just its `assets` array. */
export interface AudioManifestLike {
  assets: AudioAssetEntry[]
}

/** Clamp an authoring volume to [0, 1]; junk/absent falls back to 1. */
export function clampVolume(volume: number | undefined): number {
  if (volume == null || !Number.isFinite(volume)) return 1
  return Math.min(1, Math.max(0, volume))
}

/**
 * A registerable sound: resolved playable `src`, normalized category, loop,
 * volume and optional cue map. Built from an `AudioAssetEntry` via `toSoundSpec`.
 */
export interface SoundSpec {
  id: string
  src: string | string[]
  category: AudioKind
  loop: boolean
  volume: number
  duration?: number
  sprite?: AudioCueMap
}

/** Pull every audio entry from a manifest, optionally filtered to one category. */
export function selectAudioEntries(
  manifest: AudioManifestLike,
  opts: { category?: AudioKind } = {},
): AudioAssetEntry[] {
  const assets = Array.isArray(manifest?.assets) ? manifest.assets : []
  return assets.filter((entry) => {
    if (!entry || typeof entry.id !== 'string' || typeof entry.path !== 'string') return false
    const category = resolveCategory(entry)
    if (!category) return false
    return opts.category ? category === opts.category : true
  })
}

/** Resolve an entry's playback category from `category` then `kind`; null if neither is audio. */
export function resolveCategory(entry: AudioAssetEntry): AudioKind | null {
  if (entry.category && isAudioKind(entry.category)) return entry.category
  if (isAudioKind(entry.kind)) return entry.kind
  return null
}

/**
 * Turn one audio `AssetEntry` into a `SoundSpec`. `resolveUrl` maps the
 * manifest-relative `path` to a playable URL (CDN base, dev server, file://…),
 * keeping this module ignorant of where assets are hosted.
 *
 * Throws if the entry is not an audio asset — callers that pass arbitrary
 * entries should pre-filter with `selectAudioEntries`.
 */
export function toSoundSpec(entry: AudioAssetEntry, resolveUrl: (path: string) => string): SoundSpec {
  const category = resolveCategory(entry)
  if (!category) {
    throw new Error(`audio entry '${entry.id}' has no audio category (kind='${entry.kind}')`)
  }
  return {
    id: entry.id,
    src: resolveUrl(entry.path),
    category,
    loop: entry.loop ?? defaultLoopForKind(category),
    volume: clampVolume(entry.volume),
    ...(entry.duration != null && Number.isFinite(entry.duration) ? { duration: entry.duration } : {}),
    ...(entry.sprite && Object.keys(entry.sprite).length > 0 ? { sprite: entry.sprite } : {}),
  }
}
