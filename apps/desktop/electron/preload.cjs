// Ship Shit Games — Studio shell (Electron preload)
// Isolated context. Exposes an explicit API on `window.studio` via contextBridge.
const { contextBridge, ipcRenderer } = require("electron");

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
  // Research → rules (runs @shipshitgames/research in the main process).
  research: (opts) => ipcRenderer.invoke("studio:research", opts),
  onResearchLog: (cb) => {
    const h = (_e, chunk) => cb(chunk);
    ipcRenderer.on("studio:research-log", h);
    return () => ipcRenderer.removeListener("studio:research-log", h);
  },
  // Settings (non-secret) + keychain-backed API keys.
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    set: (partial) => ipcRenderer.invoke("settings:set", partial),
  },
  keys: {
    status: () => ipcRenderer.invoke("keys:status"),
    set: (provider, key) => ipcRenderer.invoke("keys:set", { provider, key }),
  },
});
