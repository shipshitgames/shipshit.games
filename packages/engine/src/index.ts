/**
 * @shipshitgames/engine — the embodied 3D game engine shared by every Ship Shit Games title.
 *
 * Scope: engine-core (loop, context base, system registry, snapshot HUD shell, transport)
 * + embodied-base ("the player is a body in a 3D world": movement, collision, world bounds,
 * camera rig, agent kinematics, presence). FPS/genre specifics live in the games.
 *
 * Built seam-by-seam out of scourge-survivors — see that repo's ENGINE-EXTRACTION-PLAN.md.
 */

// --- embodied-base: world bounds (seam: WorldBounds) ---
export {
  RectBounds,
  makeBounds,
  type WorldBounds,
  type MapBounds,
} from './world/bounds'
export {
  ArenaSystem,
  pointInObstacle,
  validateArenaMap,
  type ArenaMap,
  type ArenaSystemOptions,
  type CircleMapObstacle,
  type ColorToken,
  type MapFog,
  type MapLight,
  type MapObstacle,
  type MapTheme,
  type RectMapObstacle,
} from './world/map'

// --- engine-core: render seam (scene/renderer lifecycle + map lights/theme) ---
export { RenderSystem, type RendererLike, type RenderSystemConfig } from './render/RenderSystem'

// --- engine-core: pixel sprite runtime (PNG/WebP → WebGL: texture, billboard, sprite-anim) ---
export {
  applyPixelFilters,
  loadPixelTexture,
  type PixelTextureOptions,
  type TextureLoaderLike,
} from './render/texture'
export {
  applyFrame,
  facingSuffix,
  frameCell,
  frameRange,
  frameUV,
  gridSheet,
  type FacingCount,
  type FrameUV,
  type GridSheetOptions,
  type SpriteClip,
  type SpriteSheet,
} from './render/sprite-sheet'
export { Billboard, type BillboardOptions } from './render/Billboard'
export { AnimatedSprite, type AnimatedSpriteOptions } from './render/AnimatedSprite'
export {
  AssetCatalog,
  deriveSheet,
  type AssetCatalogOptions,
  type ManifestSpriteEntry,
} from './render/AssetCatalog'

// --- engine-core: HUD snapshot fan-out (React stays game-side) ---
export {
  HudSystem,
  type StateListener,
  type StateUpdater,
  type SubscribeOptions,
} from './hud/HudSystem'

// --- engine-core: short-lived visual effects (rendering stays game-side) ---
export {
  FxSystem,
  type FxEntity,
  type FxSpawn,
  type FxSystemHooks,
  type Pop,
  type Tracer,
  type TransientEntity,
} from './fx/FxSystem'

// --- engine-core: audio runtime (seam: Howler.js backend; playback side of #21) ---
// Howler is an optional dependency: browser games call `AudioSystem.withHowler()`,
// everyone else injects a backend. The bun unit suite uses an in-memory fake.
export {
  AudioSystem,
  DEFAULT_MUSIC_CROSSFADE_MS,
  type AudioSystemOptions,
  type MusicOptions,
  type PlayOptions,
  type RegisteredSound,
} from './audio/AudioSystem'
export {
  loadHowlerBackend,
  type AudioBackend,
  type AudioContextLike,
  type HowlFactory,
  type HowlGlobalLike,
  type HowlLike,
  type HowlOptions,
  type HowlSpriteDef,
} from './audio/howl'
export {
  AUDIO_KINDS,
  defaultLoopForKind,
  isAudioKind,
  resolveCategory,
  selectAudioEntries,
  toSoundSpec,
  type AudioAssetEntry,
  type AudioCueMap,
  type AudioKind,
  type AudioManifestLike,
  type SoundSpec,
} from './audio/manifest'
export {
  computeAttenuation,
  computePan,
  spatialize,
  DEFAULT_MAX_DISTANCE,
  DEFAULT_REF_DISTANCE,
  type AttenuationConfig,
  type AudioListener,
  type Spatialized,
} from './audio/spatial-audio'

// --- engine-core: generic data-driven transient gameplay entities ---
export {
  ProjectilesSystem,
  type Projectile,
  type ProjectileSpec,
  type ProjectileTable,
  type ProjectileUpdateOptions,
  type SpawnProjectile,
} from './projectiles/ProjectilesSystem'
export {
  PickupsSystem,
  type Pickup,
  type PickupCollectOptions,
  type PickupSpec,
  type PickupTable,
  type SpawnPickup,
} from './pickups/PickupsSystem'
export {
  addScaledVec3,
  copyVec3,
  distanceXZ,
  normalizedVec3,
  vec3,
  type MutableVec3Like,
  type Vec3Like,
} from './spatial'

// --- embodied-base: camera rig (seam: CameraRig — the spine) ---
export {
  firstPersonPointerLock,
  thirdPersonFollow,
  type CameraRig,
  type CameraRigPreset,
  type RigCaptureEvent,
  type ThirdPersonFollowConfig,
} from './camera/CameraRig'

// --- embodied-base: input (seam: DOM bindings + movement; genre verbs stay game-side) ---
export { InputSystem, type InputHooks } from './input/InputSystem'
export {
  makeMoveIntent,
  clearMoveIntent,
  applyMoveKey,
  actionFor,
  isJumpKey,
  DEFAULT_MOVE_KEYS,
  DEFAULT_MOVEMENT_CONFIG,
  type MoveIntent,
  type ActionMap,
  type ActionId,
  type CaptureRig,
  type InputActionHandler,
  type MovementConfig,
  type MovementKeyMap,
} from './input/bindings'

// --- embodied-base: agents (seam: kinematic Agent + pluggable SteeringStrategy) ---
export { Agent, type PlanarVec } from './agents/Agent'
export { type SteeringStrategy, type SteerView } from './agents/steering'

// --- embodied-base: spawn (seam: where the next enemy enters the world) ---
export {
  RectScatterSpawnProvider,
  type SpawnPointProvider,
  type SpawnRequest,
  type SpawnPoint,
  type RectScatterConfig,
} from './spawn'

// --- embodied-base: level (seam: LDtk import -> arena + spawns + tile layers) ---
export {
  loadLdtkProject,
  loadLdtkLevel,
  assertLdtkVersion,
  parseLdtkVersion,
  FixedSpawnProvider,
  LdtkError,
  SUPPORTED_LDTK_VERSION,
  type LdtkLoadOptions,
  type LdtkProject,
  type LdtkArena,
  type LdtkEntity,
  type LdtkTile,
  type LdtkTileLayer,
  type LdtkVersionInfo,
  type FixedSpawnConfig,
} from './level/ldtk'
export type {
  LdtkRoot,
  LdtkDefs,
  LdtkLayerDef,
  LdtkIntGridValueDef,
  LdtkTilesetDef,
  LdtkLevel,
  LdtkLayerInstance,
  LdtkTileInstance,
  LdtkEntityInstance,
  LdtkFieldInstance,
} from './level/ldtk-types'

// --- embodied-base: net (seam: PartyKit transport + replicated presence; game payloads ride GameMessage) ---
// The room server template is intentionally NOT re-exported here: import
// `createRoomServer` from '@shipshitgames/engine/net/server' in your party/
// entry so browser bundles never resolve partykit types.
export {
  RESERVED_MESSAGE_TYPES,
  isReservedMessageType,
  parseMessage,
  type ClientMessage,
  type GameMessage,
  type HitBroadcast,
  type HitMessage,
  type HitReport,
  type JoinBroadcast,
  type JoinRequest,
  type LeaveBroadcast,
  type NameBroadcast,
  type RemotePlayerInfo,
  type ReservedMessageType,
  type ServerMessage,
  type StateBroadcast,
  type StateUpdate,
  type WelcomeMessage,
} from './net/protocol'
export {
  DEFAULT_DEV_PARTYKIT_HOST,
  resolvePartyKitHost,
  type PartyKitHostEnv,
} from './net/host'
export {
  NetClient,
  type NetClientOptions,
  type NetEvents,
  type NetSocketFactory,
  type NetSocketLike,
} from './net/NetClient'
export {
  RemoteAvatar,
  type RemoteAvatarFrame,
  type RemoteAvatarMeta,
  type RemoteAvatarOptions,
  type RemoteAvatarSkin,
  type RemoteAvatarSkinFactory,
} from './net/RemoteAvatar'
