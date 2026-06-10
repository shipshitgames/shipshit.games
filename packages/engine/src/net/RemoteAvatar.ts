import * as THREE from 'three'
import type { RemotePlayerInfo } from './protocol'

/** Identity snapshot forwarded to the skin whenever presence metadata changes. */
export interface RemoteAvatarMeta {
  name: string
  kills: number
  /** Game-defined skin/loadout id, opaque to the engine ('' when the game sends none). */
  avatar: string
  /** 1-based join slot for team color / "P2" style labels (0 when unassigned). */
  slot: number
}

/** Per-frame data handed to the skin after the engine has interpolated the transform. */
export interface RemoteAvatarFrame {
  delta: number
  /**
   * Sum of all deltas passed to `update` since construction. Skins use this
   * for animation phase instead of reading a wall clock, keeping per-frame
   * logic deterministic.
   */
  elapsed: number
  /** True when the group moved more than `movedEpsilon` on the XZ plane this frame. */
  moving: boolean
  cameraQuat: THREE.Quaternion
  cameraPos: THREE.Vector3
}

/**
 * Game-supplied visuals for one remote player. The engine owns transform
 * interpolation, presence lifecycle, and attach points; the skin owns model or
 * sprite selection, team styling, nameplates, and combat readability. A skin
 * factory builds its objects as children of `avatar.group` (world-anchored)
 * and `avatar.billboard` (camera-facing) and may position the billboard.
 *
 * Disposal contract: the skin owns disposal of every GPU resource it created
 * (geometries, materials, textures) inside `dispose` — the engine creates none
 * of its own and only forwards the call.
 */
export interface RemoteAvatarSkin {
  /**
   * Invisible raycast targets for hit detection. The engine adds each to the
   * avatar group, stamps `userData.remoteId` (preserving any keys the skin set,
   * e.g. `part`), and exposes them on `avatar.hitMeshes` for game registration.
   */
  hitMeshes?: THREE.Mesh[]
  onHealth?(health: number, maxHealth: number): void
  onMeta?(meta: RemoteAvatarMeta): void
  update?(frame: RemoteAvatarFrame): void
  dispose?(): void
}

export type RemoteAvatarSkinFactory = (info: RemotePlayerInfo, avatar: RemoteAvatar) => RemoteAvatarSkin

export interface RemoteAvatarOptions {
  /** Builds the game-side visuals; omit for a presence-only (invisible) avatar. */
  skin?: RemoteAvatarSkinFactory
  /**
   * Added to every wire y before it is applied to the group, default 0.
   * Games whose wire transform is eye height pass a negative offset
   * (e.g. -1.8) to plant the group at the feet.
   */
  yOffset?: number
  /**
   * Per-second remaining fraction for the transform lerp, default 0.001.
   * Each update applies `k = 1 - smoothing ** delta`, so after one second
   * only `smoothing` of the gap to the target remains.
   */
  smoothing?: number
  /** Upper bound forwarded with every health change, default 100. */
  maxHealth?: number
  /** Minimum XZ movement per frame to report `moving`, default 0.002. */
  movedEpsilon?: number
}

/**
 * Another player in the room, engine-side. Lerps toward the latest networked
 * transform, tracks presence state (name/kills/health/avatar/slot), keeps the
 * `billboard` attach point facing the camera, and delegates every visual to a
 * game-supplied {@link RemoteAvatarSkin}. No wall clock is read here: skins
 * receive accumulated `elapsed` time instead.
 */
export class RemoteAvatar {
  /** Root object, positioned/rotated by the engine. Add it to the scene. */
  readonly group = new THREE.Group()
  /**
   * Camera-facing attach point parented under `group`. The engine copies the
   * camera quaternion onto it every update; the skin parents health bars and
   * nameplates here and may set its local position.
   */
  readonly billboard = new THREE.Group()
  /** Skin-provided raycast targets, each stamped with `userData.remoteId`. */
  readonly hitMeshes: THREE.Mesh[] = []
  readonly id: string

  name: string
  kills: number
  health: number
  avatar: string
  slot: number

  private readonly skin: RemoteAvatarSkin
  private readonly yOffset: number
  private readonly smoothing: number
  private readonly maxHealth: number
  private readonly movedEpsilon: number
  private readonly target = new THREE.Vector3()
  private targetYaw: number
  private elapsed = 0

  constructor(info: RemotePlayerInfo, options: RemoteAvatarOptions = {}) {
    this.id = info.id
    this.name = info.name
    this.kills = info.kills
    this.health = info.health
    this.avatar = info.avatar
    this.slot = info.slot
    this.yOffset = options.yOffset ?? 0
    this.smoothing = options.smoothing ?? 0.001
    this.maxHealth = options.maxHealth ?? 100
    this.movedEpsilon = options.movedEpsilon ?? 0.002

    this.group.add(this.billboard)
    this.group.position.set(info.x, info.y + this.yOffset, info.z)
    this.group.rotation.y = info.yaw
    this.target.copy(this.group.position)
    this.targetYaw = info.yaw

    this.skin = options.skin?.(info, this) ?? {}
    for (const mesh of this.skin.hitMeshes ?? []) {
      mesh.userData.remoteId = this.id
      this.group.add(mesh)
      this.hitMeshes.push(mesh)
    }

    this.skin.onMeta?.(this.meta())
    this.skin.onHealth?.(this.health, this.maxHealth)
  }

  setTarget(x: number, y: number, z: number, yaw: number): void {
    this.target.set(x, y + this.yOffset, z)
    this.targetYaw = yaw
  }

  setHealth(h: number): void {
    this.health = h
    this.skin.onHealth?.(h, this.maxHealth)
  }

  /** Undefined `avatar`/`slot` keep their current values. */
  setMeta(name: string, kills: number, avatar?: string, slot?: number): void {
    this.name = name
    this.kills = kills
    if (avatar !== undefined) this.avatar = avatar
    if (slot !== undefined) this.slot = slot
    this.skin.onMeta?.(this.meta())
  }

  update(delta: number, cameraQuat: THREE.Quaternion, cameraPos: THREE.Vector3): void {
    const beforeX = this.group.position.x
    const beforeZ = this.group.position.z

    const k = 1 - this.smoothing ** delta
    this.group.position.lerp(this.target, k)

    let dy = this.targetYaw - this.group.rotation.y
    while (dy > Math.PI) dy -= Math.PI * 2
    while (dy < -Math.PI) dy += Math.PI * 2
    this.group.rotation.y += dy * k

    this.elapsed += delta
    const moving =
      Math.hypot(this.group.position.x - beforeX, this.group.position.z - beforeZ) > this.movedEpsilon

    this.billboard.quaternion.copy(cameraQuat)
    this.skin.update?.({ delta, elapsed: this.elapsed, moving, cameraQuat, cameraPos })
  }

  /**
   * Forwards to `skin.dispose` — the skin disposes everything it created.
   * The engine itself allocated no GPU resources.
   */
  dispose(): void {
    this.skin.dispose?.()
  }

  private meta(): RemoteAvatarMeta {
    return { name: this.name, kills: this.kills, avatar: this.avatar, slot: this.slot }
  }
}
