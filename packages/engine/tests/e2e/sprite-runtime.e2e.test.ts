/**
 * End-to-end sprite runtime test: a manifest entry flows through the real
 * AssetCatalog → loadPixelTexture → AnimatedSprite → THREE.Scene, all inside
 * bun. The only stub is the image fetch (a fake TextureLoader), so every piece
 * that matters — pixel filtering, sheet derivation, frame UVs, facing, idle↔run,
 * the one-shot attack, and camera-facing — runs the real engine code.
 */
import { expect, test } from 'bun:test'
import * as THREE from 'three'

import {
  AnimatedSprite,
  AssetCatalog,
  frameUV,
  type ManifestSpriteEntry,
  type SpriteSheet,
  type TextureLoaderLike,
} from '../../src/index'

// One packed hero: 4×3 grid of 24px frames with directional run variants.
const HERO: ManifestSpriteEntry = {
  id: 'pyre-soldier',
  kind: 'sprite-anim',
  path: 'sprites/pyre-soldier.webp',
  game: 'scourge-survivors',
  frameSize: [24, 24],
  dimensions: [96, 72],
  frames: 12,
  fps: 8,
  sheet: { columns: 4, rows: 3 },
  clips: {
    idle: { frames: [0, 1], fps: 4, loop: true },
    run: { frames: [2, 3], fps: 8, loop: true },
    attack: { frames: [8, 9, 10, 11], fps: 12, loop: false },
    'run.s': { frames: [4, 5], fps: 8, loop: true },
    'run.n': { frames: [6, 7], fps: 8, loop: true },
  },
}

function fakeLoader(): TextureLoaderLike {
  return {
    loadAsync: async () => {
      const texture = new THREE.Texture()
      texture.image = { width: 96, height: 72 } // dimensions the real loader would read
      return texture
    },
  }
}

function offsetMatches(sprite: AnimatedSprite, sheet: SpriteSheet, frame: number): boolean {
  const tex = sprite.currentTexture
  if (!tex) return false
  const uv = frameUV(sheet, frame)
  return Math.abs(tex.offset.x - uv.offset[0]) < 1e-6 && Math.abs(tex.offset.y - uv.offset[1]) < 1e-6
}

test('a manifest entry drives a pixel-crisp, camera-facing animated agent end-to-end', async () => {
  const catalog = new AssetCatalog({ entries: [HERO], baseUrl: 'https://cdn/assets', loader: fakeLoader() })

  // 1) Resolve the entry → pixel-filtered texture + derived sheet.
  const { texture, sheet } = await catalog.sprite('pyre-soldier')
  expect(texture.magFilter).toBe(THREE.NearestFilter) // pixel-crisp, no bilinear mush
  expect(texture.minFilter).toBe(THREE.NearestFilter)
  expect(texture.generateMipmaps).toBe(false) // no distance blur
  expect(texture.colorSpace).toBe(THREE.SRGBColorSpace)
  expect(sheet.columns).toBe(4)
  expect(sheet.rows).toBe(3)

  // 2) Mount an AnimatedSprite into a real scene.
  const scene = new THREE.Scene()
  const agent = new AnimatedSprite({ sheet, texture, size: [1, 1], yawOnly: true })
  scene.add(agent.mesh)
  expect(scene.children).toContain(agent.mesh)
  expect(agent.currentTexture?.magFilter).toBe(THREE.NearestFilter) // clone kept the filter

  // 3) Idle, then run by speed.
  agent.setMotion(0)
  expect(agent.currentClip).toBe('idle')
  expect(offsetMatches(agent, sheet, 0)).toBe(true)

  agent.setMotion(3)
  expect(agent.currentClip).toBe('run')

  // 4) Facing south picks the directional run variant.
  agent.setFacing({ x: 0, z: 1 })
  expect(offsetMatches(agent, sheet, 4)).toBe(true) // run.s frame 0
  agent.update(0.125) // 8 fps → 1 frame
  expect(offsetMatches(agent, sheet, 5)).toBe(true) // run.s frame 1

  // 5) Camera-facing: the billboard turns to the camera on Y.
  const camera = new THREE.PerspectiveCamera()
  camera.position.set(5, 2, 0)
  agent.faceCamera(camera)
  expect(agent.mesh.rotation.y).toBeCloseTo(Math.PI / 2)

  // 6) One-shot attack interrupts locomotion, then locomotion resumes.
  let attacked = 0
  agent.play('attack', { onComplete: () => attacked++ })
  expect(agent.currentClip).toBe('attack')
  agent.setMotion(3) // ignored mid-attack
  expect(agent.currentClip).toBe('attack')
  for (let i = 0; i < 4; i++) agent.update(1 / 12) // play out 4 frames at 12 fps
  expect(attacked).toBe(1)
  expect(agent.isPlaying).toBe(false)
  expect(offsetMatches(agent, sheet, 11)).toBe(true) // holds the last attack frame

  agent.setMotion(3) // resumes running now the one-shot is done
  expect(agent.currentClip).toBe('run')

  agent.dispose()
  catalog.dispose()
})
