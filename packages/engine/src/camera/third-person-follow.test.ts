import { thirdPersonFollow } from "../index";
import * as THREE from "three";
import { describe, expect, it } from "bun:test";

// CameraRig third-person seam (#87).
//
// thirdPersonFollow is the genre-neutral preset where the player body is a
// distinct Object3D from the render camera. These tests pin the load-bearing
// invariants of that seam: facing math from placeAt, facing-relative movement
// from movePlanar, the synchronous capture lifecycle, and the render-only
// camera contract (body/attach are never the camera).
//
// thirdPersonFollow(config) returns a CameraRigPreset; the preset is called
// with (PerspectiveCamera, HTMLElement). The third-person rig never touches the
// DOM element (PointerLockControls is FPS-only), so a bare object stub stands in.
const domElement = {} as HTMLElement;
const config = { distance: 10, height: 3, followLerp: 100, minDistance: 2 };

function makeRig() {
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 100);
  const rig = thirdPersonFollow(config)(camera, domElement);
  return { camera, rig };
}

describe("thirdPersonFollow — render-only camera contract", () => {
  it("keeps body and attach as their own objects, never the render camera", () => {
    const { camera, rig } = makeRig();

    // The whole point of the seam: player logic reads body/attach, the camera
    // is projection-only. They must be distinct THREE objects.
    expect(rig.body).not.toBe(camera);
    expect(rig.attach).not.toBe(camera);
    expect(rig.body).toBeInstanceOf(THREE.Object3D);
    expect(rig.attach).toBeInstanceOf(THREE.Object3D);
    expect(rig.camera).toBe(camera);
  });

  it("mounts the held-item attach as a child of the body, raised toward head height", () => {
    const { rig } = makeRig();

    // attach is the eye/hand mount parented under the avatar root.
    expect(rig.attach.parent).toBe(rig.body);
    // normalizeThirdPersonConfig raises attach to max(0.1, height * 0.72).
    expect(rig.attach.position.y).toBeCloseTo(config.height * 0.72);
  });

  it("moves the render camera behind the body, not on top of it", () => {
    const { camera, rig } = makeRig();

    rig.placeAt(0, 0, 0, 0, -1); // facing -Z
    rig.update(1 / 60);

    // Facing -Z means the boom sits behind on +Z, away from the body origin.
    expect(camera.position.z).toBeGreaterThan(rig.body.position.z);
    const planarGap = Math.hypot(camera.position.x - rig.body.position.x, camera.position.z - rig.body.position.z);
    expect(planarGap).toBeGreaterThan(config.minDistance);
  });
});

describe("thirdPersonFollow — placeAt facing", () => {
  it("zeroes pitch and faces the requested heading", () => {
    const { rig } = makeRig();

    // Face +X: yaw = atan2(-faceX, -faceZ) = atan2(-1, 0) = -PI/2.
    rig.placeAt(5, 1, -2, 1, 0);

    expect(rig.body.position.x).toBeCloseTo(5);
    expect(rig.body.position.y).toBeCloseTo(1);
    expect(rig.body.position.z).toBeCloseTo(-2);
    expect(rig.pitch).toBe(0); // third-person body never pitches
    expect(rig.yaw).toBeCloseTo(-Math.PI / 2);

    // facing should rotate the canonical -Z forward onto +X.
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(rig.facing);
    expect(forward.x).toBeCloseTo(1);
    expect(forward.z).toBeCloseTo(0);
  });

  it("treats a zero facing vector as zero yaw rather than NaN", () => {
    const { rig } = makeRig();

    rig.placeAt(0, 0, 0, 0, 0);

    // atan2(0,0) is guarded to 0 yaw — no NaN leaking into the quaternion.
    expect(rig.yaw).toBe(0);
    expect(Number.isNaN(rig.facing.x)).toBe(false);
    expect(Number.isNaN(rig.facing.w)).toBe(false);
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(rig.facing);
    expect(forward.z).toBeCloseTo(-1);
  });

  it("keeps body.quaternion in sync with facing", () => {
    const { rig } = makeRig();

    rig.placeAt(0, 0, 0, 0, 1); // face +Z → yaw = atan2(0,-1) = PI

    // body world heading must match the facing quaternion the world sees.
    expect(rig.body.quaternion.x).toBeCloseTo(rig.facing.x);
    expect(rig.body.quaternion.y).toBeCloseTo(rig.facing.y);
    expect(rig.body.quaternion.z).toBeCloseTo(rig.facing.z);
    expect(rig.body.quaternion.w).toBeCloseTo(rig.facing.w);
  });
});

describe("thirdPersonFollow — movePlanar facing-relative axes", () => {
  it("moves the body forward along its facing heading", () => {
    const { rig } = makeRig();

    rig.placeAt(0, 0, 0, 0, -1); // facing -Z
    rig.movePlanar(0, 3); // dz = forward

    // Forward is -Z; a positive dz pushes the body toward -Z.
    expect(rig.body.position.x).toBeCloseTo(0);
    expect(rig.body.position.z).toBeCloseTo(-3);
  });

  it("moves the body sideways along its facing-relative right axis", () => {
    const { rig } = makeRig();

    rig.placeAt(0, 0, 0, 0, -1); // facing -Z → right is +X
    rig.movePlanar(4, 0); // dx = strafe right

    expect(rig.body.position.x).toBeCloseTo(4);
    expect(rig.body.position.z).toBeCloseTo(0);
  });

  it("rotates the movement basis when facing changes", () => {
    const { rig } = makeRig();

    // Face +X; forward becomes +X, right becomes +Z.
    rig.placeAt(0, 0, 0, 1, 0);
    rig.movePlanar(0, 5); // forward 5 along +X

    expect(rig.body.position.x).toBeCloseTo(5);
    expect(rig.body.position.z).toBeCloseTo(0);

    rig.movePlanar(2, 0); // strafe right 2 → +Z when facing +X
    expect(rig.body.position.x).toBeCloseTo(5);
    expect(rig.body.position.z).toBeCloseTo(2);
  });

  it("keeps movement planar — never changes body height", () => {
    const { rig } = makeRig();

    rig.placeAt(0, 7, 0, 0, -1);
    rig.movePlanar(3, 3);

    // movePlanar zeroes the y of both basis vectors; height is untouched.
    expect(rig.body.position.y).toBeCloseTo(7);
  });

  it("accumulates successive deltas (caller integrates velocity*dt)", () => {
    const { rig } = makeRig();

    rig.placeAt(0, 0, 0, 0, -1);
    rig.movePlanar(0, 1);
    rig.movePlanar(0, 1);
    rig.movePlanar(0, 1);

    expect(rig.body.position.z).toBeCloseTo(-3);
  });
});

describe("thirdPersonFollow — capture lifecycle", () => {
  it("flips captured state and fires listeners synchronously", () => {
    const { rig } = makeRig();
    let captures = 0;
    let releases = 0;
    rig.on("capture", () => captures++);
    rig.on("release", () => releases++);

    expect(rig.captured).toBe(false);
    rig.requestCapture();
    expect(rig.captured).toBe(true);
    expect(captures).toBe(1);

    rig.releaseCapture();
    expect(rig.captured).toBe(false);
    expect(releases).toBe(1);
  });

  it("is idempotent: repeat capture/release do not double-fire", () => {
    const { rig } = makeRig();
    let captures = 0;
    let releases = 0;
    rig.on("capture", () => captures++);
    rig.on("release", () => releases++);

    rig.requestCapture();
    rig.requestCapture(); // already captured — no second event
    expect(captures).toBe(1);

    rig.releaseCapture();
    rig.releaseCapture(); // already released — no second event
    expect(releases).toBe(1);
  });

  it("suppresses the release event when released silently", () => {
    const { rig } = makeRig();
    let releases = 0;
    rig.on("release", () => releases++);

    rig.requestCapture();
    rig.releaseCapture(true); // silent

    expect(rig.captured).toBe(false);
    expect(releases).toBe(0);
  });

  it("stops invoking a listener after off()", () => {
    const { rig } = makeRig();
    let captures = 0;
    const onCapture = () => captures++;

    rig.on("capture", onCapture);
    rig.requestCapture();
    expect(captures).toBe(1);

    rig.releaseCapture();
    rig.off("capture", onCapture);
    rig.requestCapture(); // listener removed — count must stay put
    expect(captures).toBe(1);
    expect(rig.captured).toBe(true);
  });

  it("clears capture state and listeners on dispose", () => {
    const { rig } = makeRig();
    let releases = 0;
    rig.on("release", () => releases++);

    rig.requestCapture();
    expect(rig.captured).toBe(true);

    rig.dispose(); // releases silently and drops listeners

    expect(rig.captured).toBe(false);
    expect(releases).toBe(0);
  });
});
