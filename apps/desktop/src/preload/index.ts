// Ship Shit Games — Studio shell (Electron preload)
// Isolated context. Exposes an explicit API on `window.studio` via contextBridge.
import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

import {
  IPC_CHANNELS,
  IPC_EVENT_CHANNELS,
  type StudioApi,
  type StudioEventPayloads,
} from "../shared/ipc";

function subscribe<Channel extends keyof StudioEventPayloads>(
  channel: Channel,
  callback: (payload: StudioEventPayloads[Channel]) => void,
): () => void {
  const handler = (_event: IpcRendererEvent, payload: StudioEventPayloads[Channel]) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const studioApi: StudioApi = {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
  // Asset generation (runs @shipshitgames/assetgen in the main process).
  generate: (opts) => ipcRenderer.invoke(IPC_CHANNELS.studioGenerate, opts),
  // Pixelize (#66): re-grade a generated sprite onto the true DOOM pixel grid
  // (rembg/flood-fill cutout → box-downscale → palette-lock), for a before/after.
  pixelize: (opts) => ipcRenderer.invoke(IPC_CHANNELS.studioPixelize, opts),
  sprites: {
    list: (projectId, game) => ipcRenderer.invoke(IPC_CHANNELS.spritesList, { projectId, game }),
    load: (projectId, game, asset) => ipcRenderer.invoke(IPC_CHANNELS.spritesLoad, { projectId, game, asset }),
    saveDraft: (opts) => ipcRenderer.invoke(IPC_CHANNELS.spritesSaveDraft, opts),
    promote: (projectId, game, asset) => ipcRenderer.invoke(IPC_CHANNELS.spritesPromote, { projectId, game, asset }),
  },
  listGames: () => ipcRenderer.invoke(IPC_CHANNELS.studioListGames),
  // Live generation log stream. Returns an unsubscribe fn.
  onGenLog: (cb) => subscribe(IPC_CHANNELS.studioGenLog, cb),
  // Ressources -> rules (runs @shipshitgames/ressources in the main process).
  research: (opts) => ipcRenderer.invoke(IPC_CHANNELS.studioResearch, opts),
  onResearchLog: (cb) => subscribe(IPC_CHANNELS.studioResearchLog, cb),
  resources: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.resourcesList),
    validate: () => ipcRenderer.invoke(IPC_CHANNELS.resourcesValidate),
    preview: (path) => ipcRenderer.invoke(IPC_CHANNELS.resourcesPreview, { path }),
    reveal: (path) => ipcRenderer.invoke(IPC_CHANNELS.resourcesReveal, { path }),
    promoteSkill: (candidatePath, approve) =>
      ipcRenderer.invoke(IPC_CHANNELS.resourcesPromoteSkill, { candidatePath, approve }),
  },
  // Audio transcode → WebM/Opus (ffmpeg in the main process), with a live log stream.
  transcodeAudio: (opts) => ipcRenderer.invoke(IPC_CHANNELS.studioTranscodeAudio, opts),
  pickAudioFiles: () => ipcRenderer.invoke(IPC_CHANNELS.studioPickAudioFiles),
  onTranscodeLog: (cb) => subscribe(IPC_CHANNELS.studioTranscodeLog, cb),
  // Settings (non-secret) + keychain-backed API keys.
  settings: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.settingsGet),
    set: (partial) => ipcRenderer.invoke(IPC_CHANNELS.settingsSet, partial),
  },
  projects: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.projectsList),
    add: () => ipcRenderer.invoke(IPC_CHANNELS.projectsAdd),
    remove: (id) => ipcRenderer.invoke(IPC_CHANNELS.projectsRemove, id),
    setActive: (id) => ipcRenderer.invoke(IPC_CHANNELS.projectsSetActive, id),
  },
  gyms: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.gymsList),
    launch: (projectId, gymId) => ipcRenderer.invoke(IPC_CHANNELS.gymsLaunch, { projectId, gymId }),
  },
  // Gym checks (#305): boot a gym, wait for its url, drive it with the tester
  // CLI in the main process; progress streams over gyms:check-event.
  gymChecks: {
    start: (projectId, gymId) => ipcRenderer.invoke(IPC_CHANNELS.gymsCheckStart, { projectId, gymId }),
    list: (projectId) => ipcRenderer.invoke(IPC_CHANNELS.gymsCheckList, { projectId }),
    get: (runId) => ipcRenderer.invoke(IPC_CHANNELS.gymsCheckGet, { runId }),
    stop: (runId) => ipcRenderer.invoke(IPC_CHANNELS.gymsCheckStop, { runId }),
    image: (runId, file) => ipcRenderer.invoke(IPC_CHANNELS.gymsCheckImage, { runId, file }),
  },
  onGymCheckEvent: (callback) => subscribe(IPC_EVENT_CHANNELS.gymsCheckEvent, callback),
  keys: {
    status: () => ipcRenderer.invoke(IPC_CHANNELS.keysStatus),
    set: (provider, key) => ipcRenderer.invoke(IPC_CHANNELS.keysSet, { provider, key }),
  },
  // Provider model catalogs (currently fal) for the Settings pickers.
  models: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.studioModels),
  },
  // Interactive terminal (node-pty in the main process, xterm in the renderer).
  terminal: {
    start: (opts) => ipcRenderer.invoke(IPC_CHANNELS.terminalStart, opts),
    write: (id, data) => ipcRenderer.invoke(IPC_CHANNELS.terminalWrite, { id, data }),
    resize: (id, size) => ipcRenderer.invoke(IPC_CHANNELS.terminalResize, { id, ...size }),
    stop: (id) => ipcRenderer.invoke(IPC_CHANNELS.terminalStop, id),
    onData: (cb) => subscribe(IPC_CHANNELS.terminalData, cb),
    onExit: (cb) => subscribe(IPC_CHANNELS.terminalExit, cb),
  },
  // Asset gallery — read-only review of the shared Deadrot assets package.
  gallery: {
    listGames: () => ipcRenderer.invoke(IPC_CHANNELS.galleryListGames),
    list: (game, opts) => ipcRenderer.invoke(IPC_CHANNELS.galleryList, { game, ...(opts || {}) }),
    image: (assetPath) => ipcRenderer.invoke(IPC_CHANNELS.galleryImage, { path: assetPath }),
  },
  moodboard: {
    listGames: () => ipcRenderer.invoke(IPC_CHANNELS.moodboardListGames),
    get: (game) => ipcRenderer.invoke(IPC_CHANNELS.moodboardGet, game),
    addNote: (game, text) => ipcRenderer.invoke(IPC_CHANNELS.moodboardAddNote, { game, text }),
    importImages: (game) => ipcRenderer.invoke(IPC_CHANNELS.moodboardImportImages, game),
    updateItem: (game, item) => ipcRenderer.invoke(IPC_CHANNELS.moodboardUpdateItem, { game, item }),
    setVisualTarget: (game, id, visualTarget) => ipcRenderer.invoke(IPC_CHANNELS.moodboardSetVisualTarget, { game, id, visualTarget }),
    removeItem: (game, id) => ipcRenderer.invoke(IPC_CHANNELS.moodboardRemoveItem, { game, id }),
  },
  // Art-direction lab (#82): subject → styled variants → locked style target.
  lab: {
    listGames: () => ipcRenderer.invoke(IPC_CHANNELS.labListGames),
    get: (game) => ipcRenderer.invoke(IPC_CHANNELS.labGet, game),
    setSubject: (game, subject, kind) => ipcRenderer.invoke(IPC_CHANNELS.labSetSubject, { game, subject, kind }),
    addVariant: (game, variant) => ipcRenderer.invoke(IPC_CHANNELS.labAddVariant, { game, variant }),
    scoreVariant: (game, id, score) => ipcRenderer.invoke(IPC_CHANNELS.labScoreVariant, { game, id, score }),
    tagVariant: (game, id, tags) => ipcRenderer.invoke(IPC_CHANNELS.labTagVariant, { game, id, tags }),
    annotateVariant: (game, id, note) => ipcRenderer.invoke(IPC_CHANNELS.labAnnotateVariant, { game, id, note }),
    removeVariant: (game, id) => ipcRenderer.invoke(IPC_CHANNELS.labRemoveVariant, { game, id }),
    lockVariant: (game, id) => ipcRenderer.invoke(IPC_CHANNELS.labLockVariant, { game, id }),
    clearLock: (game) => ipcRenderer.invoke(IPC_CHANNELS.labClearLock, { game }),
  },
  // Maps generator (#18): seed/validate/preview an ArenaMap layout, then write
  // the typed module + SVG into the Studio's maps dir.
  maps: {
    listGames: () => ipcRenderer.invoke(IPC_CHANNELS.mapsListGames),
    preview: (opts) => ipcRenderer.invoke(IPC_CHANNELS.mapsPreview, opts),
    write: (opts) => ipcRenderer.invoke(IPC_CHANNELS.mapsWrite, opts),
  },
};

contextBridge.exposeInMainWorld("studio", studioApi);
