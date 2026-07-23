export const GYM_SCAFFOLDS = ['character', 'element', 'playground'] as const

export type GymScaffoldKind = (typeof GYM_SCAFFOLDS)[number]
export type GymBoundKind = 'collision' | 'attack'
export type GymParameterValue = boolean | number | string

export interface GymRect {
  x: number
  y: number
  width: number
  height: number
}

export interface GymBoundDefinition {
  id: string
  kind: GymBoundKind
  rect: GymRect
  /** Optional raw sprite-sheet frames on which this bound is visible. */
  frames?: readonly number[]
}

export interface GymClipDefinition {
  /** Raw sprite-sheet frame numbers in playback order. */
  frames: readonly number[]
  fps: number
  loop?: boolean
  /** Raw frames on which attack bounds register a hit. */
  hitFrames?: readonly number[]
}

export interface GymParameterDefinition<
  TValue extends GymParameterValue = GymParameterValue,
> {
  value: TValue
  min?: number
  max?: number
  step?: number
}

export interface GymEntityDefinition {
  id: string
  assetId: string
  clips: Readonly<Record<string, GymClipDefinition>>
  bounds?: readonly GymBoundDefinition[]
  parameters?: Readonly<Record<string, GymParameterDefinition>>
}

export interface GymScaffoldDefinition {
  entityIds: readonly string[]
}

export interface GymGameDefinition {
  id: string
  entities: readonly GymEntityDefinition[]
  /** Every game supplies all three standard scaffolds, even when they share entities. */
  scaffolds: Readonly<Record<GymScaffoldKind, GymScaffoldDefinition>>
}

export interface GymEntityTuning {
  bounds: GymBoundDefinition[]
  hitFrames: Record<string, number[]>
  parameters: Record<string, GymParameterValue>
}

export interface GymTuningData {
  version: 1
  gameId: string
  entities: Record<string, GymEntityTuning>
}

export interface GymPersistence {
  load(gameId: string): Promise<GymTuningData | null>
  save(data: GymTuningData): Promise<void>
}

export interface GymHarnessOptions {
  definition: GymGameDefinition
  persistence: GymPersistence
}

export interface GymBoundOverlay extends GymBoundDefinition {
  /** False means the editor may render the bound dimmed, but runtime hit checks ignore it. */
  active: boolean
}

export interface GymSnapshot {
  gameId: string
  scaffold: GymScaffoldKind
  availableEntities: readonly string[]
  entityId: string
  assetId: string
  availableClips: readonly string[]
  clipId: string
  frameIndex: number
  frame: number
  playing: boolean
  bounds: readonly GymBoundOverlay[]
  hitFrames: readonly number[]
  parameters: Readonly<Record<string, GymParameterValue>>
  dirty: boolean
}

export type GymListener = (snapshot: GymSnapshot) => void

/**
 * Shared, UI-agnostic state machine for character, element, and playground
 * gyms. Games provide assets/entities; a React or imperative cockpit renders
 * the snapshot and forwards editor actions back to this harness.
 */
export class GymHarness {
  private readonly entities = new Map<string, GymEntityDefinition>()
  private readonly listeners = new Set<GymListener>()
  private tuning: GymTuningData
  private scaffold: GymScaffoldKind = 'character'
  private entityId: string
  private clipId: string
  private frameIndex = 0
  private elapsed = 0
  private playing = true
  private dirty = false

  private constructor(
    readonly definition: GymGameDefinition,
    private readonly persistence: GymPersistence,
    tuning: GymTuningData,
  ) {
    for (const entity of definition.entities)
      this.entities.set(entity.id, entity)
    this.tuning = tuning
    this.entityId = definition.scaffolds.character.entityIds[0]!
    this.clipId = Object.keys(this.entity().clips)[0]!
  }

  static async create(options: GymHarnessOptions): Promise<GymHarness> {
    validateGymDefinition(options.definition)
    const stored = await options.persistence.load(options.definition.id)
    const tuning = materializeTuning(options.definition, stored)
    return new GymHarness(options.definition, options.persistence, tuning)
  }

  getSnapshot(): GymSnapshot {
    const entity = this.entity()
    const tuning = this.entityTuning()
    const clip = this.clip()
    const frame = clip.frames[this.frameIndex]!
    const hitFrames = tuning.hitFrames[this.clipId] ?? []

    return {
      gameId: this.definition.id,
      scaffold: this.scaffold,
      availableEntities: [
        ...this.definition.scaffolds[this.scaffold].entityIds,
      ],
      entityId: entity.id,
      assetId: entity.assetId,
      availableClips: Object.keys(entity.clips),
      clipId: this.clipId,
      frameIndex: this.frameIndex,
      frame,
      playing: this.playing,
      bounds: tuning.bounds.map((bound) => ({
        ...cloneBound(bound),
        active:
          (bound.frames === undefined || bound.frames.includes(frame)) &&
          (bound.kind === 'collision' || hitFrames.includes(frame)),
      })),
      hitFrames: [...hitFrames],
      parameters: { ...tuning.parameters },
      dirty: this.dirty,
    }
  }

  subscribe(listener: GymListener, emitImmediately = true): () => void {
    this.listeners.add(listener)
    if (emitImmediately) listener(this.getSnapshot())
    return () => this.listeners.delete(listener)
  }

  mount(scaffold: GymScaffoldKind, entityId?: string): void {
    const scaffoldDefinition = this.definition.scaffolds[scaffold]
    const nextEntity = entityId ?? scaffoldDefinition.entityIds[0]
    if (!nextEntity || !scaffoldDefinition.entityIds.includes(nextEntity)) {
      throw new Error(
        `GymHarness: entity "${entityId ?? ''}" is not registered in the ${scaffold} gym`,
      )
    }

    this.scaffold = scaffold
    this.selectEntityState(nextEntity)
    this.emit()
  }

  selectEntity(entityId: string): void {
    if (
      !this.definition.scaffolds[this.scaffold].entityIds.includes(entityId)
    ) {
      throw new Error(
        `GymHarness: entity "${entityId}" is not registered in the ${this.scaffold} gym`,
      )
    }
    this.selectEntityState(entityId)
    this.emit()
  }

  selectClip(clipId: string): void {
    if (!this.entity().clips[clipId]) {
      throw new Error(
        `GymHarness: entity "${this.entityId}" has no clip "${clipId}"`,
      )
    }
    this.clipId = clipId
    this.frameIndex = 0
    this.elapsed = 0
    this.playing = true
    this.emit()
  }

  cycleAnimation(direction = 1): void {
    const clips = Object.keys(this.entity().clips)
    const current = clips.indexOf(this.clipId)
    if (!Number.isFinite(direction))
      throw new Error('GymHarness: animation direction must be finite')
    const offset = Math.trunc(direction)
    const next =
      (((current + offset) % clips.length) + clips.length) % clips.length
    this.selectClip(clips[next]!)
  }

  scrub(frameIndex: number): void {
    const frames = this.clip().frames
    if (
      !Number.isInteger(frameIndex) ||
      frameIndex < 0 ||
      frameIndex >= frames.length
    ) {
      throw new Error(
        `GymHarness: frame index ${frameIndex} is outside clip "${this.clipId}"`,
      )
    }
    this.frameIndex = frameIndex
    this.elapsed = 0
    this.emit()
  }

  setPlaying(playing: boolean): void {
    this.playing = playing
    this.elapsed = 0
    this.emit()
  }

  update(delta: number): void {
    if (!Number.isFinite(delta))
      throw new Error('GymHarness: animation delta must be finite')
    if (!this.playing || delta <= 0) return
    const clip = this.clip()
    if (clip.fps <= 0 || clip.frames.length < 2) return

    const frameDuration = 1 / clip.fps
    this.elapsed += delta
    const advance = Math.floor(this.elapsed / frameDuration)
    if (advance === 0) return
    this.elapsed -= advance * frameDuration

    const next = this.frameIndex + advance
    if (clip.loop ?? true) {
      this.frameIndex = next % clip.frames.length
    } else if (next >= clip.frames.length - 1) {
      this.frameIndex = clip.frames.length - 1
      this.playing = false
      this.elapsed = 0
    } else {
      this.frameIndex = next
    }
    this.emit()
  }

  editBound(boundId: string, rect: GymRect): void {
    validateRect(rect, `bound "${boundId}"`)
    const tuning = this.entityTuning()
    const index = tuning.bounds.findIndex((bound) => bound.id === boundId)
    if (index < 0)
      throw new Error(
        `GymHarness: entity "${this.entityId}" has no bound "${boundId}"`,
      )
    tuning.bounds[index] = { ...tuning.bounds[index]!, rect: { ...rect } }
    this.markDirty()
  }

  setHitFrame(frame: number, active: boolean): void {
    const clip = this.clip()
    if (!clip.frames.includes(frame)) {
      throw new Error(
        `GymHarness: frame ${frame} is not part of clip "${this.clipId}"`,
      )
    }

    const tuning = this.entityTuning()
    const selected = new Set(tuning.hitFrames[this.clipId] ?? [])
    if (active) selected.add(frame)
    else selected.delete(frame)
    tuning.hitFrames[this.clipId] = clip.frames.filter((candidate) =>
      selected.has(candidate),
    )
    this.markDirty()
  }

  setParameter(id: string, value: GymParameterValue): void {
    const parameter = this.entity().parameters?.[id]
    if (!parameter)
      throw new Error(
        `GymHarness: entity "${this.entityId}" has no parameter "${id}"`,
      )
    validateParameterValue(value, parameter, `parameter "${id}"`)
    this.entityTuning().parameters[id] = value
    this.markDirty()
  }

  resetEntity(): void {
    this.tuning.entities[this.entityId] = defaultEntityTuning(this.entity())
    this.markDirty()
  }

  exportTuning(): GymTuningData {
    return cloneTuning(this.tuning)
  }

  async save(): Promise<void> {
    await this.persistence.save(this.exportTuning())
    this.dirty = false
    this.emit()
  }

  private selectEntityState(entityId: string): void {
    this.entityId = entityId
    this.clipId = Object.keys(this.entity().clips)[0]!
    this.frameIndex = 0
    this.elapsed = 0
    this.playing = true
  }

  private entity(): GymEntityDefinition {
    return this.entities.get(this.entityId)!
  }

  private clip(): GymClipDefinition {
    return this.entity().clips[this.clipId]!
  }

  private entityTuning(): GymEntityTuning {
    return this.tuning.entities[this.entityId]!
  }

  private markDirty(): void {
    this.dirty = true
    this.emit()
  }

  private emit(): void {
    if (this.listeners.size === 0) return
    const snapshot = this.getSnapshot()
    for (const listener of this.listeners) listener(snapshot)
  }
}

export function createGymHarness(
  options: GymHarnessOptions,
): Promise<GymHarness> {
  return GymHarness.create(options)
}

export function stringifyGymTuning(data: GymTuningData): string {
  return `${JSON.stringify(parseGymTuning(data), null, 2)}\n`
}

export function parseGymTuning(input: unknown): GymTuningData {
  const value =
    typeof input === 'string' ? (JSON.parse(input) as unknown) : input
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    typeof value.gameId !== 'string' ||
    !isRecord(value.entities)
  ) {
    throw new Error('GymHarness: invalid tuning data')
  }
  validateGameId(value.gameId)

  const entities: Record<string, GymEntityTuning> = {}
  for (const [entityId, entity] of Object.entries(value.entities)) {
    if (
      !isRecord(entity) ||
      !Array.isArray(entity.bounds) ||
      !isRecord(entity.hitFrames) ||
      !isRecord(entity.parameters)
    ) {
      throw new Error(`GymHarness: invalid tuning for entity "${entityId}"`)
    }

    const bounds = entity.bounds.map((bound, index) =>
      parseBound(bound, `${entityId}.bounds[${index}]`),
    )
    if (new Set(bounds.map((bound) => bound.id)).size !== bounds.length) {
      throw new Error(
        `GymHarness: duplicate persisted bound for entity "${entityId}"`,
      )
    }
    const hitFrames: Record<string, number[]> = {}
    for (const [clipId, frames] of Object.entries(entity.hitFrames)) {
      if (!Array.isArray(frames) || !frames.every(isFrame)) {
        throw new Error(
          `GymHarness: invalid hit frames for "${entityId}.${clipId}"`,
        )
      }
      hitFrames[clipId] = [...new Set(frames)]
    }

    const parameters: Record<string, GymParameterValue> = {}
    for (const [id, parameter] of Object.entries(entity.parameters)) {
      if (!isParameterValue(parameter)) {
        throw new Error(`GymHarness: invalid parameter "${entityId}.${id}"`)
      }
      parameters[id] = parameter
    }
    entities[entityId] = { bounds, hitFrames, parameters }
  }
  return { version: 1, gameId: value.gameId, entities }
}

export function validateGymDefinition(definition: GymGameDefinition): void {
  validateGameId(definition.id)
  if (definition.entities.length === 0)
    throw new Error('GymHarness: at least one entity is required')

  const entityIds = new Set<string>()
  for (const entity of definition.entities) {
    if (!entity.id || entityIds.has(entity.id))
      throw new Error(`GymHarness: duplicate or empty entity id "${entity.id}"`)
    if (!entity.assetId)
      throw new Error(`GymHarness: entity "${entity.id}" requires an assetId`)
    entityIds.add(entity.id)

    const clips = Object.entries(entity.clips)
    if (clips.length === 0)
      throw new Error(
        `GymHarness: entity "${entity.id}" requires at least one clip`,
      )
    for (const [clipId, clip] of clips) {
      if (
        !clipId ||
        clip.frames.length === 0 ||
        !clip.frames.every(isFrame) ||
        !Number.isFinite(clip.fps) ||
        clip.fps < 0
      ) {
        throw new Error(`GymHarness: invalid clip "${entity.id}.${clipId}"`)
      }
      if (new Set(clip.frames).size !== clip.frames.length) {
        throw new Error(
          `GymHarness: clip "${entity.id}.${clipId}" contains duplicate frames`,
        )
      }
      for (const frame of clip.hitFrames ?? []) {
        if (!clip.frames.includes(frame)) {
          throw new Error(
            `GymHarness: hit frame ${frame} is outside clip "${entity.id}.${clipId}"`,
          )
        }
      }
      if (
        new Set(clip.hitFrames ?? []).size !== (clip.hitFrames ?? []).length
      ) {
        throw new Error(
          `GymHarness: clip "${entity.id}.${clipId}" contains duplicate hit frames`,
        )
      }
    }

    const boundIds = new Set<string>()
    const entityFrames = new Set(clips.flatMap(([, clip]) => [...clip.frames]))
    for (const bound of entity.bounds ?? []) {
      if (!bound.id || boundIds.has(bound.id)) {
        throw new Error(
          `GymHarness: duplicate or empty bound id "${entity.id}.${bound.id}"`,
        )
      }
      boundIds.add(bound.id)
      validateRect(bound.rect, `bound "${entity.id}.${bound.id}"`)
      if (bound.frames && !bound.frames.every(isFrame)) {
        throw new Error(
          `GymHarness: invalid frames for bound "${entity.id}.${bound.id}"`,
        )
      }
      if (bound.frames?.some((frame) => !entityFrames.has(frame))) {
        throw new Error(
          `GymHarness: bound "${entity.id}.${bound.id}" references an unknown frame`,
        )
      }
    }

    for (const [id, parameter] of Object.entries(entity.parameters ?? {})) {
      validateParameterDefinition(parameter, `parameter "${entity.id}.${id}"`)
      validateParameterValue(
        parameter.value,
        parameter,
        `parameter "${entity.id}.${id}"`,
      )
      if (
        parameter.step !== undefined &&
        (!Number.isFinite(parameter.step) || parameter.step <= 0)
      ) {
        throw new Error(
          `GymHarness: parameter "${entity.id}.${id}" has an invalid step`,
        )
      }
    }
  }

  for (const scaffold of GYM_SCAFFOLDS) {
    const ids = definition.scaffolds[scaffold]?.entityIds
    if (!ids || ids.length === 0)
      throw new Error(
        `GymHarness: ${scaffold} gym requires at least one entity`,
      )
    for (const entityId of ids) {
      if (!entityIds.has(entityId)) {
        throw new Error(
          `GymHarness: ${scaffold} gym references unknown entity "${entityId}"`,
        )
      }
    }
  }
}

function materializeTuning(
  definition: GymGameDefinition,
  stored: GymTuningData | null,
): GymTuningData {
  if (stored?.gameId !== undefined && stored.gameId !== definition.id) {
    throw new Error(
      `GymHarness: tuning belongs to "${stored.gameId}", not "${definition.id}"`,
    )
  }
  const parsed = stored ? parseGymTuning(stored) : null
  const knownEntities = new Set(definition.entities.map((entity) => entity.id))
  for (const entityId of Object.keys(parsed?.entities ?? {})) {
    if (!knownEntities.has(entityId))
      throw new Error(
        `GymHarness: tuning references unknown entity "${entityId}"`,
      )
  }

  const entities: Record<string, GymEntityTuning> = {}
  for (const entity of definition.entities) {
    const defaults = defaultEntityTuning(entity)
    const saved = parsed?.entities[entity.id]
    if (!saved) {
      entities[entity.id] = defaults
      continue
    }

    const savedBounds = new Map(saved.bounds.map((bound) => [bound.id, bound]))
    for (const savedBound of saved.bounds) {
      const expected = defaults.bounds.find(
        (bound) => bound.id === savedBound.id,
      )
      if (!expected || expected.kind !== savedBound.kind) {
        throw new Error(
          `GymHarness: tuning references unknown bound "${entity.id}.${savedBound.id}"`,
        )
      }
    }
    defaults.bounds = defaults.bounds.map((bound) => ({
      ...bound,
      rect: { ...(savedBounds.get(bound.id)?.rect ?? bound.rect) },
    }))

    for (const [clipId, frames] of Object.entries(saved.hitFrames)) {
      const clip = entity.clips[clipId]
      if (!clip)
        throw new Error(
          `GymHarness: tuning references unknown clip "${entity.id}.${clipId}"`,
        )
      if (frames.some((frame) => !clip.frames.includes(frame))) {
        throw new Error(
          `GymHarness: tuning has a hit frame outside clip "${entity.id}.${clipId}"`,
        )
      }
      defaults.hitFrames[clipId] = clip.frames.filter((frame) =>
        frames.includes(frame),
      )
    }

    for (const [id, value] of Object.entries(saved.parameters)) {
      const parameter = entity.parameters?.[id]
      if (!parameter)
        throw new Error(
          `GymHarness: tuning references unknown parameter "${entity.id}.${id}"`,
        )
      validateParameterValue(value, parameter, `parameter "${entity.id}.${id}"`)
      defaults.parameters[id] = value
    }
    entities[entity.id] = defaults
  }
  return { version: 1, gameId: definition.id, entities }
}

function defaultEntityTuning(entity: GymEntityDefinition): GymEntityTuning {
  const hitFrames: Record<string, number[]> = {}
  for (const [clipId, clip] of Object.entries(entity.clips))
    hitFrames[clipId] = [...(clip.hitFrames ?? [])]
  const parameters: Record<string, GymParameterValue> = {}
  for (const [id, parameter] of Object.entries(entity.parameters ?? {}))
    parameters[id] = parameter.value
  return {
    bounds: (entity.bounds ?? []).map(cloneBound),
    hitFrames,
    parameters,
  }
}

function cloneTuning(data: GymTuningData): GymTuningData {
  const entities: Record<string, GymEntityTuning> = {}
  for (const [entityId, entity] of Object.entries(data.entities)) {
    entities[entityId] = {
      bounds: entity.bounds.map(cloneBound),
      hitFrames: Object.fromEntries(
        Object.entries(entity.hitFrames).map(([id, frames]) => [
          id,
          [...frames],
        ]),
      ),
      parameters: { ...entity.parameters },
    }
  }
  return { version: 1, gameId: data.gameId, entities }
}

function cloneBound(bound: GymBoundDefinition): GymBoundDefinition {
  return {
    ...bound,
    rect: { ...bound.rect },
    frames: bound.frames ? [...bound.frames] : undefined,
  }
}

function parseBound(value: unknown, label: string): GymBoundDefinition {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    (value.kind !== 'collision' && value.kind !== 'attack')
  ) {
    throw new Error(`GymHarness: invalid bound "${label}"`)
  }
  if (!isRecord(value.rect))
    throw new Error(`GymHarness: invalid bound "${label}"`)
  const { x, y, width, height } = value.rect
  if (
    typeof x !== 'number' ||
    typeof y !== 'number' ||
    typeof width !== 'number' ||
    typeof height !== 'number'
  ) {
    throw new Error(`GymHarness: invalid bound "${label}"`)
  }
  const rect = { x, y, width, height }
  validateRect(rect, `bound "${label}"`)
  if (
    value.frames !== undefined &&
    (!Array.isArray(value.frames) || !value.frames.every(isFrame))
  ) {
    throw new Error(`GymHarness: invalid frames for bound "${label}"`)
  }
  return {
    id: value.id,
    kind: value.kind,
    rect,
    frames: value.frames ? [...value.frames] : undefined,
  }
}

function validateRect(rect: GymRect, label: string): void {
  if (
    ![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) ||
    rect.width <= 0 ||
    rect.height <= 0
  ) {
    throw new Error(
      `GymHarness: ${label} must have finite coordinates and positive dimensions`,
    )
  }
}

function validateParameterValue(
  value: GymParameterValue,
  definition: GymParameterDefinition,
  label: string,
): void {
  if (!isParameterValue(value) || typeof value !== typeof definition.value) {
    throw new Error(`GymHarness: ${label} must be a ${typeof definition.value}`)
  }
  if (typeof value === 'number') {
    if (
      !Number.isFinite(value) ||
      (definition.min !== undefined && value < definition.min) ||
      (definition.max !== undefined && value > definition.max)
    ) {
      throw new Error(`GymHarness: ${label} is outside its allowed range`)
    }
  }
}

function validateParameterDefinition(
  definition: GymParameterDefinition,
  label: string,
): void {
  const numericControls = [definition.min, definition.max, definition.step]
  if (
    typeof definition.value !== 'number' &&
    numericControls.some((value) => value !== undefined)
  ) {
    throw new Error(
      `GymHarness: ${label} uses numeric controls for a non-number value`,
    )
  }
  if (
    numericControls.some(
      (value) => value !== undefined && !Number.isFinite(value),
    )
  ) {
    throw new Error(`GymHarness: ${label} has a non-finite numeric control`)
  }
  if (
    definition.min !== undefined &&
    definition.max !== undefined &&
    definition.min > definition.max
  ) {
    throw new Error(`GymHarness: ${label} has min greater than max`)
  }
}

function validateGameId(gameId: string): void {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(gameId)) {
    throw new Error('GymHarness: game id must be a lowercase slug')
  }
}

function isFrame(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0
}

function isParameterValue(value: unknown): value is GymParameterValue {
  return (
    typeof value === 'boolean' ||
    typeof value === 'string' ||
    (typeof value === 'number' && Number.isFinite(value))
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
