import * as THREE from 'three'

import type { ArenaMap, ColorToken, MapLight, MapTheme } from '../world/map'

export interface RendererLike {
  domElement: HTMLElement
  setPixelRatio?(ratio: number): void
  setSize(width: number, height: number, updateStyle?: boolean): void
  setClearColor?(color: THREE.ColorRepresentation, alpha?: number): void
  render(scene: THREE.Scene, camera: THREE.Camera): void
  dispose?(): void
}

export interface RenderSystemConfig<TCamera extends THREE.Camera = THREE.Camera> {
  camera: TCamera
  scene?: THREE.Scene
  renderer?: RendererLike
  rendererFactory?: () => RendererLike
  container?: HTMLElement
  map?: ArenaMap
  pixelRatio?: number
  clearColor?: THREE.ColorRepresentation
}

/**
 * Renderer/scene seam. Games can bring their own camera, meshes, and renderer;
 * the engine owns mounting, resizing, render dispatch, and data-driven map
 * lighting/theme application.
 */
export class RenderSystem<TCamera extends THREE.Camera = THREE.Camera> {
  readonly scene: THREE.Scene
  readonly camera: TCamera

  private renderer?: RendererLike
  private container?: HTMLElement
  private currentTheme?: MapTheme
  private readonly managedLights: THREE.Object3D[] = []

  constructor(private readonly config: RenderSystemConfig<TCamera>) {
    this.scene = config.scene ?? new THREE.Scene()
    this.camera = config.camera
    this.renderer = config.renderer
    // Apply clear color to an injected renderer too (not just the default one).
    if (this.renderer) this.applyClearColor()
    if (config.map) this.applyArenaMap(config.map)
    if (config.container) this.mount(config.container)
  }

  get domElement(): HTMLElement | undefined {
    return this.renderer?.domElement
  }

  /** The most recently applied map theme (skyColor, groundColor, fog), for games that own the floor. */
  get activeTheme(): MapTheme | undefined {
    return this.currentTheme
  }

  mount(container: HTMLElement): void {
    this.container = container
    const renderer = this.ensureRenderer()
    if (!container.contains(renderer.domElement)) container.appendChild(renderer.domElement)
    this.resize(container.clientWidth, container.clientHeight)
  }

  resize(width?: number, height?: number): void {
    const targetWidth = width ?? this.container?.clientWidth ?? 1
    const targetHeight = height ?? this.container?.clientHeight ?? 1
    const renderer = this.ensureRenderer()
    renderer.setPixelRatio?.(this.config.pixelRatio ?? globalThis.devicePixelRatio ?? 1)
    renderer.setSize(Math.max(1, targetWidth), Math.max(1, targetHeight), false)

    const projectionCamera = this.camera as THREE.Camera & {
      aspect?: number
      updateProjectionMatrix?: () => void
    }
    if (typeof projectionCamera.aspect === 'number') {
      projectionCamera.aspect = Math.max(1, targetWidth) / Math.max(1, targetHeight)
    }
    projectionCamera.updateProjectionMatrix?.()
  }

  render(): void {
    this.ensureRenderer().render(this.scene, this.camera)
  }

  applyArenaMap(map: ArenaMap): void {
    for (const light of this.managedLights) light.removeFromParent()
    this.managedLights.length = 0

    this.currentTheme = map.theme
    if (map.theme?.skyColor !== undefined) this.scene.background = toColor(map.theme.skyColor)
    if (map.theme?.fog) {
      const fog = map.theme.fog
      this.scene.fog =
        fog.kind === 'exponential'
          ? new THREE.FogExp2(fog.color, fog.density ?? 0.02)
          : new THREE.Fog(fog.color, fog.near ?? 1, fog.far ?? 120)
    } else {
      this.scene.fog = null
    }

    for (const lightSpec of map.lights ?? []) {
      const light = makeLight(lightSpec)
      this.managedLights.push(light)
      this.scene.add(light)
      if (lightSpec.target && light instanceof THREE.DirectionalLight) {
        light.target.position.set(...lightSpec.target)
        this.scene.add(light.target)
        this.managedLights.push(light.target)
      }
    }
  }

  dispose(): void {
    this.renderer?.domElement.remove()
    this.renderer?.dispose?.()
    this.renderer = undefined
    this.container = undefined
  }

  private ensureRenderer(): RendererLike {
    if (this.renderer) return this.renderer
    if (this.config.rendererFactory) {
      this.renderer = this.config.rendererFactory()
    } else if (typeof document !== 'undefined') {
      this.renderer = new THREE.WebGLRenderer({ antialias: true })
    } else {
      throw new Error('RenderSystem requires a renderer or rendererFactory outside the browser')
    }
    this.applyClearColor()
    return this.renderer
  }

  private applyClearColor(): void {
    if (this.config.clearColor !== undefined) this.renderer?.setClearColor?.(this.config.clearColor)
  }
}

function makeLight(spec: MapLight): THREE.Object3D {
  if (spec.kind === 'ambient') return new THREE.AmbientLight(spec.color, spec.intensity)

  if (spec.kind === 'directional') {
    const light = new THREE.DirectionalLight(spec.color, spec.intensity)
    if (spec.position) light.position.set(...spec.position)
    return light
  }

  const light = new THREE.PointLight(spec.color, spec.intensity, spec.distance, spec.decay)
  if (spec.position) light.position.set(...spec.position)
  return light
}

function toColor(color: ColorToken): THREE.Color {
  return new THREE.Color(color)
}
