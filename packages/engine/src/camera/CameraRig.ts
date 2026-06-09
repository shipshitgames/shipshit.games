import * as THREE from "three";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";

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
  readonly camera: THREE.PerspectiveCamera;
  /** Canonical player world-transform. FPS: body===camera. 3rd-person: avatar root. */
  readonly body: THREE.Object3D;
  /** Eye/hand mount for first-person held items. FPS: ===camera; 3rd-person: avatar node. */
  readonly attach: THREE.Object3D;
  /** Body heading the world should see (NOT the pitched orbit camera). */
  readonly facing: THREE.Quaternion;
  readonly yaw: number;
  readonly pitch: number;
  readonly captured: boolean;

  /** Move body a world-distance delta THIS FRAME in body-yaw space (caller = velocity*dt). */
  movePlanar(dx: number, dz: number): void;
  /** Spawn pose: zeroes pitch/roll, faces (faceX,faceZ), snaps boom with no lerp. */
  placeAt(x: number, y: number, z: number, faceX: number, faceZ: number): void;

  /** FPS passes (0,0)=center; TD passes live cursor NDC for click-place. */
  pickRay(ndcX: number, ndcY: number, out: THREE.Raycaster): void;
  groundPoint(ndcX: number, ndcY: number, planeY: number, out: THREE.Vector3): boolean;

  /** ArenaSystem feeds colliders so the 3rd-person boom can raycast (FPS ignores). */
  setColliders(objs: THREE.Object3D[]): void;
  setFov(deg: number): void;
  zoom(factor: number): void;

  requestCapture(): void | Promise<void>;
  releaseCapture(silent?: boolean): void; // safe no-op if not captured
  on(ev: RigCaptureEvent, fn: () => void): void;
  off(ev: RigCaptureEvent, fn: () => void): void;

  /** End-of-frame: AFTER body movement + collision, BEFORE render. 3rd-person follow-lerp + boom. */
  update(delta: number): void;
  resize(aspect: number): void;
  dispose(): void;
}

export type RigCaptureEvent = "capture" | "release";

/** Builds a {@link CameraRig} around a caller-owned render camera + capture surface. */
export type CameraRigPreset = (camera: THREE.PerspectiveCamera, domElement: HTMLElement) => CameraRig;
type PointerLockControlsWithErrorHandler = PointerLockControls & { _onPointerlockError?: EventListener };

// Shared scratch — single instances, never escape a synchronous call.
const _ndc = new THREE.Vector2();
const _groundRay = new THREE.Raycaster();
const _plane = new THREE.Plane();

/**
 * First-person rig: the player body *is* the render camera. Wraps three's
 * {@link PointerLockControls} for mouse-look + pointer capture, so this file is
 * the ONLY place the engine imports `PointerLockControls` — every other system
 * speaks {@link CameraRig}. Behaviourally identical to driving the controls
 * directly: `movePlanar` is just `moveRight`+`moveForward`.
 */
class FirstPersonRig implements CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  private readonly domElement: HTMLElement;
  private readonly controls: PointerLockControls;
  private readonly _euler = new THREE.Euler(0, 0, 0, "YXZ");
  private readonly _captureFns = new Set<() => void>();
  private readonly _releaseFns = new Set<() => void>();
  private _suppressNextRelease = false;

  constructor(camera: THREE.PerspectiveCamera, domElement: HTMLElement) {
    this.camera = camera;
    this.domElement = domElement;
    this.controls = new PointerLockControls(camera, domElement);
    const controls = this.controls as PointerLockControlsWithErrorHandler;
    if (controls._onPointerlockError) {
      this.domElement.ownerDocument.removeEventListener("pointerlockerror", controls._onPointerlockError);
    }
    this.controls.addEventListener("lock", this._onLock);
    this.controls.addEventListener("unlock", this._onUnlock);
  }

  // FPS: the body, the held-item mount, and the render camera are one object.
  get body(): THREE.Object3D {
    return this.camera;
  }
  get attach(): THREE.Object3D {
    return this.camera;
  }
  get facing(): THREE.Quaternion {
    return this.camera.quaternion;
  }
  get yaw(): number {
    this._euler.setFromQuaternion(this.camera.quaternion, "YXZ");
    return this._euler.y;
  }
  get pitch(): number {
    this._euler.setFromQuaternion(this.camera.quaternion, "YXZ");
    return this._euler.x;
  }
  get captured(): boolean {
    return this.controls.isLocked;
  }

  movePlanar(dx: number, dz: number): void {
    this.controls.moveRight(dx);
    this.controls.moveForward(dz);
  }

  placeAt(x: number, y: number, z: number, faceX: number, faceZ: number): void {
    this.camera.position.set(x, y, z);
    this.camera.rotation.set(0, 0, 0);
    // Horizontal look (same y) → zero pitch/roll, just a yaw toward (faceX,faceZ).
    this.camera.lookAt(x + faceX, y, z + faceZ);
  }

  pickRay(ndcX: number, ndcY: number, out: THREE.Raycaster): void {
    this.camera.updateMatrixWorld();
    out.setFromCamera(_ndc.set(ndcX, ndcY), this.camera);
  }

  groundPoint(ndcX: number, ndcY: number, planeY: number, out: THREE.Vector3): boolean {
    this.camera.updateMatrixWorld();
    _groundRay.setFromCamera(_ndc.set(ndcX, ndcY), this.camera);
    _plane.setComponents(0, 1, 0, -planeY); // horizontal plane at y = planeY
    return _groundRay.ray.intersectPlane(_plane, out) !== null;
  }

  setColliders(_objs: THREE.Object3D[]): void {
    // FPS has no third-person boom to collide; nothing to track.
  }

  setFov(deg: number): void {
    this.camera.fov = deg;
    this.camera.updateProjectionMatrix();
  }

  zoom(factor: number): void {
    this.camera.zoom = Math.max(0.01, this.camera.zoom * factor);
    this.camera.updateProjectionMatrix();
  }

  requestCapture(): void | Promise<void> {
    try {
      // Return the lock promise so callers that retry (e.g. the FPS pointer-lock
      // rig) can react to async rejection; guard the synchronous throw that
      // requestPointerLock can raise outside a user activation.
      return this.domElement.requestPointerLock();
    } catch {
      // Capture is best-effort; the game can keep showing its re-enter prompt.
    }
  }

  releaseCapture(silent = false): void {
    if (!this.controls.isLocked) return;
    if (silent) this._suppressNextRelease = true;
    this.controls.unlock();
  }

  on(ev: RigCaptureEvent, fn: () => void): void {
    (ev === "capture" ? this._captureFns : this._releaseFns).add(fn);
  }

  off(ev: RigCaptureEvent, fn: () => void): void {
    (ev === "capture" ? this._captureFns : this._releaseFns).delete(fn);
  }

  update(_delta: number): void {
    // FPS: the camera IS the body — no follow-lerp or boom to advance.
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.controls.removeEventListener("lock", this._onLock);
    this.controls.removeEventListener("unlock", this._onUnlock);
    if (this.controls.isLocked) this.controls.unlock();
    this.controls.dispose();
    this._captureFns.clear();
    this._releaseFns.clear();
  }

  private _onLock = (): void => {
    for (const fn of this._captureFns) fn();
  };

  private _onUnlock = (): void => {
    // pointerlockchange fires async, so a sync `silent` flag set in
    // releaseCapture persists until the event lands here.
    if (this._suppressNextRelease) {
      this._suppressNextRelease = false;
      return;
    }
    for (const fn of this._releaseFns) fn();
  };
}

/**
 * The first-person preset: mouse-look pointer-lock rig where `body===camera`.
 * This is the rig Scourge Survivors (and any embodied-shooter) binds.
 */
export const firstPersonPointerLock: CameraRigPreset = (camera, domElement) => new FirstPersonRig(camera, domElement);

/**
 * Config for the third-person orbit-follow preset.
 *
 * The generic third-person preset follows `body` from behind its `facing`
 * heading. Games own input policy; this rig owns the body/camera separation,
 * cursor ray helpers, FOV/zoom, and boom collision.
 */
export interface ThirdPersonFollowConfig {
  distance: number;
  height: number;
  followLerp: number;
  minDistance: number;
}

class ThirdPersonRig implements CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  readonly body = new THREE.Object3D();
  readonly attach = new THREE.Object3D();
  private readonly config: ThirdPersonFollowConfig;
  private readonly _facing = new THREE.Quaternion();
  private readonly _euler = new THREE.Euler(0, 0, 0, "YXZ");
  private readonly _right = new THREE.Vector3();
  private readonly _forward = new THREE.Vector3();
  private readonly _target = new THREE.Vector3();
  private readonly _desired = new THREE.Vector3();
  private readonly _boomDir = new THREE.Vector3();
  private readonly _boomRay = new THREE.Raycaster();
  private readonly _captureFns = new Set<() => void>();
  private readonly _releaseFns = new Set<() => void>();
  private colliders: THREE.Object3D[] = [];
  private isCaptured = false;

  constructor(camera: THREE.PerspectiveCamera, _domElement: HTMLElement, config: ThirdPersonFollowConfig) {
    this.camera = camera;
    this.config = normalizeThirdPersonConfig(config);
    this.attach.position.y = Math.max(0.1, this.config.height * 0.72);
    this.body.add(this.attach);
    this.placeAt(0, 0, 0, 0, -1);
  }

  get facing(): THREE.Quaternion {
    return this._facing;
  }

  get yaw(): number {
    this._euler.setFromQuaternion(this._facing, "YXZ");
    return this._euler.y;
  }

  get pitch(): number {
    return 0;
  }

  get captured(): boolean {
    return this.isCaptured;
  }

  movePlanar(dx: number, dz: number): void {
    this._right.set(1, 0, 0).applyQuaternion(this._facing);
    this._right.y = 0;
    if (this._right.lengthSq() > 0.0001) this._right.normalize();

    this._forward.set(0, 0, -1).applyQuaternion(this._facing);
    this._forward.y = 0;
    if (this._forward.lengthSq() > 0.0001) this._forward.normalize();
    else this._forward.set(0, 0, -1);

    this.body.position.addScaledVector(this._right, dx);
    this.body.position.addScaledVector(this._forward, dz);
  }

  placeAt(x: number, y: number, z: number, faceX: number, faceZ: number): void {
    this.body.position.set(x, y, z);
    const yaw = faceX === 0 && faceZ === 0 ? 0 : Math.atan2(-faceX, -faceZ);
    this._facing.setFromAxisAngle(this.body.up, yaw);
    this.body.quaternion.copy(this._facing);
    this.snapCamera();
  }

  pickRay(ndcX: number, ndcY: number, out: THREE.Raycaster): void {
    this.camera.updateMatrixWorld();
    out.setFromCamera(_ndc.set(ndcX, ndcY), this.camera);
  }

  groundPoint(ndcX: number, ndcY: number, planeY: number, out: THREE.Vector3): boolean {
    this.camera.updateMatrixWorld();
    _groundRay.setFromCamera(_ndc.set(ndcX, ndcY), this.camera);
    _plane.setComponents(0, 1, 0, -planeY);
    return _groundRay.ray.intersectPlane(_plane, out) !== null;
  }

  setColliders(objs: THREE.Object3D[]): void {
    this.colliders = objs;
  }

  setFov(deg: number): void {
    this.camera.fov = deg;
    this.camera.updateProjectionMatrix();
  }

  zoom(factor: number): void {
    this.camera.zoom = Math.max(0.01, this.camera.zoom * factor);
    this.camera.updateProjectionMatrix();
  }

  requestCapture(): void {
    if (this.isCaptured) return;
    this.isCaptured = true;
    for (const fn of this._captureFns) fn();
  }

  releaseCapture(silent = false): void {
    if (!this.isCaptured) return;
    this.isCaptured = false;
    if (silent) return;
    for (const fn of this._releaseFns) fn();
  }

  on(ev: RigCaptureEvent, fn: () => void): void {
    (ev === "capture" ? this._captureFns : this._releaseFns).add(fn);
  }

  off(ev: RigCaptureEvent, fn: () => void): void {
    (ev === "capture" ? this._captureFns : this._releaseFns).delete(fn);
  }

  update(delta: number): void {
    this.computeCameraTarget();
    const t = this.config.followLerp <= 0 ? 1 : 1 - Math.exp(-this.config.followLerp * delta);
    this.camera.position.lerp(this._desired, Math.max(0, Math.min(1, t)));
    this.camera.lookAt(this._target);
    this.camera.updateMatrixWorld();
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.releaseCapture(true);
    this._captureFns.clear();
    this._releaseFns.clear();
    this.colliders = [];
  }

  private snapCamera(): void {
    this.computeCameraTarget();
    this.camera.position.copy(this._desired);
    this.camera.lookAt(this._target);
    this.camera.updateMatrixWorld();
  }

  private computeCameraTarget(): void {
    this._target.copy(this.body.position);
    this._target.y += this.config.height;

    this._forward.set(0, 0, -1).applyQuaternion(this._facing);
    this._forward.y = 0;
    if (this._forward.lengthSq() > 0.0001) this._forward.normalize();
    else this._forward.set(0, 0, -1);

    this._desired.copy(this._target).addScaledVector(this._forward, -this.config.distance);
    this._boomDir.copy(this._desired).sub(this._target);
    const desiredDistance = this._boomDir.length();
    if (desiredDistance <= 0.0001) return;
    this._boomDir.multiplyScalar(1 / desiredDistance);

    if (!this.colliders.length) return;
    this._boomRay.set(this._target, this._boomDir);
    this._boomRay.far = desiredDistance;
    const hit = this._boomRay
      .intersectObjects(this.colliders, true)
      .find((candidate) => candidate.distance > this.config.minDistance);
    if (!hit) return;
    const distance = Math.max(this.config.minDistance, hit.distance - 0.25);
    this._desired.copy(this._target).addScaledVector(this._boomDir, distance);
  }
}

function normalizeThirdPersonConfig(config: ThirdPersonFollowConfig): ThirdPersonFollowConfig {
  return {
    distance: Math.max(0.01, config.distance),
    height: Math.max(0, config.height),
    followLerp: Math.max(0, config.followLerp),
    minDistance: Math.max(0.01, Math.min(config.minDistance, config.distance)),
  };
}

export function thirdPersonFollow(config: ThirdPersonFollowConfig): CameraRigPreset {
  return (camera, domElement) => new ThirdPersonRig(camera, domElement, config);
}
