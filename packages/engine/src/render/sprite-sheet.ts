import type * as THREE from 'three'

/** A named animation built from frame indices into a sheet's grid. */
export interface SpriteClip {
  /**
   * Grid frame indices in play order. Frame 0 is the top-left cell; indices
   * increase left→right, then top→bottom.
   */
  frames: number[]
  /** Playback rate in frames per second. */
  fps: number
  /** Whether the clip repeats. One-shots (e.g. `attack`) set `false`. Default `true`. */
  loop?: boolean
}

/**
 * Engine-side runtime description of a packed sprite-anim sheet: the grid
 * geometry plus named clips. This is the contract the asset pipeline
 * (`assetgen expand`, #71) emits and {@link AnimatedSprite} consumes. Frames are
 * laid out left→right, top→bottom on a `columns × rows` grid. Directional
 * variants are conventionally keyed `"<clip>.<facing>"` (e.g. `run.s`), which
 * {@link AnimatedSprite} resolves from a facing vector.
 */
export interface SpriteSheet {
  /** Full sheet pixel size `[width, height]`. */
  size: readonly [number, number]
  /** Single frame pixel size `[width, height]`. */
  frameSize: readonly [number, number]
  /** Grid columns (frames per row). */
  columns: number
  /** Grid rows. */
  rows: number
  /** Named clips keyed by clip id (e.g. `idle`, `run`, `attack`, `run.s`). */
  clips: Record<string, SpriteClip>
}

/** Texture `repeat` + `offset` that crop a single frame out of the sheet. */
export interface FrameUV {
  /** Texture repeat: one frame as a fraction of the sheet `[u, v]`. */
  repeat: readonly [number, number]
  /** Texture offset of the frame's lower-left corner in UV space `[u, v]`. */
  offset: readonly [number, number]
}

/** Grid `[column, row]` of a frame index (row-major, top→bottom). */
export function frameCell(sheet: Pick<SpriteSheet, 'columns'>, index: number): [number, number] {
  const col = index % sheet.columns
  const row = Math.floor(index / sheet.columns)
  return [col, row]
}

/**
 * UV `repeat`/`offset` that crop the given frame, computed from frame vs. sheet
 * pixel sizes so it is correct even with padded/atlas sheets. Assumes the
 * texture keeps `flipY = true` (the `THREE.TextureLoader` default), so row 0
 * sits at the top of the image.
 */
export function frameUV(sheet: SpriteSheet, index: number): FrameUV {
  const [sheetW, sheetH] = sheet.size
  const [frameW, frameH] = sheet.frameSize
  const repeatU = frameW / sheetW
  const repeatV = frameH / sheetH
  const [col, row] = frameCell(sheet, index)
  return {
    repeat: [repeatU, repeatV],
    offset: [col * repeatU, 1 - (row + 1) * repeatV],
  }
}

/** Mutate a texture's `repeat`/`offset` to display the given frame of `sheet`. */
export function applyFrame(texture: THREE.Texture, sheet: SpriteSheet, index: number): void {
  const uv = frameUV(sheet, index)
  texture.repeat.set(uv.repeat[0], uv.repeat[1])
  texture.offset.set(uv.offset[0], uv.offset[1])
}

export interface GridSheetOptions {
  columns: number
  rows: number
  /** Single frame pixel size `[width, height]`. */
  frameSize: readonly [number, number]
  /** Named clips. */
  clips: Record<string, SpriteClip>
  /** Full sheet pixel size; defaults to `columns/rows × frameSize`. */
  size?: readonly [number, number]
}

/** Build a uniform-grid {@link SpriteSheet}, deriving `size` from the grid when omitted. */
export function gridSheet(options: GridSheetOptions): SpriteSheet {
  const { columns, rows, frameSize, clips } = options
  const size = options.size ?? [columns * frameSize[0], rows * frameSize[1]]
  return { size, frameSize, columns, rows, clips }
}

/** `[from, from+1, …, to-1]` — convenience for declaring contiguous clip frames. */
export function frameRange(from: number, to: number): number[] {
  const out: number[] = []
  for (let i = from; i < to; i++) out.push(i)
  return out
}

/** Number of directional variants a sheet provides per clip. */
export type FacingCount = 4 | 8

// Clockwise from north (−Z). Index `i` covers the sector centered on its angle.
const DIRS_8 = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const
const DIRS_4 = ['n', 'e', 's', 'w'] as const

/**
 * Map a planar facing vector to a compass suffix (`n`, `ne`, …) used to pick a
 * directional clip variant (`run` → `run.s`). North is −Z (into the scene),
 * east is +X, measured clockwise. Pass a non-zero `dir`; a zero vector has no
 * defined facing and falls back to north.
 */
export function facingSuffix(dir: { x: number; z: number }, count: FacingCount = 8): string {
  const table = count === 4 ? DIRS_4 : DIRS_8
  if (dir.x === 0 && dir.z === 0) return table[0]
  const theta = Math.atan2(dir.x, -dir.z) // 0 at north, increasing clockwise
  const sector = ((Math.round((theta / (Math.PI * 2)) * count) % count) + count) % count
  return table[sector] ?? table[0]
}
