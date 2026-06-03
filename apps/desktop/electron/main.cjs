// Ship Shit Games — Studio shell (Electron main process)
// Loads the Vite dev server in development and the built renderer in production.
const { app, BrowserWindow } = require("electron");
const path = require("node:path");

// Vite dev server URL (kept in sync with vite.config.ts `server.port`).
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL || "http://localhost:5273";

// `app.isPackaged` is false when running unpackaged (e.g. `electron .` during dev).
// We also honor an explicit NODE_ENV so `bun run dev` always points at Vite.
const isDev = !app.isPackaged && process.env.NODE_ENV !== "production";

/** @type {BrowserWindow | null} */
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: "#0a0a0f",
    title: "Ship Shit Games — Studio",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (isDev) {
    mainWindow.loadURL(DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    // Built renderer lives in dist/ relative to the app root.
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  // macOS: re-create a window when the dock icon is clicked and none are open.
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  // Quit on all platforms except macOS, where apps stay alive until Cmd+Q.
  if (process.platform !== "darwin") app.quit();
});
