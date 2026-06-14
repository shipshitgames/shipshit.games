import type * as THREE from 'three'

import { loadPixelTexture, type TextureLoaderLike } from './texture'
import { frameRange, type SpriteClip, type SpriteSheet } from './sprite-sheet'

/**
 * The slice of an `assets.json` entry the runtime reads. It mirrors the
 * `assetgen` manifest's sprite geometry (issue #19) and is superset-tolerant —
 * extra manifest fields (license, provider, prompt, …) are ignored.
 */
export interface ManifestSpriteEntry {
  id: string
  kind: string
  /** Path relative to the assets root, joined onto `baseUrl` to load. */
  path: string
  game?: string
  /** Single frame pixel size `[width, height]`. */
  frameSize?: [number, number]
  /** Full sheet pixel size `[width, height]`. */
  dimensions?: [number, number]
  /** Total frame count. */
  frames?: number
  /** Playback rate for the default clip. */
  fps?: number
  /** Packed grid geometry. */
  sheet?: { columns: number; rows: number; usedColumns?: number; usedRows?: number }
  /** Named clips emitted by `assetgen expand` (#71); forward-compatible. */
  clips?: Record<string, SpriteClip>
}

export interface AssetCatalogOptions {
  /** Manifest entries (typically the `assets` array of an `assets.json`). */
  entries: ManifestSpriteEntry[]
  /** Prefix joined onto each `entry.path` to form the load URL. Default `''`. */
  baseUrl?: string
  /** Texture loader injection, forwarded to `loadPixelTexture` (tests / headless). */
  loader?: TextureLoaderLike
  /** Replace the whole texture-loading step (advanced / tests). */
  load?: (url: string) => Promise<THREE.Texture>
}

/**
 * Resolves `assets.json` sprite / sprite-anim entries to pixel-filtered textures
 * and derived {@link SpriteSheet}s, caching each texture so repeated lookups
 * share one GPU upload. Pair with {@link AnimatedSprite}, which clones the
 * shared texture per instance for independent animation.
 */
export class AssetCatalog {
  private readonly byId = new Map<string, ManifestSpriteEntry>()
  private readonly textures = new Map<string, Promise<THREE.Texture>>()
  private readonly baseUrl: string
  private readonly load: (url: string) => Promise<THREE.Texture>

  constructor(options: AssetCatalogOptions) {
    for (const entry of options.entries) this.byId.set(entry.id, entry)
    this.baseUrl = options.baseUrl ?? ''
    this.load = options.load ?? ((url) => loadPixelTexture(url, { loader: options.loader }))
  }

  /** Whether an entry with this id is registered. */
  has(id: string): boolean {
    return this.byId.has(id)
  }

  /** All registered asset ids. */
  ids(): string[] {
    return [...this.byId.keys()]
  }

  /** The raw manifest entry. Throws if the id is unknown. */
  entry(id: string): ManifestSpriteEntry {
    const entry = this.byId.get(id)
    if (!entry) throw new Error(`AssetCatalog: no asset "${id}"`)
    return entry
  }

  /** Load (and cache) the pixel-filtered texture for an entry. */
  texture(id: string): Promise<THREE.Texture> {
    const cached = this.textures.get(id)
    if (cached) return cached
    const entry = this.entry(id)
    const pending = this.load(joinUrl(this.baseUrl, entry.path)).catch((error: unknown) => {
      this.textures.delete(id) // allow a later retry instead of caching the failure
      throw error
    })
    this.textures.set(id, pending)
    return pending
  }

  /** Resolve an entry to its cached texture plus a derived {@link SpriteSheet}. */
  async sprite(id: string): Promise<{ texture: THREE.Texture; sheet: SpriteSheet }> {
    const entry = this.entry(id)
    const texture = await this.texture(id)
    return { texture, sheet: deriveSheet(entry) }
  }

  /** Dispose every loaded texture and clear the cache. */
  dispose(): void {
    for (const pending of this.textures.values()) {
      void pending.then((texture) => texture.dispose()).catch(() => {})
    }
    this.textures.clear()
  }
}

function joinUrl(base: string, path: string): string {
  if (!base) return path
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

/** Derive a {@link SpriteSheet} from a manifest entry's geometry fields. */
export function deriveSheet(entry: ManifestSpriteEntry): SpriteSheet {
  let columns = entry.sheet?.columns
  let rows = entry.sheet?.rows
  let frameSize = entry.frameSize
  const dimensions = entry.dimensions

  if (frameSize && dimensions && (columns === undefined || rows === undefined)) {
    columns ??= Math.max(1, Math.floor(dimensions[0] / frameSize[0]))
    rows ??= Math.max(1, Math.floor(dimensions[1] / frameSize[1]))
  }
  if (!frameSize && dimensions && columns !== undefined && rows !== undefined) {
    frameSize = [dimensions[0] / columns, dimensions[1] / rows]
  }
  if (frameSize && columns === undefined && rows === undefined && entry.frames !== undefined) {
    // No grid metadata: assume a single horizontal strip.
    columns = entry.frames
    rows = 1
  }

  if (!frameSize || columns === undefined || rows === undefined) {
    throw new Error(
      `AssetCatalog: "${entry.id}" lacks sprite geometry (need frameSize plus sheet{columns,rows}, dimensions, or frames)`,
    )
  }

  const size = dimensions ?? [columns * frameSize[0], rows * frameSize[1]]
  const frames = entry.frames ?? columns * rows
  const fps = entry.fps ?? 12
  const clips = entry.clips ?? { all: { frames: frameRange(0, frames), fps, loop: true } }
  return { size, frameSize, columns, rows, clips }
}
