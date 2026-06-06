// Ship Shit Games — Studio shell (Electron main process)
// Loads Vite in dev / the built renderer in prod; runs @shipshitgames/assetgen on IPC
// with live streaming, plus settings + keychain-backed key management.
const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { spawn, execFileSync } = require("node:child_process");

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL || "http://localhost:5273";
const isDev = !app.isPackaged && process.env.NODE_ENV !== "production";

const STUDIO_REPO = path.join(__dirname, "..", "..", "..");
const WORKSPACE = path.join(STUDIO_REPO, "..");
const GAMES_ROOT = path.join(WORKSPACE, "games");
const ASSETGEN = path.join(STUDIO_REPO, "packages", "assetgen", "src", "cli.ts");
const RESSOURCES = path.join(STUDIO_REPO, "packages", "ressources", "src", "cli.ts");
const DEFAULT_GAME = "scourge-survivors";
const ALL_GAMES = ["scourge-survivors", "deadlane", "pactfall", "starblight"];
const gameDir = (g) => path.join(GAMES_ROOT, g === "shared" ? DEFAULT_GAME : g);

// ---- settings (non-secret) ----
const settingsPath = () => path.join(app.getPath("userData"), "settings.json");
const DEFAULTS = { defaultProvider: "codex", defaultGame: DEFAULT_GAME };
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

// ---- audio transcode (ffmpeg → WebM/Opus, the studio audio format) ----
// GUI apps inherit a minimal PATH, so resolve ffmpeg from common install locations.
function resolveFfmpeg() {
  const cands = [process.env.FFMPEG, "/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/usr/bin/ffmpeg"];
  for (const c of cands) { if (c && fs.existsSync(c)) return c; }
  try { const w = execFileSync("/bin/sh", ["-lc", "command -v ffmpeg"]).toString().trim(); if (w) return w; } catch {}
  return "ffmpeg"; // last resort: hope it's on PATH
}
const AUDIO_CATEGORIES = ["sfx", "music", "voice"];
const audioSlug = (file) => path.basename(file).replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

ipcMain.handle("studio:pickAudioFiles", async () => {
  const r = await dialog.showOpenDialog({
    title: "Pick source audio to transcode",
    properties: ["openFile", "multiSelections"],
    filters: [{ name: "Audio", extensions: ["mp3", "wav", "flac", "aac", "m4a", "ogg", "aiff", "opus", "webm"] }],
  });
  return r.canceled ? [] : r.filePaths;
});

// Transcode any audio → WebM/Opus into a game's src/assets/audio/<category>/, mirroring
// the asset pipeline's "encode finals to .webm/opus" rule. Strips non-audio streams
// (cover art); optional loudnorm. Streams an ffmpeg log like studio:generate.
ipcMain.handle("studio:transcodeAudio", async (e, opts) => {
  const files = Array.isArray(opts?.files) ? opts.files : [];
  const game = opts?.game || readSettings().defaultGame;
  const category = AUDIO_CATEGORIES.includes(opts?.category) ? opts.category : "music";
  const bitrate = Math.max(32, Math.min(320, Number(opts?.bitrate) || 128));
  const normalize = !!opts?.normalize;
  const outDir = path.join(gameDir(game), "src", "assets", "audio", category);
  const send = (chunk) => { if (!e.sender.isDestroyed()) e.sender.send("studio:transcode-log", chunk); };
  if (!files.length) { send("no files selected\n"); return { ok: false, log: "no files", outputs: [] }; }
  const ffmpeg = resolveFfmpeg();
  fs.mkdirSync(outDir, { recursive: true });
  const outputs = [];
  let log = "";
  for (const input of files) {
    const out = path.join(outDir, `${audioSlug(input)}.webm`);
    const args = ["-hide_banner", "-loglevel", "error", "-y", "-i", input, "-map", "0:a", "-c:a", "libopus", "-b:a", `${bitrate}k`];
    if (normalize) args.push("-af", "loudnorm");
    args.push(out);
    send(`$ ffmpeg -i ${path.basename(input)} → audio/${category}/${path.basename(out)} (opus ${bitrate}k${normalize ? ", loudnorm" : ""})\n`);
    const code = await new Promise((resolve) => {
      let child;
      try { child = spawn(ffmpeg, args); }
      catch (err) { send(`spawn failed: ${err}\n`); return resolve(-1); }
      child.stdout.on("data", (d) => { const s = d.toString(); log += s; send(s); });
      child.stderr.on("data", (d) => { const s = d.toString(); log += s; send(s); });
      child.on("error", (err) => { send(`\nffmpeg error: ${err} — is ffmpeg installed and on PATH?\n`); });
      child.on("close", resolve);
    });
    if (code === 0) { outputs.push(out); send(`✓ ${out}\n`); }
    else send(`✗ ffmpeg exited ${code} for ${path.basename(input)}\n`);
  }
  send(`\n[done: ${outputs.length}/${files.length} → ${path.relative(WORKSPACE, outDir)}]\n`);
  send("Remember to register each track in the game's assets.json with a license record.\n");
  return { ok: outputs.length === files.length, log, outputs };
});

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
    try { child = spawn("bun", args, { cwd: STUDIO_REPO }); }
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

// Research → rules: drives @shipshitgames/ressources over a streaming log, same shape as
// studio:generate. Writes the ruleset into the repo under docs/rules/ by default.
ipcMain.handle("studio:research", async (e, opts) => {
  // research only distills with codex | mock; ignore the image-gen default provider.
  const provider = opts?.provider === "mock" ? "mock" : "codex";
  const url = (opts?.url || "").trim();
  const slug = (opts?.slug || "ruleset").replace(/[^a-z0-9-]+/gi, "-").toLowerCase();
  const out = path.join(STUDIO_REPO, "docs", "rules", `${slug}.md`);
  const send = (chunk) => { if (!e.sender.isDestroyed()) e.sender.send("studio:research-log", chunk); };
  if (!url) { send("no url provided\n"); return { ok: false, log: "no url", path: null, rules: null }; }
  const args = [RESSOURCES, "distill", "--url", url, "--provider", provider, "--out", out];
  send(`$ ressources distill --url ${url} --provider ${provider} --out ${out}\n`);
  return await new Promise((resolve) => {
    let child;
    try { child = spawn("bun", args, { cwd: STUDIO_REPO, env: process.env }); }
    catch (err) { send(`spawn failed: ${err}\n`); return resolve({ ok: false, log: String(err), path: null, rules: null }); }
    let buf = "";
    const onData = (d) => { const s = d.toString(); buf += s; send(s); };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("error", (err) => { send(`\nprocess error: ${err}\n`); });
    const killer = setTimeout(() => { try { child.kill("SIGKILL"); send("\n[timed out after 300s]\n"); } catch {} }, 300_000);
    child.on("close", async (code) => {
      clearTimeout(killer);
      const m = buf.match(/\[wrote\] (.+?\.md)/);
      let outPath = null, rules = null;
      if (m) { outPath = m[1].trim(); try { rules = await fs.promises.readFile(outPath, "utf8"); } catch {} }
      send(`\n[exit ${code}]\n`);
      resolve({ ok: code === 0 && !!m, log: buf, path: outPath, rules });
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
