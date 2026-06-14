import * as THREE from 'three'

export interface BillboardOptions {
  /** Sprite texture; pass a pixel texture from `loadPixelTexture`. */
  texture?: THREE.Texture | null
  /** World size of the quad `[width, height]`. Default `[1, 1]`. */
  size?: readonly [number, number]
  /**
   * Alpha cutoff for crisp cutout edges (pixels below it are discarded). Default
   * `0.5`. Combined with `transparent: true` this gives hard, depth-sortable
   * sprite silhouettes instead of soft blended halos.
   */
  alphaTest?: number
  /** Material side. Default `THREE.FrontSide` (the quad faces the camera). */
  side?: THREE.Side
  /**
   * Yaw-only (cylindrical) billboarding keeps upright sprites from tilting when
   * the camera pitches — the right default for standing enemies. When `false`
   * (default) the quad copies the full camera orientation (spherical), matching
   * the engine's `RemoteAvatar` billboard.
   */
  yawOnly?: boolean
}

/**
 * A camera-facing textured quad — the FPS billboard case (scourge-survivors).
 * Add `billboard.mesh` to the scene and call {@link Billboard.faceCamera} each
 * frame. The mesh owns its geometry + material lifetime via {@link dispose};
 * the texture is owned by whoever loaded it (typically an `AssetCatalog`).
 */
export class Billboard {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
  private readonly yawOnly: boolean

  constructor(options: BillboardOptions = {}) {
    const [width, height] = options.size ?? [1, 1]
    const geometry = new THREE.PlaneGeometry(width, height)
    const material = new THREE.MeshBasicMaterial({
      map: options.texture ?? null,
      transparent: true,
      alphaTest: options.alphaTest ?? 0.5,
      side: options.side ?? THREE.FrontSide,
    })
    this.mesh = new THREE.Mesh(geometry, material)
    this.yawOnly = options.yawOnly ?? false
  }

  /** The currently bound texture, or `null`. */
  get texture(): THREE.Texture | null {
    return this.mesh.material.map
  }

  /** Swap the bound texture and flag the material for re-upload. */
  setTexture(texture: THREE.Texture | null): void {
    this.mesh.material.map = texture
    this.mesh.material.needsUpdate = true
  }

  /**
   * Orient the quad toward `camera`. Spherical by default (copies the camera
   * orientation); cylindrical (yaw-only) when constructed with `yawOnly`, which
   * keeps the sprite upright as the camera pitches.
   */
  faceCamera(camera: THREE.Camera): void {
    if (this.yawOnly) {
      const dx = camera.position.x - this.mesh.position.x
      const dz = camera.position.z - this.mesh.position.z
      // PlaneGeometry faces +Z at yaw 0; atan2(dx, dz) turns it to the camera.
      this.mesh.rotation.set(0, Math.atan2(dx, dz), 0)
    } else {
      this.mesh.quaternion.copy(camera.quaternion)
    }
  }

  /** Dispose the geometry and material. Does not dispose the texture. */
  dispose(): void {
    this.mesh.geometry.dispose()
    this.mesh.material.dispose()
  }
}
