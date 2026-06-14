import { expect, test } from 'bun:test'
import * as THREE from 'three'

import { Billboard } from './Billboard'

test('constructs a cutout-ready plane mesh from a texture', () => {
  const texture = new THREE.Texture()
  const billboard = new Billboard({ texture, size: [2, 3], alphaTest: 0.25 })

  expect(billboard.mesh).toBeInstanceOf(THREE.Mesh)
  expect(billboard.mesh.geometry).toBeInstanceOf(THREE.PlaneGeometry)
  expect(billboard.mesh.geometry.parameters.width).toBe(2)
  expect(billboard.mesh.geometry.parameters.height).toBe(3)
  expect(billboard.mesh.material.map).toBe(texture)
  expect(billboard.mesh.material.transparent).toBe(true)
  expect(billboard.mesh.material.alphaTest).toBe(0.25)
  expect(billboard.mesh.material.side).toBe(THREE.FrontSide)
  expect(billboard.texture).toBe(texture)
})

test('defaults to a unit quad with alphaTest 0.5 and no texture', () => {
  const billboard = new Billboard()
  expect(billboard.mesh.geometry.parameters.width).toBe(1)
  expect(billboard.mesh.geometry.parameters.height).toBe(1)
  expect(billboard.mesh.material.alphaTest).toBe(0.5)
  expect(billboard.texture).toBeNull()
})

test('setTexture swaps the map and flags the material for re-upload', () => {
  const billboard = new Billboard()
  const texture = new THREE.Texture()
  const before = billboard.mesh.material.version
  billboard.setTexture(texture)
  expect(billboard.texture).toBe(texture)
  expect(billboard.mesh.material.version).toBeGreaterThan(before) // needsUpdate bumps the version
})

test('faceCamera (spherical) copies the camera orientation', () => {
  const billboard = new Billboard()
  const camera = new THREE.PerspectiveCamera()
  camera.rotation.set(0.3, 0.5, -0.2)

  billboard.faceCamera(camera)
  expect(billboard.mesh.quaternion.equals(camera.quaternion)).toBe(true)
})

test('faceCamera (yawOnly) turns to the camera on the Y axis only', () => {
  const billboard = new Billboard({ yawOnly: true })
  const camera = new THREE.PerspectiveCamera()

  camera.position.set(0, 10, 5) // pitched above, straight ahead on +Z
  billboard.faceCamera(camera)
  expect(billboard.mesh.rotation.x).toBe(0)
  expect(billboard.mesh.rotation.z).toBe(0)
  expect(billboard.mesh.rotation.y).toBeCloseTo(0)

  camera.position.set(5, 0, 0) // to the right
  billboard.faceCamera(camera)
  expect(billboard.mesh.rotation.y).toBeCloseTo(Math.PI / 2)
})

test('dispose releases geometry and material but not the texture', () => {
  const texture = new THREE.Texture()
  const billboard = new Billboard({ texture })
  let geo = 0
  let mat = 0
  let tex = 0
  billboard.mesh.geometry.dispose = () => void geo++
  billboard.mesh.material.dispose = () => void mat++
  texture.dispose = () => void tex++

  billboard.dispose()
  expect(geo).toBe(1)
  expect(mat).toBe(1)
  expect(tex).toBe(0)
})
