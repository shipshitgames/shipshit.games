// Ship Shit Games — Studio shell (Electron main process)
// Loads the Vite dev server in development and the built renderer in production,
// and runs the @shipshit/assetgen pipeline on IPC for the generator panes.
const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { execFile } = require("node:child_process");

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL || "http://localhost:5273";
const isDev = !app.isPackaged && process.env.NODE_ENV !== "production";

// monorepo root = .../apps/desktop/electron -> up 3 ; workspace root = up 4 (sibling game repos).
const MONOREPO = path.join(__dirname, "..", "..", "..");
const WORKSPACE = path.join(MONOREPO, "..");
const ASSETGEN = path.join(MONOREPO, "packages", "assetgen", "src", "cli.ts");
const ALL_GAMES = ["scourge-survivors", "deadlane", "pactfall", "starblight"];
const gameDir = (game) => path.join(WORKSPACE, game === "shared" ? "scourge-survivors" : game);

ipcMain.handle("studio:listGames", () => ALL_GAMES.filter((g) => fs.existsSync(gameDir(g))));

ipcMain.handle("studio:generate", async (_e, opts) => {
  const game = opts?.game || "scourge-survivors";
  const repo = gameDir(game);
  const args = [
    ASSETGEN,
    "--provider", opts?.provider || "codex",
    "--game", game,
    "--kind", opts?.kind || "sprite",
    "--id", opts?.id || "asset",
    "--prompt", opts?.prompt || "",
    "--repo", repo,
  ];
  return await new Promise((resolve) => {
    execFile("bun", args, { cwd: MONOREPO, timeout: 300_000, maxBuffer: 1 << 25 }, async (err, stdout, stderr) => {
      const log = `${stdout || ""}${stderr || ""}`.trim();
      const m = log.match(/\[wrote\] (.+?\.webp)/);
      let dataUrl = null;
      let outPath = null;
      if (m) {
        outPath = m[1].trim();
        try {
          const buf = await fs.promises.readFile(outPath);
          dataUrl = `data:image/webp;base64,${buf.toString("base64")}`;
        } catch {
          /* couldn't read output */
        }
      }
      resolve({ ok: !!m && !err, log: log || String(err || ""), path: outPath, dataUrl });
    });
  });
});

/** @type {BrowserWindow | null} */
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: "#0a0a0a",
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
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  mainWindow.on("closed", () => { mainWindow = null; });
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
