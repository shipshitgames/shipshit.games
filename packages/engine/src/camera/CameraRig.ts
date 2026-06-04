import * as THREE from 'three'
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js'

/**
 * The camera seam — the load-bearing one.
 *
 * Embodied games disagree on *how the player is embodied*: an FPS welds the
 * player body to the render camera (mouse look = body turn); a third-person /
 * embodied tower-defense orbits a free camera around an avatar root and places
 * things under a world cursor. The {@link CameraRig} interface lets engine
 * systems move, place, and aim "the player" without naming either scheme.
 *
 * The invariant every consuming system must honour:
 * **`camera` is render/projection ONLY** — never read `camera.position` /
 * `camera.quaternion` as the player body. Player logic reads {@link CameraRig.body}
 * (`.position`) and {@link CameraRig.facing}; held items mount on
 * {@link CameraRig.attach}; aim rays come from {@link CameraRig.pickRay}.
 * For the FPS preset all three (`camera`, `body`, `attach`) are the *same*
 * object, so the FPS plays identically — but the vocabulary is now genre-neutral.
 */
export interface CameraRig {
  /** Render/projection ONLY — never read camera.position/quaternion for player logic. */
  readonly camera: THREE.PerspectiveCamera
  /** Canonical player world-transform. FPS: body===camera. 3rd-person: avatar root. */
  readonly body: THREE.Object3D
  /** Eye/hand mount for first-person held items. FPS: ===camera; 3rd-person: avatar node. */
  readonly attach: THREE.Object3D
  /** Body heading the world should see (NOT the pitched orbit camera). */
  readonly facing: THREE.Quaternion
  readonly yaw: number
  readonly pitch: number
  readonly captured: boolean

  /** Move body a world-distance delta THIS FRAME in body-yaw space (caller = velocity*dt). */
  movePlanar(dx: number, dz: number): void
  /** Spawn pose: zeroes pitch/roll, faces (faceX,faceZ), snaps boom with no lerp. */
  placeAt(x: number, y: number, z: number, faceX: number, faceZ: number): void

  /** FPS passes (0,0)=center; TD passes live cursor NDC for click-place. */
  pickRay(ndcX: number, ndcY: number, out: THREE.Raycaster): void
  groundPoint(ndcX: number, ndcY: number, planeY: number, out: THREE.Vector3): boolean

  /** ArenaSystem feeds colliders so the 3rd-person boom can raycast (FPS ignores). */
  setColliders(objs: THREE.Object3D[]): void
  setFov(deg: number): void
  zoom(factor: number): void

  requestCapture(): void
  releaseCapture(silent?: boolean): void // safe no-op if not captured
  on(ev: RigCaptureEvent, fn: () => void): void
  off(ev: RigCaptureEvent, fn: () => void): void

  /** End-of-frame: AFTER body movement + collision, BEFORE render. 3rd-person follow-lerp + boom. */
  update(delta: number): void
  resize(aspect: number): void
  dispose(): void
}

export type RigCaptureEvent = 'capture' | 'release'

/** Builds a {@link CameraRig} around a caller-owned render camera + capture surface. */
export type CameraRigPreset = (camera: THREE.PerspectiveCamera, domElement: HTMLElement) => CameraRig

// Shared scratch — single instances, never escape a synchronous call.
const _ndc = new THREE.Vector2()
const _groundRay = new THREE.Raycaster()
const _plane = new THREE.Plane()

/**
 * First-person rig: the player body *is* the render camera. Wraps three's
 * {@link PointerLockControls} for mouse-look + pointer capture, so this file is
 * the ONLY place the engine imports `PointerLockControls` — every other system
 * speaks {@link CameraRig}. Behaviourally identical to driving the controls
 * directly: `movePlanar` is just `moveRight`+`moveForward`.
 */
class FirstPersonRig implements CameraRig {
  readonly camera: THREE.PerspectiveCamera
  private readonly domElement: HTMLElement
  private readonly controls: PointerLockControls
  private readonly _euler = new THREE.Euler(0, 0, 0, 'YXZ')
  private readonly _captureFns = new Set<() => void>()
  private readonly _releaseFns = new Set<() => void>()
  private _suppressNextRelease = false

  constructor(camera: THREE.PerspectiveCamera, domElement: HTMLElement) {
    this.camera = camera
    this.domElement = domElement
    this.controls = new PointerLockControls(camera, domElement)
    this.controls.addEventListener('lock', this._onLock)
    this.controls.addEventListener('unlock', this._onUnlock)
  }

  // FPS: the body, the held-item mount, and the render camera are one object.
  get body(): THREE.Object3D {
    return this.camera
  }
  get attach(): THREE.Object3D {
    return this.camera
  }
  get facing(): THREE.Quaternion {
    return this.camera.quaternion
  }
  get yaw(): number {
    this._euler.setFromQuaternion(this.camera.quaternion, 'YXZ')
    return this._euler.y
  }
  get pitch(): number {
    this._euler.setFromQuaternion(this.camera.quaternion, 'YXZ')
    return this._euler.x
  }
  get captured(): boolean {
    return this.controls.isLocked
  }

  movePlanar(dx: number, dz: number): void {
    this.controls.moveRight(dx)
    this.controls.moveForward(dz)
  }

  placeAt(x: number, y: number, z: number, faceX: number, faceZ: number): void {
    this.camera.position.set(x, y, z)
    this.camera.rotation.set(0, 0, 0)
    // Horizontal look (same y) → zero pitch/roll, just a yaw toward (faceX,faceZ).
    this.camera.lookAt(x + faceX, y, z + faceZ)
  }

  pickRay(ndcX: number, ndcY: number, out: THREE.Raycaster): void {
    out.setFromCamera(_ndc.set(ndcX, ndcY), this.camera)
  }

  groundPoint(ndcX: number, ndcY: number, planeY: number, out: THREE.Vector3): boolean {
    _groundRay.setFromCamera(_ndc.set(ndcX, ndcY), this.camera)
    _plane.setComponents(0, 1, 0, -planeY) // horizontal plane at y = planeY
    return _groundRay.ray.intersectPlane(_plane, out) !== null
  }

  setColliders(_objs: THREE.Object3D[]): void {
    // FPS has no third-person boom to collide; nothing to track.
  }

  setFov(deg: number): void {
    this.camera.fov = deg
    this.camera.updateProjectionMatrix()
  }

  zoom(factor: number): void {
    this.camera.zoom = Math.max(0.01, this.camera.zoom * factor)
    this.camera.updateProjectionMatrix()
  }

  requestCapture(): void {
    this.domElement.requestPointerLock()
  }

  releaseCapture(silent = false): void {
    if (!this.controls.isLocked) return
    if (silent) this._suppressNextRelease = true
    this.controls.unlock()
  }

  on(ev: RigCaptureEvent, fn: () => void): void {
    ;(ev === 'capture' ? this._captureFns : this._releaseFns).add(fn)
  }

  off(ev: RigCaptureEvent, fn: () => void): void {
    ;(ev === 'capture' ? this._captureFns : this._releaseFns).delete(fn)
  }

  update(_delta: number): void {
    // FPS: the camera IS the body — no follow-lerp or boom to advance.
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect
    this.camera.updateProjectionMatrix()
  }

  dispose(): void {
    this.controls.removeEventListener('lock', this._onLock)
    this.controls.removeEventListener('unlock', this._onUnlock)
    if (this.controls.isLocked) this.controls.unlock()
    this.controls.dispose()
    this._captureFns.clear()
    this._releaseFns.clear()
  }

  private _onLock = (): void => {
    for (const fn of this._captureFns) fn()
  }

  private _onUnlock = (): void => {
    // pointerlockchange fires async, so a sync `silent` flag set in
    // releaseCapture persists until the event lands here.
    if (this._suppressNextRelease) {
      this._suppressNextRelease = false
      return
    }
    for (const fn of this._releaseFns) fn()
  }
}

/**
 * The first-person preset: mouse-look pointer-lock rig where `body===camera`.
 * This is the rig Scourge Survivors (and any embodied-shooter) binds.
 */
export const firstPersonPointerLock: CameraRigPreset = (camera, domElement) =>
  new FirstPersonRig(camera, domElement)

/**
 * Config for the third-person orbit-follow preset.
 *
 * NOTE: `thirdPersonFollow(cfg)` itself is intentionally NOT implemented yet —
 * the extraction plan validates the orbit/follow-lerp/boom-collision math by
 * BUILDING Deadlane on it (checklist step 12), because that camera scheme has no
 * consumer to test against until then. The interface + this config are defined
 * now so the contract is stable; the preset lands with its first real consumer.
 */
export interface ThirdPersonFollowConfig {
  distance: number
  height: number
  followLerp: number
  minDistance: number
}
