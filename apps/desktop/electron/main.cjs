// Ship Shit Games — Studio shell (Electron main process)
// Loads Vite in dev / the built renderer in prod; runs @shipshit/assetgen on IPC
// with live streaming, plus settings + keychain-backed key management.
const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { spawn, execFileSync } = require("node:child_process");

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL || "http://localhost:5273";
const isDev = !app.isPackaged && process.env.NODE_ENV !== "production";

const MONOREPO = path.join(__dirname, "..", "..", "..");
const WORKSPACE = path.join(MONOREPO, "..");
const ASSETGEN = path.join(MONOREPO, "packages", "assetgen", "src", "cli.ts");
const ALL_GAMES = ["scourge-survivors", "deadlane", "pactfall", "starblight"];
const gameDir = (g) => path.join(WORKSPACE, g === "shared" ? "scourge-survivors" : g);

// ---- settings (non-secret) ----
const settingsPath = () => path.join(app.getPath("userData"), "settings.json");
const DEFAULTS = { defaultProvider: "codex", defaultGame: "scourge-survivors" };
function readSettings() {
  try { return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(settingsPath(), "utf8")) }; }
  catch { return { ...DEFAULTS }; }
}
function writeSettings(s) {
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(s, null, 2));
  return s;
}

// ---- keys (macOS keychain, shipcode-style) ----
const KEY_SERVICES = { openai: "shipshit-openai", fal: "shipshit-fal", replicate: "shipshit-replicate" };
function hasKey(service) {
  try {
    const v = execFileSync("security", ["find-generic-password", "-a", "shipshit", "-s", service, "-w"], { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    return !!v;
  } catch { return false; }
}
function setKey(service, key) {
  try { execFileSync("security", ["add-generic-password", "-U", "-a", "shipshit", "-s", service, "-w", key], { stdio: "ignore" }); return true; }
  catch { return false; }
}
function keyStatus() {
  const out = {};
  for (const [k, s] of Object.entries(KEY_SERVICES)) out[k] = hasKey(s);
  return out;
}

ipcMain.handle("settings:get", () => readSettings());
ipcMain.handle("settings:set", (_e, partial) => writeSettings({ ...readSettings(), ...(partial || {}) }));
ipcMain.handle("keys:status", () => keyStatus());
ipcMain.handle("keys:set", (_e, { provider, key }) => { const s = KEY_SERVICES[provider]; if (s && key) setKey(s, key); return keyStatus(); });
ipcMain.handle("studio:listGames", () => ALL_GAMES.filter((g) => fs.existsSync(gameDir(g))));

ipcMain.handle("studio:generate", async (e, opts) => {
  const settings = readSettings();
  const game = opts?.game || settings.defaultGame;
  const provider = opts?.provider || settings.defaultProvider;
  const repo = gameDir(game);
  const args = [ASSETGEN, "--provider", provider, "--game", game, "--kind", opts?.kind || "sprite", "--id", opts?.id || "asset", "--prompt", opts?.prompt || "", "--repo", repo];
  const send = (chunk) => { if (!e.sender.isDestroyed()) e.sender.send("studio:gen-log", chunk); };
  send(`$ assetgen --provider ${provider} --game ${game} --kind ${opts?.kind || "sprite"} --id ${opts?.id}\n`);
  return await new Promise((resolve) => {
    let child;
    try { child = spawn("bun", args, { cwd: MONOREPO }); }
    catch (err) { send(`spawn failed: ${err}\n`); return resolve({ ok: false, log: String(err), path: null, dataUrl: null }); }
    let buf = "";
    const onData = (d) => { const s = d.toString(); buf += s; send(s); };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("error", (err) => { send(`\nprocess error: ${err}\n`); });
    const killer = setTimeout(() => { try { child.kill("SIGKILL"); send("\n[timed out after 300s]\n"); } catch {} }, 300_000);
    child.on("close", async (code) => {
      clearTimeout(killer);
      const m = buf.match(/\[wrote\] (.+?\.webp)/);
      let dataUrl = null, outPath = null;
      if (m) { outPath = m[1].trim(); try { dataUrl = `data:image/webp;base64,${(await fs.promises.readFile(outPath)).toString("base64")}`; } catch {} }
      send(`\n[exit ${code}]\n`);
      resolve({ ok: code === 0 && !!m, log: buf, path: outPath, dataUrl });
    });
  });
});

/** @type {BrowserWindow | null} */
let mainWindow = null;
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440, height: 900, minWidth: 960, minHeight: 600,
    backgroundColor: "#0a0a0a", title: "Ship Shit Games — Studio", autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  if (isDev) { mainWindow.loadURL(DEV_SERVER_URL); mainWindow.webContents.openDevTools({ mode: "detach" }); }
  else { mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html")); }
  mainWindow.on("closed", () => { mainWindow = null; });
}
app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
