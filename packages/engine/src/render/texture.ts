import * as THREE from 'three'

/**
 * The slice of `THREE.TextureLoader` the engine actually calls. Declaring it as
 * an interface lets tests and headless runtimes inject a fake loader instead of
 * touching the DOM / network; the real `THREE.TextureLoader` satisfies it (a
 * `loadAsync(url, onProgress?)` is assignable to `loadAsync(url)`).
 */
export interface TextureLoaderLike {
  loadAsync(url: string): Promise<THREE.Texture>
}

export interface PixelTextureOptions {
  /** Loader override; defaults to a shared `THREE.TextureLoader`. */
  loader?: TextureLoaderLike
}

/**
 * Stamp the one correct sampling combo for crisp pixel art onto a texture:
 * nearest filtering (no bilinear mush), no mipmaps (no distance blur), and sRGB
 * color space so generated PNG/WebP colors are not double-gamma'd. Mutates and
 * returns the same texture for chaining, and flags it for re-upload.
 */
export function applyPixelFilters(texture: THREE.Texture): THREE.Texture {
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.NearestFilter
  texture.generateMipmaps = false
  texture.colorSpace = THREE.SRGBColorSpace
  texture.needsUpdate = true
  return texture
}

let sharedLoader: TextureLoaderLike | undefined

/**
 * The single supported way to get a pixel sprite onto the GPU: load the image
 * and apply {@link applyPixelFilters}. Games must call this instead of using
 * `THREE.TextureLoader` directly so every sprite gets crisp, mip-free, sRGB
 * sampling. Pass `options.loader` to stub the actual fetch in tests / headless.
 */
export async function loadPixelTexture(
  url: string,
  options: PixelTextureOptions = {},
): Promise<THREE.Texture> {
  const loader = options.loader ?? (sharedLoader ??= new THREE.TextureLoader())
  const texture = await loader.loadAsync(url)
  return applyPixelFilters(texture)
}
