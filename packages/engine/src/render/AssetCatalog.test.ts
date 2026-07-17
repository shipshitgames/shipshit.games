import { expect, test } from 'bun:test'
import * as THREE from 'three'

import { AssetCatalog, deriveSheet, type ManifestSpriteEntry } from './AssetCatalog'

const entries: ManifestSpriteEntry[] = [
  {
    id: 'husk-walk',
    kind: 'sprite-anim',
    path: 'sprites/husk-walk.webp',
    frameSize: [32, 32],
    dimensions: [128, 96],
    frames: 12,
    fps: 8,
  },
  { id: 'pickup', kind: 'sprite', path: 'sprites/pickup.webp', frameSize: [16, 16], dimensions: [16, 16] },
]

function countingCatalog(opts?: Partial<{ baseUrl: string; fail: number }>) {
  const urls: string[] = []
  let calls = 0
  let fails = opts?.fail ?? 0
  const catalog = new AssetCatalog({
    entries,
    baseUrl: opts?.baseUrl,
    load: async (url) => {
      calls++
      urls.push(url)
      if (fails > 0) {
        fails--
        throw new Error('load failed')
      }
      return new THREE.Texture()
    },
  })
  return { catalog, urls, getCalls: () => calls }
}

test('registers entries and reports membership', () => {
  const { catalog } = countingCatalog()
  expect(catalog.has('husk-walk')).toBe(true)
  expect(catalog.has('missing')).toBe(false)
  expect(catalog.ids().sort()).toEqual(['husk-walk', 'pickup'])
  expect(catalog.entry('husk-walk').path).toBe('sprites/husk-walk.webp')
  expect(() => catalog.entry('missing')).toThrow('no asset "missing"')
})

test('texture() caches: one load per id, same promise returned', async () => {
  const { catalog, getCalls } = countingCatalog()
  const first = catalog.texture('husk-walk')
  const second = catalog.texture('husk-walk')
  expect(first).toBe(second)
  await first
  await catalog.texture('husk-walk')
  expect(getCalls()).toBe(1)
})

test('baseUrl is joined onto the entry path without double slashes', async () => {
  const { catalog, urls } = countingCatalog({ baseUrl: 'https://cdn.example/assets/' })
  await catalog.texture('husk-walk')
  expect(urls).toEqual(['https://cdn.example/assets/sprites/husk-walk.webp'])
})

test('sprite() resolves a texture plus a sheet derived from manifest geometry', async () => {
  const { catalog } = countingCatalog()
  const { texture, sheet } = await catalog.sprite('husk-walk')
  expect(texture).toBeInstanceOf(THREE.Texture)
  expect(sheet.columns).toBe(4) // 128 / 32
  expect(sheet.rows).toBe(3) // 96 / 32
  expect(sheet.size).toEqual([128, 96])
  expect(sheet.clips.all?.frames.length).toBe(12)
  expect(sheet.clips.all?.fps).toBe(8)
})

test('a failed load is not cached, so a later call retries', async () => {
  const { catalog, getCalls } = countingCatalog({ fail: 1 })
  await expect(catalog.texture('husk-walk')).rejects.toThrow('load failed')
  const texture = await catalog.texture('husk-walk') // retried
  expect(texture).toBeInstanceOf(THREE.Texture)
  expect(getCalls()).toBe(2)
})

test('dispose releases cached textures', async () => {
  let disposed = 0
  const catalog = new AssetCatalog({
    entries,
    load: async () => {
      const texture = new THREE.Texture()
      texture.dispose = () => void disposed++
      return texture
    },
  })
  await catalog.texture('husk-walk')
  catalog.dispose()
  await Promise.resolve() // let the dispose .then microtask settle
  expect(disposed).toBe(1)
})

test('deriveSheet infers grid from a sheet block when frameSize is absent', () => {
  const sheet = deriveSheet({
    id: 'x',
    kind: 'sprite-anim',
    path: 'x.webp',
    dimensions: [64, 64],
    sheet: { columns: 2, rows: 2 },
  })
  expect(sheet.frameSize).toEqual([32, 32])
  expect(sheet.columns).toBe(2)
  expect(sheet.rows).toBe(2)
})

test('deriveSheet treats a frames-only entry as a single horizontal strip', () => {
  const sheet = deriveSheet({ id: 'x', kind: 'sprite-anim', path: 'x.webp', frameSize: [8, 8], frames: 5 })
  expect(sheet.columns).toBe(5)
  expect(sheet.rows).toBe(1)
  expect(sheet.size).toEqual([40, 8])
})

test('deriveSheet passes through caller-supplied clips', () => {
  const sheet = deriveSheet({
    id: 'x',
    kind: 'sprite-anim',
    path: 'x.webp',
    frameSize: [16, 16],
    dimensions: [64, 16],
    clips: { run: { frames: [0, 1, 2, 3], fps: 12, loop: true } },
  })
  expect(Object.keys(sheet.clips)).toEqual(['run'])
})

test('deriveSheet accepts JSON-inferred geometry arrays', () => {
  const entry = JSON.parse(
    '{"id":"json-sprite","kind":"sprite","path":"json.webp","frameSize":[16,16],"dimensions":[32,16]}',
  ) as { id: string; kind: string; path: string; frameSize: number[]; dimensions: number[] }

  expect(deriveSheet(entry).size).toEqual([32, 16])
})

test('deriveSheet rejects malformed manifest geometry arrays', () => {
  expect(() =>
    deriveSheet({ id: 'x', kind: 'sprite', path: 'x.webp', frameSize: [16], dimensions: [32, 16] }),
  ).toThrow('frameSize must contain exactly two positive numbers')
  expect(() =>
    deriveSheet({ id: 'x', kind: 'sprite', path: 'x.webp', frameSize: [0, 16], dimensions: [32, 16] }),
  ).toThrow('frameSize must contain exactly two positive numbers')
})

test('deriveSheet throws when geometry is insufficient', () => {
  expect(() => deriveSheet({ id: 'x', kind: 'sprite', path: 'x.webp' })).toThrow('lacks sprite geometry')
})
