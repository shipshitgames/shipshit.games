import { expect, test } from 'bun:test'
import * as THREE from 'three'

import { applyPixelFilters, loadPixelTexture, type TextureLoaderLike } from './texture'

test('applyPixelFilters stamps the crisp pixel sampling combo', () => {
  const texture = new THREE.Texture()
  const returned = applyPixelFilters(texture)

  expect(returned).toBe(texture) // mutates and returns the same texture
  expect(texture.magFilter).toBe(THREE.NearestFilter)
  expect(texture.minFilter).toBe(THREE.NearestFilter)
  expect(texture.generateMipmaps).toBe(false)
  expect(texture.colorSpace).toBe(THREE.SRGBColorSpace)
  expect(texture.version).toBeGreaterThan(0) // needsUpdate = true bumps the upload version
})

test('loadPixelTexture loads via the injected loader and applies pixel filters', async () => {
  const seen: string[] = []
  const loader: TextureLoaderLike = {
    loadAsync: async (url) => {
      seen.push(url)
      return new THREE.Texture()
    },
  }

  const texture = await loadPixelTexture('hero.webp', { loader })

  expect(seen).toEqual(['hero.webp'])
  expect(texture.magFilter).toBe(THREE.NearestFilter)
  expect(texture.generateMipmaps).toBe(false)
  expect(texture.colorSpace).toBe(THREE.SRGBColorSpace)
})

test('loadPixelTexture rejects when the loader rejects', async () => {
  const loader: TextureLoaderLike = {
    loadAsync: async () => {
      throw new Error('404')
    },
  }
  await expect(loadPixelTexture('missing.webp', { loader })).rejects.toThrow('404')
})
