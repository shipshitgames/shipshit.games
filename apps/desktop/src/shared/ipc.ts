/**
 * Canonical contract for the Electron main, preload, and renderer processes.
 *
 * Keep channel names and renderer-visible request/response types here so a
 * channel rename cannot silently drift between the three process boundaries.
 */

export const IPC_INVOKE_CHANNELS = {
  studioGenerate: "studio:generate",
  studioPixelize: "studio:pixelize",
  spritesList: "sprites:list",
  spritesLoad: "sprites:load",
  spritesSaveDraft: "sprites:saveDraft",
  spritesPromote: "sprites:promote",
  studioListGames: "studio:listGames",
  studioResearch: "studio:research",
  resourcesList: "resources:list",
  resourcesValidate: "resources:validate",
  resourcesPreview: "resources:preview",
  resourcesReveal: "resources:reveal",
  resourcesPromoteSkill: "resources:promoteSkill",
  studioTranscodeAudio: "studio:transcodeAudio",
  studioPickAudioFiles: "studio:pickAudioFiles",
  settingsGet: "settings:get",
  settingsSet: "settings:set",
  projectsList: "projects:list",
  projectsAdd: "projects:add",
  projectsRemove: "projects:remove",
  projectsSetActive: "projects:setActive",
  gymsList: "gyms:list",
  gymsLaunch: "gyms:launch",
  keysStatus: "keys:status",
  keysSet: "keys:set",
  studioModels: "studio:models",
  terminalStart: "terminal:start",
  terminalWrite: "terminal:write",
  terminalResize: "terminal:resize",
  terminalStop: "terminal:stop",
  galleryListGames: "gallery:listGames",
  galleryList: "gallery:list",
  galleryImage: "gallery:image",
  moodboardListGames: "moodboard:listGames",
  moodboardGet: "moodboard:get",
  moodboardAddNote: "moodboard:addNote",
  moodboardImportImages: "moodboard:importImages",
  moodboardUpdateItem: "moodboard:updateItem",
  moodboardSetVisualTarget: "moodboard:setVisualTarget",
  moodboardRemoveItem: "moodboard:removeItem",
  labListGames: "lab:listGames",
  labGet: "lab:get",
  labSetSubject: "lab:setSubject",
  labAddVariant: "lab:addVariant",
  labScoreVariant: "lab:scoreVariant",
  labTagVariant: "lab:tagVariant",
  labAnnotateVariant: "lab:annotateVariant",
  labRemoveVariant: "lab:removeVariant",
  labLockVariant: "lab:lockVariant",
  labClearLock: "lab:clearLock",
  mapsListGames: "maps:listGames",
  mapsPreview: "maps:preview",
  mapsWrite: "maps:write",
} as const;

export const IPC_EVENT_CHANNELS = {
  studioGenLog: "studio:gen-log",
  studioResearchLog: "studio:research-log",
  studioTranscodeLog: "studio:transcode-log",
  terminalData: "terminal:data",
  terminalExit: "terminal:exit",
} as const;

export const IPC_CHANNELS = {
  ...IPC_INVOKE_CHANNELS,
  ...IPC_EVENT_CHANNELS,
} as const;

export interface GenerateOptions {
  id: string;
  prompt: string;
  game: string;
  kind: string;
  provider?: string;
  model?: string;
  projectId?: string;
  views?: string;
  frames?: number;
  fps?: number;
  anchor?: string;
  scale?: number;
  license?: string;
  licenseUrl?: string;
  category?: string;
  volume?: number;
  loop?: boolean;
  bitrate?: number;
  normalize?: boolean;
  ktx2?: boolean;
  draco?: boolean;
  rig?: string;
  referenceImage?: string;
  faceCount?: number;
  pbr?: boolean;
  generateType?: "Normal" | "Geometry";
  maxRuntimeMb?: number;
  draft?: boolean;
}

export interface GenResult {
  ok: boolean;
  log: string;
  path: string | null;
  dataUrl: string | null;
  previewPath?: string | null;
  mediaType?: string | null;
}

export interface PixelizeOptions {
  dataUrl?: string;
  path?: string;
  height?: number;
  bgThreshold?: number;
  cutout?: string;
  palette?: string;
}

export interface PixelizeResult {
  ok: boolean;
  dataUrl?: string;
  bytes?: number;
  height?: number;
  requestedCutout?: string;
  cutout?: { tool: string; reason?: string } | null;
  log?: string;
  error?: string;
}

export type SpriteEditorOrigin = "draft" | "promoted";

export interface SpriteEditorAsset {
  id: string;
  kind: string;
  game: string;
  path: string;
  origin: SpriteEditorOrigin;
  prompt: string | null;
  provider: string | null;
  dimensions: [number, number] | null;
  frameSize: [number, number] | null;
  frames: number;
  fps: number | null;
  views: string[];
  sheet: {
    columns: number;
    rows: number;
    usedColumns: number;
    usedRows: number;
  } | null;
  provenance: Record<string, unknown> | null;
  human: { authored: boolean; editKind?: string } | null;
  license: Record<string, unknown>;
}

export interface SpriteEditorListResult {
  ok: boolean;
  projectId: string;
  game: string;
  assets: SpriteEditorAsset[];
  error?: string;
}

export interface SpriteEditorLoadResult {
  ok: boolean;
  asset?: SpriteEditorAsset;
  dataUrl?: string;
  error?: string;
}

export interface SpriteEditorSaveResult extends SpriteEditorLoadResult {
  correctedOffPalette?: number;
  log?: string;
}

export interface SpriteEditorPromoteResult extends SpriteEditorLoadResult {
  log?: string;
}

export interface ResearchResult {
  ok: boolean;
  log: string;
  path: string | null;
  rules: string | null;
}

export interface ResourceSourceItem {
  slug: string;
  title: string;
  kind: string;
  priority: string;
  status: string;
  url: string;
  topics: string[];
  desiredOutputs: string[];
  transcriptPolicy: string;
  storeRawTranscript: boolean;
  transcriptCount: number;
  path: string;
}

export interface ResourceTranscriptItem {
  slug: string;
  sourceSlug: string;
  title: string;
  sourceKind: string;
  url: string;
  capturedAt: string;
  transcriptFormat: string;
  transcriptPath: string;
  rightsStatus: string;
  tags: string[];
  derivativeCount: number;
  path: string;
}

export interface ResourceDerivativeItem {
  slug: string;
  kind: "rule" | "skill" | "app" | "tool";
  title: string;
  status: string;
  summary: string;
  sourceTranscripts: string[];
  sourceTranscriptCount: number;
  outputPath: string;
  tags: string[];
  path: string;
}

export interface ResourceInventory<Item> {
  schemaVersion: 1;
  count: number;
  items: Item[];
  errors: string[];
  warnings: string[];
}

export interface ResourcesOverview {
  ok: boolean;
  error: string | null;
  sources: ResourceInventory<ResourceSourceItem>;
  transcripts: ResourceInventory<ResourceTranscriptItem>;
  derivatives: ResourceInventory<ResourceDerivativeItem>;
}

export interface ResourcesValidationResult {
  ok: boolean;
  log: string;
  counts: {
    sources: number;
    transcripts: number;
    derivatives: number;
  } | null;
  errors: string[];
  warnings: string[];
}

export interface ResourcesPreviewResult {
  ok: boolean;
  path: string | null;
  content: string | null;
  error?: string;
}

export interface ResourcesActionResult {
  ok: boolean;
  log: string;
  error?: string;
}

export interface ProjectAsset {
  id: string;
  kind: string;
  path: string;
  game: string | null;
}

export interface ProjectSummary {
  id: string;
  name: string;
  slug: string;
  repoPath: string;
  source: "registered" | "discovered";
  manifestPath: string;
  isActive: boolean;
  exists: boolean;
  valid: boolean;
  error: string | null;
  assetCount: number;
  kindCounts: Record<string, number>;
  assets: ProjectAsset[];
  catalogTruncated: boolean;
}

export interface ProjectState {
  projects: ProjectSummary[];
  activeProjectId: string;
  activeManifestPath: string | null;
}

export interface GymSummary {
  id: string;
  label: string;
  kind: string;
  description: string;
  script: string | null;
  command: string | null;
  args: string[];
  url: string | null;
  cwd: string;
}

export interface GymProject {
  id: string;
  name: string;
  slug: string;
  repoPath: string;
  exists: boolean;
  isActive: boolean;
  declarationPath: string;
  declarationExists: boolean;
  error: string | null;
  gyms: GymSummary[];
}

export interface GymsState {
  projects: GymProject[];
  activeProjectId: string;
}

export interface GymLaunchResult {
  ok: boolean;
  error?: string;
  projectId?: string;
  gymId?: string;
  label?: string;
  pid?: number | null;
  command?: string | null;
  args?: string[];
  cwd?: string;
  openedUrl?: boolean;
  url?: string | null;
}

export interface RegisteredProject {
  id: string;
  name: string;
  slug: string;
  repoPath: string;
}

export interface Settings {
  defaultProvider: string;
  defaultGame: string;
  providerDefaults: Record<string, string>;
  falModelDefaults: Record<string, string>;
  activeProjectId?: string;
  projects?: RegisteredProject[];
}

export interface FalModelInfo {
  id: string;
  label: string;
  kinds: string[];
}

export type TerminalStartResult =
  | {
      ok: true;
      id: string;
      pid: number | null;
      shell: string;
      cwd: string;
      cols: number;
      rows: number;
    }
  | { ok: false; error: string };

export interface TerminalPayload {
  id: string;
  data: string;
}

export interface TerminalExitPayload {
  id: string;
  exitCode: number | null;
  signal: number | null;
}

export interface MoodboardImage {
  name: string;
  path: string;
  mime: string;
}

export interface MoodboardItem {
  id: string;
  type: "note" | "image";
  x: number;
  y: number;
  width: number;
  height: number;
  visualTarget: boolean;
  text?: string;
  image?: MoodboardImage;
  dataUrl?: string | null;
}

export interface Moodboard {
  game: string;
  items: MoodboardItem[];
  updatedAt: string;
}

export interface ArtLabImageRef {
  path: string;
  mime: string;
}

export interface ArtLabVariant {
  id: string;
  direction: string;
  prompt: string;
  provider: string;
  score: number;
  tags: string[];
  note: string;
  locked: boolean;
  image: ArtLabImageRef | null;
  dataUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ArtLabLock {
  game: string;
  variantId: string;
  subject: string;
  kind: string;
  direction: string;
  prompt: string;
  provider: string;
  image: ArtLabImageRef | null;
  dataUrl?: string | null;
  lockedAt: string;
}

export interface ArtLab {
  game: string;
  subject: string;
  kind: string;
  variants: ArtLabVariant[];
  lock: ArtLabLock | null;
  createdAt: string;
  updatedAt: string;
}

export interface ArtLabVariantInput {
  direction: string;
  prompt: string;
  provider: string;
  dataUrl?: string | null;
  sourcePath?: string | null;
  mime?: string;
}

export interface GalleryAsset {
  id: string;
  assetId: string;
  category: string;
  type: string;
  view: string | null;
  path: string;
  group: string;
  dimensions: [number, number] | null;
  scale: [number, number] | null;
  filter: string | null;
  role: string | null;
  license: Record<string, unknown> | null;
  cdnUrl?: string | null;
  missing: boolean;
  dataUrl: string | null;
  bytes: number | null;
  deferred: boolean;
}

export interface GalleryResult {
  ok: boolean;
  error?: string;
  root: string | null;
  assetBaseUrl?: string | null;
  source?: "manifest" | "filesystem";
  manifestPath?: string | null;
  game: string;
  games: string[];
  assets: GalleryAsset[];
  embeddedBytes?: number;
}

export interface MapValidationIssue {
  code: string;
  message: string;
  obstacleId?: string;
}

export interface MapValidationResult {
  ok: boolean;
  issues: MapValidationIssue[];
}

export interface MapSummary {
  id: string;
  name: string;
  rooms: number;
  levels: number;
  obstacles: number;
  lights: number;
  bounds:
    | { kind: "square"; half: number }
    | { kind: "rect"; minX: number; maxX: number; minZ: number; maxZ: number };
}

export interface MapsGenOptions {
  id: string;
  game?: string;
  name?: string;
  seed?: number;
  rooms?: number;
  levels?: number;
  half?: number;
  coverPerRoom?: number;
  spawnRadius?: number;
  spawn?: { x: number; z: number };
}

export interface MapPreviewResult {
  ok: boolean;
  dataUrl: string;
  svg: string;
  moduleText: string;
  summary: MapSummary;
  validation: MapValidationResult;
}

export interface MapWriteResult {
  ok: boolean;
  path?: string;
  svgPath?: string;
  game?: string;
  summary: MapSummary;
  validation: MapValidationResult;
}

export interface StudioEventPayloads {
  [IPC_EVENT_CHANNELS.studioGenLog]: string;
  [IPC_EVENT_CHANNELS.studioResearchLog]: string;
  [IPC_EVENT_CHANNELS.studioTranscodeLog]: string;
  [IPC_EVENT_CHANNELS.terminalData]: TerminalPayload;
  [IPC_EVENT_CHANNELS.terminalExit]: TerminalExitPayload;
}

export interface StudioApi {
  platform: string;
  versions: Record<string, string>;
  generate: (opts: GenerateOptions) => Promise<GenResult>;
  pixelize: (opts: PixelizeOptions) => Promise<PixelizeResult>;
  sprites: {
    list: (
      projectId: string | undefined,
      game: string,
    ) => Promise<SpriteEditorListResult>;
    load: (
      projectId: string | undefined,
      game: string,
      asset: Pick<SpriteEditorAsset, "id" | "kind" | "origin">,
    ) => Promise<SpriteEditorLoadResult>;
    saveDraft: (opts: {
      projectId?: string;
      game: string;
      asset: Pick<SpriteEditorAsset, "id" | "kind" | "origin">;
      dataUrl: string;
      width: number;
      height: number;
      offPaletteCount: number;
    }) => Promise<SpriteEditorSaveResult>;
    promote: (
      projectId: string | undefined,
      game: string,
      asset: Pick<SpriteEditorAsset, "id" | "kind" | "origin">,
    ) => Promise<SpriteEditorPromoteResult>;
  };
  listGames: () => Promise<string[]>;
  onGenLog: (cb: (chunk: string) => void) => () => void;
  research: (opts: {
    url: string;
    slug: string;
    provider?: string;
  }) => Promise<ResearchResult>;
  onResearchLog: (cb: (chunk: string) => void) => () => void;
  resources: {
    list: () => Promise<ResourcesOverview>;
    validate: () => Promise<ResourcesValidationResult>;
    preview: (path: string) => Promise<ResourcesPreviewResult>;
    reveal: (path: string) => Promise<{ ok: boolean; error?: string }>;
    promoteSkill: (
      candidatePath: string,
      approve: boolean,
    ) => Promise<ResourcesActionResult>;
  };
  transcodeAudio: (opts: {
    files: string[];
    game: string;
    category: string;
    bitrate?: number;
    normalize?: boolean;
    projectId?: string;
  }) => Promise<{ ok: boolean; log: string; outputs: string[] }>;
  pickAudioFiles: () => Promise<string[]>;
  onTranscodeLog: (cb: (chunk: string) => void) => () => void;
  settings: {
    get: () => Promise<Settings>;
    set: (partial: Partial<Settings>) => Promise<Settings>;
  };
  projects: {
    list: () => Promise<ProjectState>;
    add: () => Promise<ProjectState>;
    remove: (id: string) => Promise<ProjectState>;
    setActive: (id: string) => Promise<ProjectState>;
  };
  gyms: {
    list: () => Promise<GymsState>;
    launch: (projectId: string, gymId: string) => Promise<GymLaunchResult>;
  };
  keys: {
    status: () => Promise<Record<string, boolean>>;
    set: (provider: string, key: string) => Promise<Record<string, boolean>>;
  };
  models: {
    list: () => Promise<{
      fal: FalModelInfo[];
      defaultProviderByKind?: Record<string, string>;
      falImageKinds?: string[];
    }>;
  };
  terminal: {
    start: (opts?: {
      cols?: number;
      rows?: number;
      cwd?: string;
    }) => Promise<TerminalStartResult>;
    write: (id: string, data: string) => Promise<boolean>;
    resize: (
      id: string,
      size: { cols: number; rows: number },
    ) => Promise<boolean>;
    stop: (id: string) => Promise<boolean>;
    onData: (cb: (payload: TerminalPayload) => void) => () => void;
    onExit: (cb: (payload: TerminalExitPayload) => void) => () => void;
  };
  gallery: {
    listGames: () => Promise<string[]>;
    list: (
      game: string,
      opts?: { embedBudget?: number },
    ) => Promise<GalleryResult>;
    image: (
      assetPath: string,
    ) => Promise<{ dataUrl: string; bytes: number } | null>;
  };
  moodboard: {
    listGames: () => Promise<string[]>;
    get: (game: string) => Promise<Moodboard>;
    addNote: (game: string, text: string) => Promise<Moodboard>;
    importImages: (game: string) => Promise<Moodboard>;
    updateItem: (
      game: string,
      item: Partial<MoodboardItem> & { id: string },
    ) => Promise<Moodboard>;
    setVisualTarget: (
      game: string,
      id: string,
      visualTarget: boolean,
    ) => Promise<Moodboard>;
    removeItem: (game: string, id: string) => Promise<Moodboard>;
  };
  lab: {
    listGames: () => Promise<string[]>;
    get: (game: string) => Promise<ArtLab>;
    setSubject: (
      game: string,
      subject: string,
      kind: string,
    ) => Promise<ArtLab>;
    addVariant: (game: string, variant: ArtLabVariantInput) => Promise<ArtLab>;
    scoreVariant: (game: string, id: string, score: number) => Promise<ArtLab>;
    tagVariant: (game: string, id: string, tags: string[]) => Promise<ArtLab>;
    annotateVariant: (
      game: string,
      id: string,
      note: string,
    ) => Promise<ArtLab>;
    removeVariant: (game: string, id: string) => Promise<ArtLab>;
    lockVariant: (game: string, id: string) => Promise<ArtLab>;
    clearLock: (game: string) => Promise<ArtLab>;
  };
  maps: {
    listGames: () => Promise<string[]>;
    preview: (opts: MapsGenOptions) => Promise<MapPreviewResult>;
    write: (opts: MapsGenOptions) => Promise<MapWriteResult>;
  };
}
