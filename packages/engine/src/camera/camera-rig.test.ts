import { thirdPersonFollow } from "../index";
import * as THREE from "three";
import { describe, expect, it } from "bun:test";

const domElement = {} as HTMLElement;

describe("CameraRig third-person follow preset", () => {
  it("keeps the player body separate from the render camera", () => {
    const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 100);
    const rig = thirdPersonFollow({ distance: 10, height: 3, followLerp: 100, minDistance: 2 })(camera, domElement);

    rig.placeAt(1, 2, 3, 0, -1);
    rig.movePlanar(2, 5);
    rig.update(1 / 60);

    expect(rig.body).not.toBe(camera);
    expect(rig.attach).not.toBe(camera);
    expect(rig.body.position.x).toBeCloseTo(3);
    expect(rig.body.position.y).toBeCloseTo(2);
    expect(rig.body.position.z).toBeCloseTo(-2);
    expect(camera.position.z).toBeGreaterThan(rig.body.position.z);

    rig.setFov(42);
    expect(camera.fov).toBe(42);

    rig.zoom(0.5);
    expect(camera.zoom).toBeCloseTo(0.5);
  });

  it("shortens the follow boom against supplied colliders", () => {
    const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 100);
    const rig = thirdPersonFollow({ distance: 10, height: 3, followLerp: 100, minDistance: 2 })(camera, domElement);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    wall.position.set(0, 3, 5);
    wall.updateMatrixWorld(true);

    rig.placeAt(0, 0, 0, 0, -1);
    rig.setColliders([wall]);
    rig.update(1);

    expect(camera.position.z).toBeGreaterThanOrEqual(2);
    expect(camera.position.z).toBeLessThan(5);
  });

  it("updates camera matrices before emitting pick rays", () => {
    const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 100);
    const rig = thirdPersonFollow({ distance: 10, height: 3, followLerp: 0, minDistance: 2 })(camera, domElement);
    const raycaster = new THREE.Raycaster();

    rig.placeAt(0, 0, 0, 0, -1);
    rig.movePlanar(4, 0);
    rig.update(1 / 60);
    rig.pickRay(0, 0, raycaster);

    expect(raycaster.ray.origin.x).toBeCloseTo(camera.position.x);
    expect(raycaster.ray.origin.y).toBeCloseTo(camera.position.y);
    expect(raycaster.ray.origin.z).toBeCloseTo(camera.position.z);
  });

  it("emits capture lifecycle events without pointer-lock controls", () => {
    const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 100);
    const rig = thirdPersonFollow({ distance: 8, height: 3, followLerp: 12, minDistance: 2 })(camera, domElement);
    let captures = 0;
    let releases = 0;

    rig.on("capture", () => captures++);
    rig.on("release", () => releases++);
    rig.requestCapture();
    rig.releaseCapture();
    rig.requestCapture();
    rig.releaseCapture(true);

    expect(captures).toBe(2);
    expect(releases).toBe(1);
    expect(rig.captured).toBe(false);
  });
});
