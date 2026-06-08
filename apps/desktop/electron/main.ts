// Ship Shit Games — Studio shell (Electron main process)
// Loads Vite in dev / the built renderer in prod; runs @shipshitgames/assetgen on IPC
// with live streaming, plus settings + keychain-backed key management.
import { app, BrowserWindow, ipcMain, dialog } from "electron";
import path from "node:path";
import fs from "node:fs";
import { spawn, execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { readSharedGameSlugs } from "./game-slugs.cjs";
import { createTerminalManager, terminalShell } from "./terminal-manager.cjs";
import {
  manifestPathForRepo,
  projectFromRepoPath,
  summarizeProject,
  uniqueProjects,
} from "./projects.cjs";
import { createMoodboardStore } from "./moodboards.cjs";
// Single, shared manifest writer + license validator (issue #17). The Electron
// main process is bundled from TypeScript (vite-plugin-electron), so it imports
// assetgen's register() directly — no CommonJS shim, one writer for both runtimes.
import { register } from "../../../packages/assetgen/src/manifest.ts";

// node-pty is a native addon kept external from the bundle; load it through a
// runtime require so an ABI/load failure degrades gracefully instead of crashing.
const nodeRequire = createRequire(__filename);
let pty = null;
try {
  pty = nodeRequire("node-pty");
} catch (error) {
  console.warn(
    "node-pty failed to load; terminal IPC will report unavailable. " +
      "Run `bun run rebuild:native` in apps/desktop to build it against Electron's ABI.",
    error,
  );
}

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL || "http://localhost:5273";
const isDev = !app.isPackaged && process.env.NODE_ENV !== "production";

// The bundled main lives at <repo>/apps/desktop/dist-electron/main, so __dirname
// no longer points at the package. app.getAppPath() resolves to <repo>/apps/desktop
// in dev regardless of bundle depth; the studio repo root is two levels up.
const STUDIO_REPO = path.resolve(app.getAppPath(), "..", "..");
const WORKSPACE = path.join(STUDIO_REPO, "..");
const DEADROT_GAMES_ROOT = path.join(WORKSPACE, "deadrotcom", "apps", "games");
const LEGACY_GAMES_ROOT = path.join(WORKSPACE, "games");
const GAMES_ROOT = fs.existsSync(DEADROT_GAMES_ROOT) ? DEADROT_GAMES_ROOT : LEGACY_GAMES_ROOT;
const ASSETGEN = path.join(STUDIO_REPO, "packages", "assetgen", "src", "cli.ts");
const RESSOURCES = path.join(STUDIO_REPO, "packages", "ressources", "src", "cli.ts");
const DEFAULT_GAME = "scourge-survivors";
// The Studio shells out to `bun` against TS source in the monorepo, so it must run
// from a checked-out repo (dev via `electron .`). If STUDIO_REPO mis-resolves — e.g.
// a packaged .dmg, where app.getAppPath() points inside the asar — surface it once at
// startup instead of failing silently deep inside a generate/research/terminal handler.
if (!fs.existsSync(ASSETGEN)) {
  console.warn(
    `[studio] assetgen CLI not found at ${ASSETGEN} (STUDIO_REPO=${STUDIO_REPO}). ` +
      "The Studio must run from a monorepo checkout (bun run dev), not a packaged build; " +
      "generate/research/terminal/game-discovery will be unavailable.",
  );
}
const GAME_SLUGS = readSharedGameSlugs(STUDIO_REPO);
// Full static game catalogue surfaced to the moodboard picker (moodboard:listGames).
const ALL_GAMES = GAME_SLUGS;
const gameDir = (g) => path.join(GAMES_ROOT, g === "shared" ? DEFAULT_GAME : g);
const terminalManager = createTerminalManager({
  pty,
  cwd: STUDIO_REPO,
  env: process.env,
  shell: terminalShell(process.platform, process.env),
});
const moodboards = createMoodboardStore({
  rootDir: () => path.join(app.getPath("userData"), "moodboards"),
});

// ---- settings (non-secret) ----
const settingsPath = () => path.join(app.getPath("userData"), "settings.json");
const PROVIDERS = new Set(["codex", "openai", "fal", "replicate", "suno", "mock"]);
const DEFAULT_PROVIDER_BY_KIND = {
  sprite: "codex",
  texture: "openai",
  icon: "openai",
  map: "codex",
  music: "suno",
  sfx: "suno",
  voice: "suno",
  model: "replicate",
  "3d": "replicate",
};
const DEFAULTS = {
  defaultProvider: "codex",
  defaultGame: DEFAULT_GAME,
  providerDefaults: DEFAULT_PROVIDER_BY_KIND,
  activeProjectId: "",
  projects: [],
};
function readSettings() {
  try { return normalizeSettings({ ...DEFAULTS, ...JSON.parse(fs.readFileSync(settingsPath(), "utf8")) }); }
  catch { return { ...DEFAULTS }; }
}
function writeSettings(s) {
  s = normalizeSettings(s);
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(s, null, 2));
  return s;
}
function normalizeSettings(raw) {
  const providerDefaults = { ...DEFAULT_PROVIDER_BY_KIND, ...(raw?.providerDefaults || {}) };
  for (const [kind, provider] of Object.entries(providerDefaults) as [string, string][]) {
    providerDefaults[kind] = PROVIDERS.has(provider) ? provider : (DEFAULT_PROVIDER_BY_KIND[kind] || "codex");
  }
  const projects = uniqueProjects(Array.isArray(raw?.projects) ? raw.projects : []);
  const activeProjectId = typeof raw?.activeProjectId === "string" ? raw.activeProjectId : "";
  return {
    defaultProvider: PROVIDERS.has(raw?.defaultProvider) ? raw.defaultProvider : "codex",
    defaultGame: typeof raw?.defaultGame === "string" ? raw.defaultGame : DEFAULT_GAME,
    providerDefaults,
    activeProjectId,
    projects,
  };
}
function mergeSettings(partial) {
  const current = readSettings();
  return writeSettings({
    ...current,
    ...(partial || {}),
    providerDefaults: {
      ...current.providerDefaults,
      ...(partial?.providerDefaults || {}),
    },
  });
}
function providerForKind(settings, kind, explicit) {
  if (explicit && PROVIDERS.has(explicit)) return explicit;
  return settings.providerDefaults?.[kind] || settings.defaultProvider || DEFAULT_PROVIDER_BY_KIND[kind] || "codex";
}

// ---- local game projects ----
function discoveredProjects() {
  return GAME_SLUGS
    .map((slug) => ({ slug, repoPath: gameDir(slug) }))
    .filter((p) => fs.existsSync(p.repoPath))
    .map((p) => projectFromRepoPath(p.repoPath, { slug: p.slug, name: p.slug, source: "discovered" }));
}

function allProjects(settings = readSettings()) {
  return uniqueProjects([...(settings.projects || []), ...discoveredProjects()]);
}

function listProjectState(settings = readSettings()) {
  const projects = allProjects(settings);
  const activeProjectId = settings.activeProjectId && projects.some((p) => p.id === settings.activeProjectId)
    ? settings.activeProjectId
    : projects[0]?.id || "";
  const summaries = projects.map((project) => summarizeProject(project, activeProjectId)).filter(Boolean);
  const active = summaries.find((project) => project.id === activeProjectId) || summaries[0] || null;
  return {
    projects: summaries,
    activeProjectId: active?.id || "",
    activeManifestPath: active?.manifestPath || null,
  };
}

function persistProjects(projects, activeProjectId) {
  const registered = uniqueProjects(projects).filter((project) => project.source !== "discovered");
  const active = allProjects({ ...readSettings(), projects: registered, activeProjectId }).find((p) => p.id === activeProjectId);
  return mergeSettings({
    projects: registered,
    activeProjectId: activeProjectId || "",
    defaultGame: active?.slug || readSettings().defaultGame,
  });
}

function resolveProjectTarget(opts: any = {}) {
  const settings = readSettings();
  const projects = allProjects(settings);
  const requestedProjectId = typeof opts.projectId === "string" ? opts.projectId : "";
  const requestedGame = typeof opts.game === "string" ? opts.game : "";
  let project = projects.find((p) => p.id === requestedProjectId);
  if (!project && requestedGame) project = projects.find((p) => p.slug === requestedGame);
  if (!project && settings.activeProjectId) project = projects.find((p) => p.id === settings.activeProjectId);
  if (!project && requestedGame) {
    project = projectFromRepoPath(gameDir(requestedGame), { slug: requestedGame, name: requestedGame, source: "discovered" });
  }
  if (!project) {
    const slug = settings.defaultGame || DEFAULT_GAME;
    project = projectFromRepoPath(gameDir(slug), { slug, name: slug, source: "discovered" });
  }
  return {
    ...project,
    manifestPath: manifestPathForRepo(project.repoPath),
  };
}

// ---- keys (macOS keychain, shipcode-style) ----
const KEY_SERVICES = { openai: "shipshit-openai", fal: "shipshit-fal", replicate: "shipshit-replicate", suno: "shipshit-suno" };
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
ipcMain.handle("settings:set", (_e, partial) => mergeSettings(partial));
ipcMain.handle("keys:status", () => keyStatus());
ipcMain.handle("keys:set", (_e, { provider, key }) => { const s = KEY_SERVICES[provider]; if (s && key) setKey(s, key); return keyStatus(); });
ipcMain.handle("studio:listGames", () => listProjectState().projects.map((project) => project.slug));
ipcMain.handle("projects:list", () => listProjectState());
ipcMain.handle("projects:add", async () => {
  const result = await dialog.showOpenDialog({
    title: "Add local game repo",
    properties: ["openDirectory"],
  });
  if (result.canceled || !result.filePaths[0]) return listProjectState();
  const project = projectFromRepoPath(result.filePaths[0], { source: "registered" });
  const settings = readSettings();
  persistProjects([...(settings.projects || []), project], project.id);
  return listProjectState();
});
ipcMain.handle("projects:remove", (_e, id) => {
  const settings = readSettings();
  const projects = (settings.projects || []).filter((project) => project.id !== id);
  const nextActive = settings.activeProjectId === id ? "" : settings.activeProjectId;
  persistProjects(projects, nextActive);
  return listProjectState();
});
ipcMain.handle("projects:setActive", (_e, id) => {
  const settings = readSettings();
  const project = allProjects(settings).find((candidate) => candidate.id === id);
  if (!project) return listProjectState(settings);
  persistProjects(settings.projects || [], project.id);
  return listProjectState();
});

ipcMain.handle("terminal:start", (e, opts) => {
  e.sender.once("destroyed", () => terminalManager.disposeForWebContents(e.sender.id));
  return terminalManager.start(e.sender, opts);
});
ipcMain.handle("terminal:write", (e, { id, data }) => terminalManager.write(e.sender, id, data));
ipcMain.handle("terminal:resize", (e, { id, cols, rows }) => terminalManager.resize(e.sender, id, { cols, rows }));
ipcMain.handle("terminal:stop", (e, id) => terminalManager.stop(e.sender, id));

ipcMain.handle("moodboard:listGames", () => ALL_GAMES);
ipcMain.handle("moodboard:get", (_e, game) => moodboards.readBoard(game || readSettings().defaultGame));
ipcMain.handle("moodboard:addNote", (_e, payload = {}) => moodboards.addNote(payload.game || readSettings().defaultGame, payload.text));
ipcMain.handle("moodboard:updateItem", (_e, payload = {}) => moodboards.updateItem(payload.game || readSettings().defaultGame, payload.item));
ipcMain.handle("moodboard:setVisualTarget", (_e, payload = {}) => moodboards.setVisualTarget(payload.game || readSettings().defaultGame, payload.id, payload.visualTarget));
ipcMain.handle("moodboard:removeItem", (_e, payload = {}) => moodboards.removeItem(payload.game || readSettings().defaultGame, payload.id));
ipcMain.handle("moodboard:importImages", async (_e, game) => {
  const r = await dialog.showOpenDialog({
    title: "Import moodboard references",
    properties: ["openFile", "multiSelections"],
    filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif"] }],
  });
  return r.canceled ? moodboards.readBoard(game || readSettings().defaultGame) : moodboards.importImages(game || readSettings().defaultGame, r.filePaths);
});

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

function audioLicense(category, bitrate, normalize) {
  return {
    tool: "ffmpeg",
    plan: `libopus-${bitrate}k${normalize ? "-loudnorm" : ""}`,
    date: new Date().toISOString().slice(0, 10),
    kind: category,
  };
}

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
  const target = resolveProjectTarget(opts);
  const game = target.slug;
  const category = AUDIO_CATEGORIES.includes(opts?.category) ? opts.category : "music";
  const bitrate = Math.max(32, Math.min(320, Number(opts?.bitrate) || 128));
  const normalize = !!opts?.normalize;
  const outDir = path.join(target.repoPath, "src", "assets", "audio", category);
  const send = (chunk) => { if (!e.sender.isDestroyed()) e.sender.send("studio:transcode-log", chunk); };
  if (!files.length) { send("no files selected\n"); return { ok: false, log: "no files", outputs: [] }; }
  const ffmpeg = resolveFfmpeg();
  fs.mkdirSync(outDir, { recursive: true });
  const outputs = [];
  let log = "";
  send(`[target] ${game}\n`);
  send(`[manifest] ${target.manifestPath}\n`);
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
    if (code === 0) {
      try {
        await register(target.manifestPath, {
          id: audioSlug(input),
          kind: category,
          game,
          path: path.posix.join("audio", category, path.basename(out)),
          provider: "ffmpeg",
          license: audioLicense(category, bitrate, normalize),
        });
        outputs.push(out);
        send(`✓ ${out}\n`);
        send(`[manifest] ${target.manifestPath} updated\n`);
      } catch (err) {
        send(`✗ manifest registration failed for ${path.basename(out)}: ${err?.message || err}\n`);
      }
    } else send(`✗ ffmpeg exited ${code} for ${path.basename(input)}\n`);
  }
  send(`\n[done: ${outputs.length}/${files.length} → ${path.relative(WORKSPACE, outDir)}]\n`);
  send("Registered completed outputs in the game's assets.json with a license record.\n");
  return { ok: outputs.length === files.length, log, outputs };
});

ipcMain.handle("studio:generate", async (e, opts) => {
  const settings = readSettings();
  const target = resolveProjectTarget(opts);
  const game = target.slug || opts?.game || settings.defaultGame;
  const kind = opts?.kind || "sprite";
  const provider = providerForKind(settings, kind, opts?.provider);
  const repo = target.repoPath;
  const args = [ASSETGEN, "--provider", provider, "--game", game, "--kind", kind, "--id", opts?.id || "asset", "--prompt", opts?.prompt || "", "--repo", repo];
  if (opts?.views) args.push("--views", String(opts.views));
  if (opts?.frames) args.push("--frames", String(opts.frames));
  if (opts?.fps) args.push("--fps", String(opts.fps));
  if (opts?.anchor) args.push("--anchor", String(opts.anchor));
  if (opts?.scale) args.push("--scale", String(opts.scale));
  if (opts?.license) args.push("--license", String(opts.license));
  if (opts?.licenseUrl) args.push("--license-url", String(opts.licenseUrl));
  const send = (chunk) => { if (!e.sender.isDestroyed()) e.sender.send("studio:gen-log", chunk); };
  send(`$ assetgen --provider ${provider} --game ${game} --kind ${kind} --id ${opts?.id}\n`);
  send(`[repo] ${repo}\n`);
  send(`[manifest] ${target.manifestPath}\n`);
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
      const p = buf.match(/\[billboard\] (.+?\.html)/);
      let dataUrl = null, outPath = null, previewPath = null;
      if (m) { outPath = m[1].trim(); try { dataUrl = `data:image/webp;base64,${(await fs.promises.readFile(outPath)).toString("base64")}`; } catch {} }
      if (p) previewPath = p[1].trim();
      send(`\n[exit ${code}]\n`);
      resolve({ ok: code === 0 && !!m, log: buf, path: outPath, dataUrl, previewPath });
    });
  });
});

// Ressources -> rules: drives @shipshitgames/ressources over a streaming log, same shape as
// studio:generate. Writes the ruleset into the repo under docs/rules/ by default.
ipcMain.handle("studio:research", async (e, opts) => {
  // Ressources only distills with codex | mock; ignore the image-gen default provider.
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
    webPreferences: { preload: path.join(__dirname, "..", "preload", "index.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  if (isDev) { mainWindow.loadURL(DEV_SERVER_URL); mainWindow.webContents.openDevTools({ mode: "detach" }); }
  else { mainWindow.loadFile(path.join(__dirname, "..", "..", "dist", "index.html")); }
  mainWindow.on("closed", () => { terminalManager.disposeAll(); mainWindow = null; });
}
app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("before-quit", () => terminalManager.disposeAll());
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
