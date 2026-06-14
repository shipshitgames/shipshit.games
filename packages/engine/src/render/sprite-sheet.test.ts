import { expect, test } from 'bun:test'
import * as THREE from 'three'

import {
  applyFrame,
  facingSuffix,
  frameCell,
  frameRange,
  frameUV,
  gridSheet,
  type SpriteSheet,
} from './sprite-sheet'

const strip: SpriteSheet = gridSheet({
  columns: 4,
  rows: 1,
  frameSize: [64, 64],
  clips: {},
})

const grid: SpriteSheet = gridSheet({
  columns: 2,
  rows: 2,
  frameSize: [64, 64],
  clips: {},
})

test('gridSheet derives sheet size from grid × frame size', () => {
  expect(strip.size).toEqual([256, 64])
  expect(grid.size).toEqual([128, 128])
})

test('frameCell maps an index to row-major [col, row]', () => {
  expect(frameCell(grid, 0)).toEqual([0, 0])
  expect(frameCell(grid, 1)).toEqual([1, 0])
  expect(frameCell(grid, 2)).toEqual([0, 1])
  expect(frameCell(grid, 3)).toEqual([1, 1])
})

test('frameUV crops a single-row strip left→right', () => {
  expect(frameUV(strip, 0)).toEqual({ repeat: [0.25, 1], offset: [0, 0] })
  expect(frameUV(strip, 1)).toEqual({ repeat: [0.25, 1], offset: [0.25, 0] })
  expect(frameUV(strip, 3)).toEqual({ repeat: [0.25, 1], offset: [0.75, 0] })
})

test('frameUV places row 0 at the top of the image (flipY convention)', () => {
  // Row 0 sits high in UV (v = 0.5), row 1 sits at the bottom (v = 0).
  expect(frameUV(grid, 0)).toEqual({ repeat: [0.5, 0.5], offset: [0, 0.5] })
  expect(frameUV(grid, 2)).toEqual({ repeat: [0.5, 0.5], offset: [0, 0] })
  expect(frameUV(grid, 3)).toEqual({ repeat: [0.5, 0.5], offset: [0.5, 0] })
})

test('frameUV is correct for padded/atlas sheets (frame ≠ size / columns)', () => {
  const padded: SpriteSheet = { size: [300, 64], frameSize: [64, 64], columns: 4, rows: 1, clips: {} }
  const uv = frameUV(padded, 1)
  expect(uv.repeat[0]).toBeCloseTo(64 / 300)
  expect(uv.offset[0]).toBeCloseTo(64 / 300)
})

test('applyFrame mutates the texture offset and repeat', () => {
  const texture = new THREE.Texture()
  applyFrame(texture, grid, 3)
  expect(texture.repeat.x).toBeCloseTo(0.5)
  expect(texture.repeat.y).toBeCloseTo(0.5)
  expect(texture.offset.x).toBeCloseTo(0.5)
  expect(texture.offset.y).toBeCloseTo(0)
})

test('frameRange enumerates a half-open interval', () => {
  expect(frameRange(0, 3)).toEqual([0, 1, 2])
  expect(frameRange(4, 4)).toEqual([])
})

test('facingSuffix resolves 8-way compass directions (north = -Z, clockwise)', () => {
  expect(facingSuffix({ x: 0, z: -1 })).toBe('n')
  expect(facingSuffix({ x: 1, z: -1 })).toBe('ne')
  expect(facingSuffix({ x: 1, z: 0 })).toBe('e')
  expect(facingSuffix({ x: 1, z: 1 })).toBe('se')
  expect(facingSuffix({ x: 0, z: 1 })).toBe('s')
  expect(facingSuffix({ x: -1, z: 1 })).toBe('sw')
  expect(facingSuffix({ x: -1, z: 0 })).toBe('w')
  expect(facingSuffix({ x: -1, z: -1 })).toBe('nw')
})

test('facingSuffix collapses to 4-way and defaults a zero vector to north', () => {
  expect(facingSuffix({ x: 0, z: -1 }, 4)).toBe('n')
  expect(facingSuffix({ x: 1, z: 0 }, 4)).toBe('e')
  expect(facingSuffix({ x: 0, z: 1 }, 4)).toBe('s')
  expect(facingSuffix({ x: -1, z: 0 }, 4)).toBe('w')
  expect(facingSuffix({ x: 0, z: 0 })).toBe('n')
})
