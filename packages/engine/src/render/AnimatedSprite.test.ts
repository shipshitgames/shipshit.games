import { expect, test } from 'bun:test'
import * as THREE from 'three'

import { AnimatedSprite } from './AnimatedSprite'
import { frameUV, gridSheet, type SpriteSheet } from './sprite-sheet'

function makeSheet(): SpriteSheet {
  // 4×3 grid of 16px frames. Distinct frame ranges per clip so the active clip
  // is observable from the texture offset alone.
  return gridSheet({
    columns: 4,
    rows: 3,
    frameSize: [16, 16],
    clips: {
      idle: { frames: [0, 1], fps: 2, loop: true },
      run: { frames: [2, 3], fps: 4, loop: true },
      attack: { frames: [8, 9, 10], fps: 10, loop: false },
      'run.s': { frames: [4, 5], fps: 4, loop: true },
      'run.n': { frames: [6, 7], fps: 4, loop: true },
    },
  })
}

function offsetOf(sprite: AnimatedSprite, sheet: SpriteSheet, frame: number): boolean {
  const tex = sprite.currentTexture
  if (!tex) return false
  const uv = frameUV(sheet, frame)
  return Math.abs(tex.offset.x - uv.offset[0]) < 1e-6 && Math.abs(tex.offset.y - uv.offset[1]) < 1e-6
}

test('starts on the first clip and clones the source texture', () => {
  const sheet = makeSheet()
  const source = new THREE.Texture()
  const sprite = new AnimatedSprite({ sheet, texture: source })

  expect(sprite.currentClip).toBe('idle')
  expect(sprite.currentTexture).toBeDefined()
  expect(sprite.currentTexture).not.toBe(source) // cloned for independent UVs
  expect(offsetOf(sprite, sheet, 0)).toBe(true)
})

test('update advances frames at the clip fps and loops', () => {
  const sheet = makeSheet()
  const sprite = new AnimatedSprite({ sheet, texture: new THREE.Texture() })
  sprite.play('run') // frames [2, 3] at 4 fps → 0.25s per frame

  expect(offsetOf(sprite, sheet, 2)).toBe(true)
  sprite.update(0.25)
  expect(offsetOf(sprite, sheet, 3)).toBe(true)
  sprite.update(0.25) // wraps back to frame 2
  expect(offsetOf(sprite, sheet, 2)).toBe(true)
})

test('a one-shot holds its last frame, stops, and fires onComplete once', () => {
  const sheet = makeSheet()
  const sprite = new AnimatedSprite({ sheet, texture: new THREE.Texture() })
  let completed = 0
  sprite.play('attack', { onComplete: () => completed++ }) // [8,9,10] at 10 fps

  expect(sprite.isPlaying).toBe(true)
  expect(sprite.isOneShotActive).toBe(true)
  sprite.update(0.1) // → frame 9
  expect(offsetOf(sprite, sheet, 9)).toBe(true)
  sprite.update(0.1) // → frame 10
  sprite.update(0.1) // would overrun → hold 10, stop, complete
  expect(offsetOf(sprite, sheet, 10)).toBe(true)
  expect(sprite.isPlaying).toBe(false)
  expect(completed).toBe(1)

  sprite.update(1) // no further advance, no second completion
  expect(offsetOf(sprite, sheet, 10)).toBe(true)
  expect(completed).toBe(1)
})

test('a one-shot completes once under a single oversized dt (multi-frame overrun)', () => {
  const sheet = makeSheet()
  const sprite = new AnimatedSprite({ sheet, texture: new THREE.Texture() })
  let completed = 0
  sprite.play('attack', { onComplete: () => completed++ }) // [8,9,10] at 10 fps

  sprite.update(1) // one big step blows past all three frames in a single advance loop
  expect(sprite.isPlaying).toBe(false) // loop stops the instant the clip ends, mid-iteration
  expect(completed).toBe(1) // fires exactly once even though several frameDurs elapsed
  expect(offsetOf(sprite, sheet, 10)).toBe(true) // holds the last frame
})

test('setMotion swaps idle↔run by speed without restarting a steady clip', () => {
  const sheet = makeSheet()
  const sprite = new AnimatedSprite({ sheet, texture: new THREE.Texture(), runThreshold: 0.5 })

  sprite.setMotion(0)
  expect(sprite.currentClip).toBe('idle')

  sprite.setMotion(1)
  expect(sprite.currentClip).toBe('run')
  sprite.update(0.25) // run frame index 1 (frame 3)
  expect(offsetOf(sprite, sheet, 3)).toBe(true)

  sprite.setMotion(2) // still running → must not restart to frame 0
  expect(offsetOf(sprite, sheet, 3)).toBe(true)

  sprite.setMotion(0) // back to idle, restarts
  expect(sprite.currentClip).toBe('idle')
  expect(offsetOf(sprite, sheet, 0)).toBe(true)
})

test('setMotion does not interrupt an active one-shot', () => {
  const sheet = makeSheet()
  const sprite = new AnimatedSprite({ sheet, texture: new THREE.Texture() })
  sprite.play('attack', { loop: false })

  sprite.setMotion(5) // ignored mid-attack
  expect(sprite.currentClip).toBe('attack')

  sprite.update(0.1)
  sprite.update(0.1)
  sprite.update(0.1) // attack completes
  expect(sprite.isPlaying).toBe(false)

  sprite.setMotion(5) // now locomotion resumes
  expect(sprite.currentClip).toBe('run')
})

test('setFacing swaps to the directional variant while preserving frame progress', () => {
  const sheet = makeSheet()
  const sprite = new AnimatedSprite({ sheet, texture: new THREE.Texture() })
  sprite.play('run') // base run [2,3], facing unset
  sprite.update(0.25) // frame index 1 → frame 3
  expect(offsetOf(sprite, sheet, 3)).toBe(true)

  sprite.setFacing({ x: 0, z: 1 }) // south → run.s [4,5], keep index 1 → frame 5
  expect(sprite.currentClip).toBe('run') // logical name unchanged
  expect(offsetOf(sprite, sheet, 5)).toBe(true)

  sprite.setFacing({ x: 0, z: -1 }) // north → run.n [6,7], index 1 → frame 7
  expect(offsetOf(sprite, sheet, 7)).toBe(true)
})

test('setFacing to a shorter directional variant clamps frame progress instead of freezing', () => {
  // run has 4 frames; its south variant has only 1, so a frame index carried over
  // from the longer clip would be out of range — the swap must clamp, not freeze.
  const sheet = gridSheet({
    columns: 4,
    rows: 3,
    frameSize: [16, 16],
    clips: {
      run: { frames: [2, 3, 8, 9], fps: 4, loop: true },
      'run.s': { frames: [4], fps: 4, loop: true },
    },
  })
  const sprite = new AnimatedSprite({ sheet, texture: new THREE.Texture() })
  sprite.play('run')
  sprite.update(0.25) // index 1
  sprite.update(0.25) // index 2
  sprite.update(0.25) // index 3 → frame 9
  expect(offsetOf(sprite, sheet, 9)).toBe(true)

  sprite.setFacing({ x: 0, z: 1 }) // south → run.s (1 frame); index 3 out of range → clamp to 0
  expect(offsetOf(sprite, sheet, 4)).toBe(true) // shows run.s frame 0, not a stale/undefined frame
})

test('play throws on an unknown clip', () => {
  const sprite = new AnimatedSprite({ sheet: makeSheet(), texture: new THREE.Texture() })
  expect(() => sprite.play('nope')).toThrow('no clip "nope"')
})

test('dispose releases a cloned texture but spares a shared one', () => {
  const sheet = makeSheet()

  const owned = new AnimatedSprite({ sheet, texture: new THREE.Texture() })
  const ownedTexture = owned.currentTexture
  let ownedDisposed = 0
  if (ownedTexture) ownedTexture.dispose = () => void ownedDisposed++
  owned.dispose()
  expect(ownedDisposed).toBe(1)

  const shared = new THREE.Texture()
  let sharedDisposed = 0
  shared.dispose = () => void sharedDisposed++
  const borrower = new AnimatedSprite({ sheet, texture: shared, cloneTexture: false })
  expect(borrower.currentTexture).toBe(shared)
  borrower.dispose()
  expect(sharedDisposed).toBe(0)
})

test('an empty sheet leaves the sprite idle without throwing', () => {
  const sheet = gridSheet({ columns: 1, rows: 1, frameSize: [8, 8], clips: {} })
  const sprite = new AnimatedSprite({ sheet, texture: new THREE.Texture() })
  expect(sprite.currentClip).toBe('')
  expect(sprite.isPlaying).toBe(false)
  expect(() => sprite.update(1)).not.toThrow()
})

test('a zero-fps clip is static: update holds the first frame', () => {
  const sheet = gridSheet({
    columns: 2,
    rows: 1,
    frameSize: [8, 8],
    clips: { banner: { frames: [0, 1], fps: 0, loop: true } },
  })
  const sprite = new AnimatedSprite({ sheet, texture: new THREE.Texture() })
  sprite.update(10)
  expect(offsetOf(sprite, sheet, 0)).toBe(true)
})

test('setMotion stays put when the wanted locomotion clip is missing', () => {
  const sheet = gridSheet({
    columns: 2,
    rows: 1,
    frameSize: [8, 8],
    clips: { idle: { frames: [0, 1], fps: 2, loop: true } }, // no "run"
  })
  const sprite = new AnimatedSprite({ sheet, texture: new THREE.Texture() })
  sprite.setMotion(0)
  expect(sprite.currentClip).toBe('idle')
  sprite.setMotion(99) // wants "run", which does not exist → unchanged
  expect(sprite.currentClip).toBe('idle')
})

test('two sprites sharing a source animate independently', () => {
  const sheet = makeSheet()
  const source = new THREE.Texture()
  const a = new AnimatedSprite({ sheet, texture: source })
  const b = new AnimatedSprite({ sheet, texture: source })

  a.play('run')
  b.play('idle')
  a.update(0.25) // a → run frame 3
  expect(offsetOf(a, sheet, 3)).toBe(true)
  expect(offsetOf(b, sheet, 0)).toBe(true) // b untouched
})
