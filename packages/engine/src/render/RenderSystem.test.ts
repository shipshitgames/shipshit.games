import { expect, test } from 'bun:test'
import * as THREE from 'three'

import { RenderSystem, type RendererLike } from './RenderSystem'
import type { ArenaMap } from '../world/map'

function fakeRenderer() {
  const calls = {
    clearColor: [] as THREE.ColorRepresentation[],
    size: [] as Array<[number, number]>,
    rendered: 0,
    disposed: 0,
    domRemoved: 0,
  }
  const domElement = { remove: () => void calls.domRemoved++ } as unknown as HTMLElement
  const renderer: RendererLike = {
    domElement,
    setPixelRatio: () => {},
    setSize: (w, h) => void calls.size.push([w, h]),
    setClearColor: (color) => void calls.clearColor.push(color),
    render: () => void calls.rendered++,
    dispose: () => void calls.disposed++,
  }
  return { renderer, calls, domElement }
}

function fakeContainer(domElement: HTMLElement) {
  const children = new Set<unknown>()
  return {
    clientWidth: 800,
    clientHeight: 600,
    contains: (node: unknown) => children.has(node),
    appendChild: (node: unknown) => {
      children.add(node)
      return node
    },
    _children: children,
    _domElement: domElement,
  } as unknown as HTMLElement
}

const arena: ArenaMap = {
  id: 'arena',
  bounds: { kind: 'square', half: 10 },
  theme: {
    id: 'doom',
    skyColor: '#0a0a0a',
    groundColor: '#34343c',
    fog: { kind: 'linear', color: '#0a0a0a', near: 2, far: 80 },
  },
  lights: [
    { kind: 'ambient', id: 'amb', color: '#ffffff', intensity: 0.4 },
    { kind: 'directional', id: 'sun', color: '#ff6a00', intensity: 1, position: [5, 10, 5], target: [0, 0, 0] },
  ],
}

test('applies clearColor to an injected renderer', () => {
  const { renderer, calls } = fakeRenderer()
  new RenderSystem({ camera: new THREE.PerspectiveCamera(), renderer, clearColor: '#123456' })
  expect(calls.clearColor).toEqual(['#123456'])
})

test('applies clearColor to a factory-created renderer when first used', () => {
  const { renderer, calls } = fakeRenderer()
  const system = new RenderSystem({
    camera: new THREE.PerspectiveCamera(),
    rendererFactory: () => renderer,
    clearColor: '#abcdef',
  })
  expect(calls.clearColor).toEqual([]) // factory not invoked yet
  system.render()
  expect(calls.clearColor).toEqual(['#abcdef'])
  expect(calls.rendered).toBe(1)
})

test('resize sets renderer size and updates camera aspect', () => {
  const { renderer, calls } = fakeRenderer()
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100)
  const system = new RenderSystem({ camera, renderer })
  system.resize(1600, 800)
  expect(calls.size.at(-1)).toEqual([1600, 800])
  expect(camera.aspect).toBeCloseTo(2)
})

test('applyArenaMap sets background, fog, lights, and exposes the theme', () => {
  const { renderer } = fakeRenderer()
  const system = new RenderSystem({ camera: new THREE.PerspectiveCamera(), renderer, map: arena })
  expect(system.scene.background).toBeInstanceOf(THREE.Color)
  expect(system.scene.fog).toBeInstanceOf(THREE.Fog)
  // ambient + directional (+ directional target) added
  expect(system.scene.children.some((c) => c instanceof THREE.AmbientLight)).toBe(true)
  expect(system.scene.children.some((c) => c instanceof THREE.DirectionalLight)).toBe(true)
  // groundColor is now consumable via the active theme
  expect(system.activeTheme?.groundColor).toBe('#34343c')
})

test('re-applying a map clears previously managed lights', () => {
  const { renderer } = fakeRenderer()
  const system = new RenderSystem({ camera: new THREE.PerspectiveCamera(), renderer, map: arena })
  const lightsAfterFirst = system.scene.children.filter(
    (c) => c instanceof THREE.Light || c instanceof THREE.Object3D,
  ).length
  system.applyArenaMap({ id: 'empty', bounds: arena.bounds })
  expect(system.scene.children.some((c) => c instanceof THREE.AmbientLight)).toBe(false)
  expect(system.scene.children.some((c) => c instanceof THREE.DirectionalLight)).toBe(false)
  expect(system.scene.fog).toBeNull()
  expect(lightsAfterFirst).toBeGreaterThan(0)
})

test('mount appends the renderer dom element and dispose tears it down', () => {
  const { renderer, calls, domElement } = fakeRenderer()
  const container = fakeContainer(domElement)
  const system = new RenderSystem({ camera: new THREE.PerspectiveCamera(), renderer })
  system.mount(container)
  expect(system.domElement).toBe(domElement)
  expect(calls.size.length).toBeGreaterThan(0)
  system.render()
  expect(calls.rendered).toBe(1)
  system.dispose()
  expect(calls.disposed).toBe(1)
  expect(calls.domRemoved).toBe(1)
})
