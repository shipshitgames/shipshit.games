// Ship Shit Games — Studio shell (Electron preload)
// Isolated context. Exposes a small, explicit API on `window.studio` via contextBridge.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("studio", {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
  // Asset generation — runs @shipshit/assetgen in the main process.
  generate: (opts) => ipcRenderer.invoke("studio:generate", opts),
  listGames: () => ipcRenderer.invoke("studio:listGames"),
  // Placeholder for the future PTY-backed terminal bridge.
  terminal: {
    onData: (_listener) => () => {},
    write: (_data) => {},
  },
});
