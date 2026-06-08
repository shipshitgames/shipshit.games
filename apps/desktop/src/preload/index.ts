// Ship Shit Games — Studio shell (Electron preload)
// Isolated context. Exposes an explicit API on `window.studio` via contextBridge.
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("studio", {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
  // Asset generation (runs @shipshitgames/assetgen in the main process).
  generate: (opts) => ipcRenderer.invoke("studio:generate", opts),
  listGames: () => ipcRenderer.invoke("studio:listGames"),
  // Live generation log stream. Returns an unsubscribe fn.
  onGenLog: (cb) => {
    const h = (_e, chunk) => cb(chunk);
    ipcRenderer.on("studio:gen-log", h);
    return () => ipcRenderer.removeListener("studio:gen-log", h);
  },
  // Ressources -> rules (runs @shipshitgames/ressources in the main process).
  research: (opts) => ipcRenderer.invoke("studio:research", opts),
  onResearchLog: (cb) => {
    const h = (_e, chunk) => cb(chunk);
    ipcRenderer.on("studio:research-log", h);
    return () => ipcRenderer.removeListener("studio:research-log", h);
  },
  // Audio transcode → WebM/Opus (ffmpeg in the main process), with a live log stream.
  transcodeAudio: (opts) => ipcRenderer.invoke("studio:transcodeAudio", opts),
  pickAudioFiles: () => ipcRenderer.invoke("studio:pickAudioFiles"),
  onTranscodeLog: (cb) => {
    const h = (_e, chunk) => cb(chunk);
    ipcRenderer.on("studio:transcode-log", h);
    return () => ipcRenderer.removeListener("studio:transcode-log", h);
  },
  // Settings (non-secret) + keychain-backed API keys.
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    set: (partial) => ipcRenderer.invoke("settings:set", partial),
  },
  projects: {
    list: () => ipcRenderer.invoke("projects:list"),
    add: () => ipcRenderer.invoke("projects:add"),
    remove: (id) => ipcRenderer.invoke("projects:remove", id),
    setActive: (id) => ipcRenderer.invoke("projects:setActive", id),
  },
  keys: {
    status: () => ipcRenderer.invoke("keys:status"),
    set: (provider, key) => ipcRenderer.invoke("keys:set", { provider, key }),
  },
  // Interactive terminal (node-pty in the main process, xterm in the renderer).
  terminal: {
    start: (opts) => ipcRenderer.invoke("terminal:start", opts),
    write: (id, data) => ipcRenderer.invoke("terminal:write", { id, data }),
    resize: (id, size) => ipcRenderer.invoke("terminal:resize", { id, ...size }),
    stop: (id) => ipcRenderer.invoke("terminal:stop", id),
    onData: (cb) => {
      const h = (_e, payload) => cb(payload);
      ipcRenderer.on("terminal:data", h);
      return () => ipcRenderer.removeListener("terminal:data", h);
    },
    onExit: (cb) => {
      const h = (_e, payload) => cb(payload);
      ipcRenderer.on("terminal:exit", h);
      return () => ipcRenderer.removeListener("terminal:exit", h);
    },
  },
  // Asset gallery — read-only review of the shared Deadrot assets package.
  gallery: {
    listGames: () => ipcRenderer.invoke("gallery:listGames"),
    list: (game, opts) => ipcRenderer.invoke("gallery:list", { game, ...(opts || {}) }),
    image: (assetPath) => ipcRenderer.invoke("gallery:image", { path: assetPath }),
  },
  moodboard: {
    listGames: () => ipcRenderer.invoke("moodboard:listGames"),
    get: (game) => ipcRenderer.invoke("moodboard:get", game),
    addNote: (game, text) => ipcRenderer.invoke("moodboard:addNote", { game, text }),
    importImages: (game) => ipcRenderer.invoke("moodboard:importImages", game),
    updateItem: (game, item) => ipcRenderer.invoke("moodboard:updateItem", { game, item }),
    setVisualTarget: (game, id, visualTarget) => ipcRenderer.invoke("moodboard:setVisualTarget", { game, id, visualTarget }),
    removeItem: (game, id) => ipcRenderer.invoke("moodboard:removeItem", { game, id }),
  },
});
