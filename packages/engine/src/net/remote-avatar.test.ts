import { expect, test } from 'bun:test'
import * as THREE from 'three'
import type { RemotePlayerInfo } from './protocol'
import {
  RemoteAvatar,
  type RemoteAvatarFrame,
  type RemoteAvatarMeta,
  type RemoteAvatarOptions,
  type RemoteAvatarSkin,
} from './RemoteAvatar'

const makeInfo = (overrides: Partial<RemotePlayerInfo> = {}): RemotePlayerInfo => ({
  id: 'p1',
  name: 'Echo',
  avatar: 'scout',
  slot: 2,
  x: 1,
  y: 1.8,
  z: -4,
  yaw: 0.5,
  weapon: '',
  health: 80,
  kills: 3,
  ...overrides,
})

class RecordingSkin implements RemoteAvatarSkin {
  hitMeshes: THREE.Mesh[]
  healthCalls: Array<{ health: number; maxHealth: number }> = []
  metaCalls: RemoteAvatarMeta[] = []
  frames: RemoteAvatarFrame[] = []
  disposed = 0

  constructor(hitMeshes: THREE.Mesh[] = []) {
    this.hitMeshes = hitMeshes
  }

  onHealth(health: number, maxHealth: number): void {
    this.healthCalls.push({ health, maxHealth })
  }

  onMeta(meta: RemoteAvatarMeta): void {
    this.metaCalls.push(meta)
  }

  update(frame: RemoteAvatarFrame): void {
    this.frames.push({ ...frame })
  }

  dispose(): void {
    this.disposed += 1
  }
}

const makeAvatar = (
  info: RemotePlayerInfo,
  skin: RemoteAvatarSkin,
  options: Omit<RemoteAvatarOptions, 'skin'> = {},
): RemoteAvatar => new RemoteAvatar(info, { ...options, skin: () => skin })

const quat = new THREE.Quaternion()
const camPos = new THREE.Vector3()

test('constructor applies yOffset and yaw, wires billboard and hit meshes, fires initial skin callbacks', () => {
  const bodyHit = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial())
  bodyHit.userData = { part: 'body' }
  const headHit = new THREE.Mesh(new THREE.SphereGeometry(0.3), new THREE.MeshBasicMaterial())
  headHit.userData = { part: 'head' }
  const skin = new RecordingSkin([bodyHit, headHit])

  let factoryInfo: RemotePlayerInfo | undefined
  let factoryAvatar: RemoteAvatar | undefined
  const info = makeInfo()
  const avatar = new RemoteAvatar(info, {
    yOffset: -1.8,
    skin: (i, a) => {
      factoryInfo = i
      factoryAvatar = a
      return skin
    },
  })

  expect(factoryInfo).toBe(info)
  expect(factoryAvatar).toBe(avatar)

  expect(avatar.group.position.x).toBeCloseTo(1, 10)
  expect(avatar.group.position.y).toBeCloseTo(0, 10)
  expect(avatar.group.position.z).toBeCloseTo(-4, 10)
  expect(avatar.group.rotation.y).toBeCloseTo(0.5, 10)

  expect(avatar.billboard.parent).toBe(avatar.group)
  expect(bodyHit.parent).toBe(avatar.group)
  expect(headHit.parent).toBe(avatar.group)
  expect(avatar.hitMeshes).toEqual([bodyHit, headHit])

  expect(bodyHit.userData.remoteId).toBe('p1')
  expect(bodyHit.userData.part).toBe('body')
  expect(headHit.userData.remoteId).toBe('p1')
  expect(headHit.userData.part).toBe('head')

  expect(avatar.id).toBe('p1')
  expect(avatar.name).toBe('Echo')
  expect(avatar.kills).toBe(3)
  expect(avatar.health).toBe(80)
  expect(avatar.avatar).toBe('scout')
  expect(avatar.slot).toBe(2)

  expect(skin.metaCalls).toEqual([{ name: 'Echo', kills: 3, avatar: 'scout', slot: 2 }])
  expect(skin.healthCalls).toEqual([{ health: 80, maxHealth: 100 }])
})

test('setTarget applies yOffset to wire y', () => {
  const skin = new RecordingSkin()
  const avatar = makeAvatar(makeInfo({ x: 0, y: 1.8, z: 0, yaw: 0 }), skin, { yOffset: -1.8 })

  avatar.setTarget(5, 1.8, 7, 0)
  for (let i = 0; i < 600; i++) avatar.update(0.016, quat, camPos)

  expect(avatar.group.position.x).toBeCloseTo(5, 4)
  expect(avatar.group.position.y).toBeCloseTo(0, 4)
  expect(avatar.group.position.z).toBeCloseTo(7, 4)
})

test('update covers 99.9% of the gap in one second with default smoothing', () => {
  const skin = new RecordingSkin()
  const avatar = makeAvatar(makeInfo({ x: 0, y: 0, z: 0, yaw: 0 }), skin)

  avatar.setTarget(10, 0, 0, 0)
  avatar.update(1.0, quat, camPos)

  expect(avatar.group.position.x).toBeCloseTo(9.99, 10)
})

test('repeated small updates converge onto the target', () => {
  const skin = new RecordingSkin()
  const avatar = makeAvatar(makeInfo({ x: 0, y: 0, z: 0, yaw: 0 }), skin)

  avatar.setTarget(10, 2, -6, 0)
  for (let i = 0; i < 400; i++) avatar.update(0.016, quat, camPos)

  expect(avatar.group.position.distanceTo(new THREE.Vector3(10, 2, -6))).toBeLessThan(1e-6)
})

test('yaw interpolates across the +/-PI boundary via the short arc', () => {
  const skin = new RecordingSkin()
  const avatar = makeAvatar(makeInfo({ x: 0, y: 0, z: 0, yaw: 3.0 }), skin)

  avatar.setTarget(0, 0, 0, -3.0)
  avatar.update(1.0, quat, camPos)

  // Short arc from 3.0 to -3.0 passes through PI: dy = 2*PI - 6 > 0, so the
  // rotation increases past 3.0 instead of sweeping back through 0.
  const expected = 3.0 + (Math.PI * 2 - 6) * 0.999
  expect(avatar.group.rotation.y).toBeGreaterThan(3.0)
  expect(avatar.group.rotation.y).toBeCloseTo(expected, 10)
})

test('moving flag is false at rest and true right after a far setTarget', () => {
  const skin = new RecordingSkin()
  const avatar = makeAvatar(makeInfo({ x: 0, y: 0, z: 0, yaw: 0 }), skin)

  avatar.update(0.016, quat, camPos)
  expect(skin.frames[0]?.moving).toBe(false)

  avatar.setTarget(10, 0, 10, 0)
  avatar.update(0.016, quat, camPos)
  expect(skin.frames[1]?.moving).toBe(true)

  for (let i = 0; i < 600; i++) avatar.update(0.016, quat, camPos)
  avatar.update(0.016, quat, camPos)
  expect(skin.frames[skin.frames.length - 1]?.moving).toBe(false)
})

test('elapsed is the running sum of update deltas, no wall clock', () => {
  const skin = new RecordingSkin()
  const avatar = makeAvatar(makeInfo(), skin)

  avatar.update(0.016, quat, camPos)
  avatar.update(0.016, quat, camPos)
  avatar.update(0.5, quat, camPos)
  avatar.update(0.25, quat, camPos)

  const elapsed = skin.frames.map((f) => f.elapsed)
  expect(elapsed[0]).toBeCloseTo(0.016, 10)
  expect(elapsed[1]).toBeCloseTo(0.032, 10)
  expect(elapsed[2]).toBeCloseTo(0.532, 10)
  expect(elapsed[3]).toBeCloseTo(0.782, 10)
})

test('billboard copies the camera quaternion every update', () => {
  const skin = new RecordingSkin()
  const avatar = makeAvatar(makeInfo(), skin)

  const cameraQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, 1.1, -0.2))
  avatar.update(0.016, cameraQuat, camPos)

  expect(avatar.billboard.quaternion.x).toBeCloseTo(cameraQuat.x, 10)
  expect(avatar.billboard.quaternion.y).toBeCloseTo(cameraQuat.y, 10)
  expect(avatar.billboard.quaternion.z).toBeCloseTo(cameraQuat.z, 10)
  expect(avatar.billboard.quaternion.w).toBeCloseTo(cameraQuat.w, 10)
})

test('skin update receives delta, camera quaternion, and camera position', () => {
  const skin = new RecordingSkin()
  const avatar = makeAvatar(makeInfo(), skin)

  const cameraQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.7, 0))
  const cameraPos = new THREE.Vector3(4, 1.8, -2)
  avatar.update(0.033, cameraQuat, cameraPos)

  expect(skin.frames[0]?.delta).toBeCloseTo(0.033, 10)
  expect(skin.frames[0]?.cameraQuat).toBe(cameraQuat)
  expect(skin.frames[0]?.cameraPos).toBe(cameraPos)
})

test('setHealth updates state and forwards (h, maxHealth) with default max', () => {
  const skin = new RecordingSkin()
  const avatar = makeAvatar(makeInfo(), skin)

  avatar.setHealth(42)

  expect(avatar.health).toBe(42)
  expect(skin.healthCalls).toEqual([
    { health: 80, maxHealth: 100 },
    { health: 42, maxHealth: 100 },
  ])
})

test('custom maxHealth is honored in every onHealth call', () => {
  const skin = new RecordingSkin()
  const avatar = makeAvatar(makeInfo({ health: 200 }), skin, { maxHealth: 250 })

  avatar.setHealth(125)

  expect(skin.healthCalls).toEqual([
    { health: 200, maxHealth: 250 },
    { health: 125, maxHealth: 250 },
  ])
})

test('setMeta keeps avatar/slot when omitted and forwards the full meta', () => {
  const skin = new RecordingSkin()
  const avatar = makeAvatar(makeInfo(), skin)

  avatar.setMeta('Nova', 7)

  expect(avatar.name).toBe('Nova')
  expect(avatar.kills).toBe(7)
  expect(avatar.avatar).toBe('scout')
  expect(avatar.slot).toBe(2)
  expect(skin.metaCalls[1]).toEqual({ name: 'Nova', kills: 7, avatar: 'scout', slot: 2 })
})

test('setMeta updates avatar/slot when provided', () => {
  const skin = new RecordingSkin()
  const avatar = makeAvatar(makeInfo(), skin)

  avatar.setMeta('Nova', 8, 'heavy', 4)

  expect(avatar.avatar).toBe('heavy')
  expect(avatar.slot).toBe(4)
  expect(skin.metaCalls[1]).toEqual({ name: 'Nova', kills: 8, avatar: 'heavy', slot: 4 })
})

test('dispose forwards to skin.dispose exactly once', () => {
  const skin = new RecordingSkin()
  const avatar = makeAvatar(makeInfo(), skin)

  avatar.dispose()

  expect(skin.disposed).toBe(1)
})

test('works without a skin: presence-only avatar still interpolates', () => {
  const avatar = new RemoteAvatar(makeInfo({ x: 0, y: 0, z: 0, yaw: 0 }))

  expect(avatar.hitMeshes).toEqual([])
  expect(avatar.billboard.parent).toBe(avatar.group)

  avatar.setTarget(10, 0, 0, 1.0)
  avatar.update(1.0, quat, camPos)
  expect(avatar.group.position.x).toBeCloseTo(9.99, 10)
  expect(avatar.group.rotation.y).toBeCloseTo(0.999, 10)

  avatar.setHealth(50)
  avatar.setMeta('Solo', 1)
  expect(avatar.health).toBe(50)
  expect(avatar.name).toBe('Solo')
  avatar.dispose()
})
