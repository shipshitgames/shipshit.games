// Ship Shit Games — Studio shell (Electron preload)
// Runs in an isolated context with access to a limited Node surface. We expose a
// tiny, explicit API on `window.studio` via contextBridge. The terminal / node-pty
// and codegen wiring lands in a later issue — this is a typed stub for now.
const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("studio", {
  // Identifying metadata the renderer can show without reaching into Node.
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
  // Placeholder for the future PTY-backed terminal bridge.
  terminal: {
    // eslint-disable-next-line no-unused-vars
    onData: (_listener) => {
      // no-op stub — wired up alongside xterm/node-pty later.
      return () => {};
    },
    write: (_data) => {
      // no-op stub.
    },
  },
});
