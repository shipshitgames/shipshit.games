import { expect, test } from 'bun:test'

import {
  AUDIO_KINDS,
  clampVolume,
  defaultLoopForKind,
  isAudioKind,
  resolveCategory,
  selectAudioEntries,
  toSoundSpec,
  type AudioAssetEntry,
  type AudioManifestLike,
} from './manifest'

const identityUrl = (path: string) => path
const cdnUrl = (path: string) => `https://cdn.example/${path}`

test('AUDIO_KINDS pins the three playback categories from #21', () => {
  expect(AUDIO_KINDS).toEqual(['music', 'sfx', 'voice'])
})

test('isAudioKind narrows only music/sfx/voice', () => {
  expect(isAudioKind('music')).toBe(true)
  expect(isAudioKind('sfx')).toBe(true)
  expect(isAudioKind('voice')).toBe(true)
  expect(isAudioKind('texture')).toBe(false)
  expect(isAudioKind('sprite')).toBe(false)
  expect(isAudioKind('')).toBe(false)
})

test('music loops by default; sfx and voice are one-shots', () => {
  expect(defaultLoopForKind('music')).toBe(true)
  expect(defaultLoopForKind('sfx')).toBe(false)
  expect(defaultLoopForKind('voice')).toBe(false)
  expect(defaultLoopForKind('texture')).toBe(false)
})

test('clampVolume keeps [0,1] and treats junk/absent as full volume', () => {
  expect(clampVolume(0.3)).toBe(0.3)
  expect(clampVolume(0)).toBe(0)
  expect(clampVolume(1)).toBe(1)
  expect(clampVolume(1.5)).toBe(1)
  expect(clampVolume(-0.5)).toBe(0)
  expect(clampVolume(undefined)).toBe(1)
  expect(clampVolume(Number.NaN)).toBe(1)
  expect(clampVolume(Number.POSITIVE_INFINITY)).toBe(1)
})

test('resolveCategory prefers explicit category, then falls back to kind', () => {
  expect(resolveCategory({ id: 'a', kind: 'sfx', path: 'a.webm' })).toBe('sfx')
  // an explicit category overrides a non-audio kind (e.g. a generic "audio" kind)
  expect(resolveCategory({ id: 'a', kind: 'audio', path: 'a.webm', category: 'music' })).toBe('music')
  // a junk category falls through to the (audio) kind
  expect(resolveCategory({ id: 'a', kind: 'voice', path: 'a.webm', category: 'nope' })).toBe('voice')
  // neither is an audio category => not an audio asset
  expect(resolveCategory({ id: 'a', kind: 'texture', path: 'a.png' })).toBeNull()
})

test('selectAudioEntries keeps audio entries, drops malformed ones, and filters by category', () => {
  const manifest: AudioManifestLike = {
    assets: [
      { id: 'song', kind: 'music', path: 'song.webm' },
      { id: 'hit', kind: 'sfx', path: 'hit.webm' },
      { id: 'line', kind: 'voice', path: 'line.webm' },
      { id: 'wall', kind: 'texture', path: 'wall.png' },
      // malformed: missing path / id
      { id: 'bad', kind: 'sfx' } as unknown as AudioAssetEntry,
      { kind: 'sfx', path: 'x.webm' } as unknown as AudioAssetEntry,
      null as unknown as AudioAssetEntry,
    ],
  }

  expect(selectAudioEntries(manifest).map((e) => e.id)).toEqual(['song', 'hit', 'line'])
  expect(selectAudioEntries(manifest, { category: 'sfx' }).map((e) => e.id)).toEqual(['hit'])
  expect(selectAudioEntries(manifest, { category: 'music' }).map((e) => e.id)).toEqual(['song'])
})

test('selectAudioEntries tolerates a missing/!array assets field', () => {
  expect(selectAudioEntries({ assets: [] })).toEqual([])
  expect(selectAudioEntries({} as AudioManifestLike)).toEqual([])
  expect(selectAudioEntries({ assets: null } as unknown as AudioManifestLike)).toEqual([])
})

test('toSoundSpec resolves the url, defaults loop from category, and clamps volume', () => {
  const spec = toSoundSpec({ id: 'song', kind: 'music', path: 'song.webm', volume: 1.4 }, cdnUrl)
  expect(spec).toEqual({
    id: 'song',
    src: 'https://cdn.example/song.webm',
    category: 'music',
    loop: true, // music loops by default
    volume: 1, // clamped from 1.4
  })
})

test('toSoundSpec honors an explicit loop override and includes duration only when finite', () => {
  const looped = toSoundSpec({ id: 'amb', kind: 'sfx', path: 'amb.webm', loop: true, duration: 2.5 }, identityUrl)
  expect(looped.loop).toBe(true)
  expect(looped.duration).toBe(2.5)

  const noDuration = toSoundSpec(
    { id: 'hit', kind: 'sfx', path: 'hit.webm', duration: Number.NaN },
    identityUrl,
  )
  expect(noDuration.loop).toBe(false)
  expect('duration' in noDuration).toBe(false)
})

test('toSoundSpec carries a non-empty sprite map and omits an empty one', () => {
  const sheet = toSoundSpec(
    { id: 'ui', kind: 'sfx', path: 'ui.webm', sprite: { click: [0, 120], back: [200, 150, false] } },
    identityUrl,
  )
  expect(sheet.sprite).toEqual({ click: [0, 120], back: [200, 150, false] })

  const empty = toSoundSpec({ id: 'ui', kind: 'sfx', path: 'ui.webm', sprite: {} }, identityUrl)
  expect('sprite' in empty).toBe(false)
})

test('toSoundSpec throws on a non-audio entry (callers must pre-filter)', () => {
  expect(() => toSoundSpec({ id: 'wall', kind: 'texture', path: 'wall.png' }, identityUrl)).toThrow(
    /no audio category/,
  )
})
