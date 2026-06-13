import type * as THREE from 'three'

import { Billboard, type BillboardOptions } from './Billboard'
import {
  applyFrame,
  facingSuffix,
  type FacingCount,
  type SpriteClip,
  type SpriteSheet,
} from './sprite-sheet'

export interface AnimatedSpriteOptions extends Omit<BillboardOptions, 'texture'> {
  /** The packed sheet: grid geometry + named clips. */
  sheet: SpriteSheet
  /** Source pixel texture (from `loadPixelTexture` / `AssetCatalog`). */
  texture?: THREE.Texture | null
  /**
   * Clone the texture so this sprite's frame UVs are independent of every other
   * sprite sharing the same source image. Default `true`. Set `false` only when
   * a single instance owns the texture outright.
   */
  cloneTexture?: boolean
  /** Clip to start on. Default: the first key in `sheet.clips`. */
  clip?: string
  /** Directional variants to resolve from a facing vector. Default `8`. */
  directions?: FacingCount
  /** Speed at/above which {@link AnimatedSprite.setMotion} picks `run` over `idle`. Default `0.1`. */
  runThreshold?: number
}

/**
 * Plays a {@link SpriteSheet}'s clips on a camera-facing {@link Billboard} by
 * driving the texture's UV offset per frame — pixel-crisp at any zoom because
 * the texture keeps `NearestFilter` and no mipmaps. Resolves directional clip
 * variants (`run` → `run.s`) from a facing vector, swaps idle↔run by speed, and
 * plays one-shots (e.g. `attack`) that fire a completion callback and then let
 * locomotion resume.
 */
export class AnimatedSprite {
  readonly billboard: Billboard
  readonly sheet: SpriteSheet

  private readonly texture?: THREE.Texture
  private readonly ownsTexture: boolean
  private readonly directions: FacingCount
  private readonly runThreshold: number

  /** Logical clip the caller asked for (e.g. `run`), before directional resolution. */
  private intendedName = ''
  private facing = ''
  private clip?: SpriteClip
  /** Index into `clip.frames`, not a raw grid index. */
  private frameInRange = 0
  private timer = 0
  private playing = false
  private looping = true
  private onComplete?: () => void

  constructor(options: AnimatedSpriteOptions) {
    this.sheet = options.sheet
    this.directions = options.directions ?? 8
    this.runThreshold = options.runThreshold ?? 0.1

    let texture = options.texture ?? undefined
    const clone = (options.cloneTexture ?? true) && texture !== undefined
    if (texture && clone) {
      texture = texture.clone()
      texture.needsUpdate = true
    }
    this.texture = texture
    this.ownsTexture = clone

    this.billboard = new Billboard({
      texture,
      size: options.size,
      alphaTest: options.alphaTest,
      side: options.side,
      yawOnly: options.yawOnly,
    })

    const first = options.clip ?? Object.keys(this.sheet.clips)[0]
    if (first) this.play(first)
  }

  /** Add this to the scene. */
  get mesh(): Billboard['mesh'] {
    return this.billboard.mesh
  }

  /** The texture being animated (the per-instance clone unless `cloneTexture: false`). */
  get currentTexture(): THREE.Texture | undefined {
    return this.texture
  }

  /** Logical name of the active clip (e.g. `run`), or `''` before any clip plays. */
  get currentClip(): string {
    return this.intendedName
  }

  /** True while a clip is advancing (a finished one-shot reads `false`). */
  get isPlaying(): boolean {
    return this.playing
  }

  /** True while a non-looping clip (e.g. `attack`) is still mid-play. */
  get isOneShotActive(): boolean {
    return this.playing && !this.looping
  }

  /** Orient the billboard toward the camera (delegates to {@link Billboard.faceCamera}). */
  faceCamera(camera: THREE.Camera): void {
    this.billboard.faceCamera(camera)
  }

  /**
   * Start a clip from frame 0. Throws if neither `name` nor its directional
   * variant exists, catching typos. `loop` defaults to the clip's own `loop`
   * (then `true`); `onComplete` fires once when a non-looping clip ends.
   */
  play(name: string, options: { loop?: boolean; onComplete?: () => void } = {}): void {
    const clip = this.resolve(name)
    if (!clip) throw new Error(`AnimatedSprite: no clip "${name}" (facing "${this.facing || 'none'}")`)
    this.intendedName = name
    this.clip = clip
    this.frameInRange = 0
    this.timer = 0
    this.playing = true
    this.looping = options.loop ?? clip.loop ?? true
    this.onComplete = options.onComplete
    this.applyCurrentFrame()
  }

  /**
   * Pick `run` (speed ≥ `runThreshold`) or `idle` and loop it. A no-op while a
   * one-shot is mid-play, so an attack finishes before locomotion resumes, and a
   * no-op when the chosen clip is already the intended one (no restart per call).
   */
  setMotion(speed: number): void {
    if (this.isOneShotActive) return
    const want = speed >= this.runThreshold ? 'run' : 'idle'
    if (want === this.intendedName && this.playing) return
    if (this.resolve(want)) this.play(want, { loop: true })
  }

  /**
   * Update the directional facing, swapping to the matching clip variant while
   * preserving the current frame so turning mid-stride doesn't restart the walk
   * cycle. No-op when the facing sector is unchanged.
   */
  setFacing(dir: { x: number; z: number }): void {
    const suffix = facingSuffix(dir, this.directions)
    if (suffix === this.facing) return
    this.facing = suffix
    if (!this.intendedName) return
    const resolved = this.resolve(this.intendedName)
    if (resolved && resolved !== this.clip) {
      this.clip = resolved
      if (this.frameInRange >= resolved.frames.length) this.frameInRange = 0
      this.applyCurrentFrame()
    }
  }

  /** Advance the active clip by `dt` seconds and apply the resulting frame. */
  update(dt: number): void {
    const clip = this.clip
    if (!clip || !this.playing) return
    if (clip.fps > 0 && clip.frames.length > 0) {
      const frameDur = 1 / clip.fps
      this.timer += dt
      while (this.playing && this.timer >= frameDur) {
        this.timer -= frameDur
        this.advance(clip)
      }
    }
    this.applyCurrentFrame()
  }

  /** Dispose the billboard, and the cloned texture if this sprite owns one. */
  dispose(): void {
    this.billboard.dispose()
    if (this.ownsTexture) this.texture?.dispose()
  }

  private advance(clip: SpriteClip): void {
    const len = clip.frames.length
    this.frameInRange++
    if (this.frameInRange < len) return
    if (this.looping) {
      this.frameInRange %= len
      return
    }
    // One-shot: hold the last frame, stop, and fire completion exactly once.
    this.frameInRange = Math.max(0, len - 1)
    this.playing = false
    const done = this.onComplete
    this.onComplete = undefined
    done?.()
  }

  private applyCurrentFrame(): void {
    if (!this.texture || !this.clip) return
    const frame = this.clip.frames[this.frameInRange]
    if (frame === undefined) return
    applyFrame(this.texture, this.sheet, frame)
  }

  private resolve(name: string): SpriteClip | undefined {
    if (this.facing) {
      const directional = this.sheet.clips[`${name}.${this.facing}`]
      if (directional) return directional
    }
    return this.sheet.clips[name]
  }
}
