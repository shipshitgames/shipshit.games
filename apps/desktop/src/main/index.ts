// Ship Shit Games — Studio shell (Electron main process)
// Loads Vite in dev / the built renderer in prod; runs @shipshitgames/assetgen on IPC
// with live streaming, plus settings + keychain-backed key management.
import { app, BrowserWindow, ipcMain, dialog, shell as electronShell } from "electron";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { spawn, execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { readAssetBaseUrl } from "@shipshitgames/shared";
import { IPC_CHANNELS } from "../shared/ipc";
import { readSharedGameSlugs } from "./game-slugs";
import { createTerminalManager, terminalShell } from "./terminal-manager";
import { hardenWindow } from "./window-security";
import { projectFromRepoPath } from "./projects";
import { createProjectState } from "./project-state";
import { createMoodboardStore } from "./moodboards";
import { createArtLabStore } from "./art-lab";
import { createMapsStore } from "./maps";
import { createGallery } from "./gallery";
import { createGymLauncher } from "./gyms";
import { createSpriteEditorStore } from "./sprite-editor";
import { DEFAULT_GAME } from "./settings";
import { buildGenerateArgs } from "./generate-args";
import { buildPixelizeArgs, decodePixelizeDataUrl, parsePixelizeCutout } from "./pixelize-args";
import { parseGenerateResult, dataUrlFor } from "./generate-result";
import { parseWroteLine, streamCommand } from "./stream-command";
import {
  fingerprintResourceFile,
  parseResourceInventory,
  parseResourceValidation,
  RESOURCE_INVENTORY_KINDS,
  resolveRealSkillCandidatePath,
  resolveResourceDerivativePath,
  SkillPromotionReviewGate,
} from "./resources";
import {
  AUDIO_CATEGORIES,
  audioLicense,
  audioSlug,
  resolveFfmpeg,
} from "./audio-transcode";
// Single, shared manifest writer + license validator (issue #17). The Electron
// main process is bundled from TypeScript (vite-plugin-electron), so it imports
// assetgen's register() directly — no CommonJS shim, one writer for both runtimes.
import { register } from "../../../../packages/assetgen/src/manifest.ts";
// Model catalogs + canonical kind→provider routing for the renderer's pickers,
// served over studio:models so the renderer no longer keeps drifted copies (#194).
// Pure + bundle-safe (no sharp/node-pty); the payload builder is unit-tested.
import { studioModelsPayload } from "./models-catalog";

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

if (process.env.SSG_DESKTOP_E2E_USER_DATA) {
  app.setPath("userData", process.env.SSG_DESKTOP_E2E_USER_DATA);
}

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL || "http://localhost:5273";
const isDev = !app.isPackaged && process.env.NODE_ENV !== "production";

// The bundled main lives at <repo>/apps/desktop/dist/main, so __dirname
// no longer points at the package. app.getAppPath() resolves to <repo>/apps/desktop
// in dev regardless of bundle depth; the studio repo root is two levels up.
const STUDIO_REPO = path.resolve(app.getAppPath(), "..", "..");
const WORKSPACE = path.join(STUDIO_REPO, "..");
const DEADROT_GAMES_ROOT = path.join(WORKSPACE, "deadrotcom", "apps", "games");
const LEGACY_GAMES_ROOT = path.join(WORKSPACE, "games");
const GAMES_ROOT = fs.existsSync(DEADROT_GAMES_ROOT) ? DEADROT_GAMES_ROOT : LEGACY_GAMES_ROOT;
const ASSETGEN = path.join(STUDIO_REPO, "packages", "assetgen", "src", "cli.ts");
const RESSOURCES_ROOT = path.join(STUDIO_REPO, "packages", "ressources");
const RESSOURCES = path.join(RESSOURCES_ROOT, "src", "cli.ts");
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
// Art Direction Lab (#82): per-game look-dev — generate styled variants of one
// subject, score/tag/annotate them, then lock the winner into a pipeline-readable
// style-target contract (lock.json). Studio-owned userData storage, like the
// moodboard; consuming the lock in the pipeline is a separate card (#56).
const artLab = createArtLabStore({
  rootDir: () => path.join(app.getPath("userData"), "art-lab"),
});
// Maps generator (#18): seeds engine-schema ArenaMap layouts in-process via the
// pure assetgen core. Generated modules land in a Studio-owned maps dir; a human
// copies them into the target game's data/maps.ts (shipped games live out-of-repo).
const maps = createMapsStore({
  rootDir: () => path.join(app.getPath("userData"), "maps"),
});

// Asset gallery reads the shared Deadrot @shipshitgames/assets package — the source
// of truth for shipped game art. Prefer the sibling Deadrot checkout; fall back to a
// co-located packages/assets for older layouts.
const ASSETS_PKG_CANDIDATES = [
  path.join(WORKSPACE, "deadrotcom", "packages", "assets"),
  path.join(WORKSPACE, "packages", "assets"),
  path.join(STUDIO_REPO, "packages", "assets"),
];
const gallery = createGallery({
  assetsRoot: () => ASSETS_PKG_CANDIDATES.find((p) => fs.existsSync(path.join(p, "games"))) || null,
  assetBaseUrl: () => readAssetBaseUrl(process.env),
});
const spriteEditor = createSpriteEditorStore();

function runResourcesCommand(
  args: string[],
  send: ((chunk: string) => void) | null = null,
  timeoutMs = 60_000,
): Promise<{ code: number | null; stdout: string; stderr: string; log: string }> {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn("bun", [RESSOURCES, ...args], { cwd: STUDIO_REPO, env: process.env });
    } catch (error) {
      const message = `spawn failed: ${error}\n`;
      send?.(message);
      resolve({ code: -1, stdout: "", stderr: message, log: message });
      return;
    }

    let stdout = "";
    let stderr = "";
    const onStdout = (data) => {
      const chunk = data.toString();
      stdout += chunk;
      send?.(chunk);
    };
    const onStderr = (data) => {
      const chunk = data.toString();
      stderr += chunk;
      send?.(chunk);
    };
    child.stdout.on("data", onStdout);
    child.stderr.on("data", onStderr);
    child.on("error", (error) => {
      const chunk = `\nprocess error: ${error}\n`;
      stderr += chunk;
      send?.(chunk);
    });
    const killer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
        const chunk = `\n[timed out after ${Math.round(timeoutMs / 1000)}s]\n`;
        stderr += chunk;
        send?.(chunk);
      } catch {}
    }, timeoutMs);
    child.on("close", (code) => {
      clearTimeout(killer);
      resolve({ code, stdout, stderr, log: `${stdout}${stderr}` });
    });
  });
}

function emptyResourceInventory(kind: string, error: string) {
  return { schemaVersion: 1 as const, kind, count: 0, items: [], errors: [error], warnings: [] };
}

function realDerivativePath(relativePath: unknown): string {
  const resolved = resolveResourceDerivativePath(RESSOURCES_ROOT, relativePath);
  const derivativeRoot = fs.realpathSync(path.join(RESSOURCES_ROOT, "derivatives"));
  const actual = fs.realpathSync(resolved);
  if (actual !== derivativeRoot && !actual.startsWith(`${derivativeRoot}${path.sep}`)) {
    throw new Error("derivative path resolves outside packages/ressources/derivatives");
  }
  return actual;
}

const skillPromotionReviews = new SkillPromotionReviewGate();

// ---- settings (non-secret) ----
// Defaults, normalization, and project orchestration live in pure modules; this
// block only supplies the settings.json file I/O and discovered-game paths.
const settingsPath = () => path.join(app.getPath("userData"), "settings.json");
function readSettingsFile() {
  return JSON.parse(fs.readFileSync(settingsPath(), "utf8"));
}
function writeSettingsFile(settings) {
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2));
}

// ---- local game projects ----
const projectState = createProjectState({
  readSettingsFile,
  writeSettingsFile,
  gameDir,
  gameSlugs: GAME_SLUGS,
  pathExists: fs.existsSync,
});
const {
  allProjects,
  listGames,
  listProjectState,
  mergeSettings,
  persistProjects,
  readSettings,
  resolveGame,
  resolveProjectTarget,
} = projectState;

const gyms = createGymLauncher({
  projects: () => allProjects(),
  activeProjectId: () => listProjectState().activeProjectId,
  spawn,
  openExternal: (url) => electronShell.openExternal(url),
  env: process.env,
});

// ---- keys (macOS keychain, shipcode-style) ----
const KEY_SERVICES = { openai: "shipshit-openai", fal: "shipshit-fal", replicate: "shipshit-replicate", meshy: "shipshit-meshy", tripo: "shipshit-tripo", suno: "shipshit-suno", elevenlabs: "shipshit-elevenlabs", beatoven: "shipshit-beatoven" };
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

ipcMain.handle(IPC_CHANNELS.settingsGet, () => readSettings());
ipcMain.handle(IPC_CHANNELS.settingsSet, (_e, partial) => mergeSettings(partial));
ipcMain.handle(IPC_CHANNELS.keysStatus, () => keyStatus());
ipcMain.handle(IPC_CHANNELS.keysSet, (_e, { provider, key }) => { const s = KEY_SERVICES[provider]; if (s && key) setKey(s, key); return keyStatus(); });
// Model catalogs + canonical routing for the renderer's per-kind pickers —
// single source: assetgen, via the pure (unit-tested) studioModelsPayload builder.
ipcMain.handle(IPC_CHANNELS.studioModels, () => studioModelsPayload());
ipcMain.handle(IPC_CHANNELS.studioListGames, () => listGames());
ipcMain.handle(IPC_CHANNELS.projectsList, () => listProjectState());
ipcMain.handle(IPC_CHANNELS.projectsAdd, async () => {
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
ipcMain.handle(IPC_CHANNELS.projectsRemove, (_e, id) => {
  const settings = readSettings();
  const projects = (settings.projects || []).filter((project) => project.id !== id);
  const nextActive = settings.activeProjectId === id ? "" : settings.activeProjectId;
  persistProjects(projects, nextActive);
  return listProjectState();
});
ipcMain.handle(IPC_CHANNELS.projectsSetActive, (_e, id) => {
  const settings = readSettings();
  const project = allProjects(settings).find((candidate) => candidate.id === id);
  if (!project) return listProjectState(settings);
  persistProjects(settings.projects || [], project.id);
  return listProjectState();
});

ipcMain.handle(IPC_CHANNELS.gymsList, () => gyms.list());
ipcMain.handle(IPC_CHANNELS.gymsLaunch, (_e, payload = {}) => gyms.launch(payload));

ipcMain.handle(IPC_CHANNELS.terminalStart, (e, opts) => {
  e.sender.once("destroyed", () => terminalManager.disposeForWebContents(e.sender.id));
  return terminalManager.start(e.sender, opts);
});
ipcMain.handle(IPC_CHANNELS.terminalWrite, (e, { id, data }) => terminalManager.write(e.sender, id, data));
ipcMain.handle(IPC_CHANNELS.terminalResize, (e, { id, cols, rows }) => terminalManager.resize(e.sender, id, { cols, rows }));
ipcMain.handle(IPC_CHANNELS.terminalStop, (e, id) => terminalManager.stop(e.sender, id));

// Same source of truth as studio:listGames so the moodboard picker shows the same games as the rest of the app.
ipcMain.handle(IPC_CHANNELS.moodboardListGames, () => listGames());
ipcMain.handle(IPC_CHANNELS.moodboardGet, (_e, game) => moodboards.readBoard(resolveGame(game)));
ipcMain.handle(IPC_CHANNELS.moodboardAddNote, (_e, payload = {}) => moodboards.addNote(resolveGame(payload), payload.text));
ipcMain.handle(IPC_CHANNELS.moodboardUpdateItem, (_e, payload = {}) => moodboards.updateItem(resolveGame(payload), payload.item));
ipcMain.handle(IPC_CHANNELS.moodboardSetVisualTarget, (_e, payload = {}) => moodboards.setVisualTarget(resolveGame(payload), payload.id, payload.visualTarget));
ipcMain.handle(IPC_CHANNELS.moodboardRemoveItem, (_e, payload = {}) => moodboards.removeItem(resolveGame(payload), payload.id));
ipcMain.handle(IPC_CHANNELS.moodboardImportImages, async (_e, game) => {
  const r = await dialog.showOpenDialog({
    title: "Import moodboard references",
    properties: ["openFile", "multiSelections"],
    filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif"] }],
  });
  return r.canceled ? moodboards.readBoard(resolveGame(game)) : moodboards.importImages(resolveGame(game), r.filePaths);
});

// ---- art-direction lab (#82): subject → styled variants → locked style target ----
// Same game source of truth as the rest of the app so the picker matches. The
// renderer generates each variant via studio:generate and hands the resulting
// inline data URL straight to lab:addVariant, so the store stays Electron-free.
ipcMain.handle(IPC_CHANNELS.labListGames, () => listGames());
ipcMain.handle(IPC_CHANNELS.labGet, (_e, game) => artLab.readLab(resolveGame(game)));
ipcMain.handle(IPC_CHANNELS.labSetSubject, (_e, payload = {}) => artLab.setSubject(resolveGame(payload), payload.subject, payload.kind));
ipcMain.handle(IPC_CHANNELS.labAddVariant, (_e, payload = {}) => artLab.addVariant(resolveGame(payload), payload.variant));
ipcMain.handle(IPC_CHANNELS.labScoreVariant, (_e, payload = {}) => artLab.scoreVariant(resolveGame(payload), payload.id, payload.score));
ipcMain.handle(IPC_CHANNELS.labTagVariant, (_e, payload = {}) => artLab.tagVariant(resolveGame(payload), payload.id, payload.tags));
ipcMain.handle(IPC_CHANNELS.labAnnotateVariant, (_e, payload = {}) => artLab.annotateVariant(resolveGame(payload), payload.id, payload.note));
ipcMain.handle(IPC_CHANNELS.labRemoveVariant, (_e, payload = {}) => artLab.removeVariant(resolveGame(payload), payload.id));
ipcMain.handle(IPC_CHANNELS.labLockVariant, (_e, payload = {}) => artLab.lockVariant(resolveGame(payload), payload.id));
ipcMain.handle(IPC_CHANNELS.labClearLock, (_e, payload = {}) => artLab.clearLock(resolveGame(payload)));

// ---- maps generator (#18): seed/validate/preview/write ArenaMap layouts ----
// Same game source of truth as the rest of the app so the picker matches.
ipcMain.handle(IPC_CHANNELS.mapsListGames, () => listGames());
ipcMain.handle(IPC_CHANNELS.mapsPreview, (_e, opts = {}) => maps.preview(opts));
ipcMain.handle(IPC_CHANNELS.mapsWrite, (_e, opts = {}) => maps.write(opts));

// ---- asset gallery (read-only review of the shared Deadrot assets package) ----
ipcMain.handle(IPC_CHANNELS.galleryListGames, () => gallery.listGames());
ipcMain.handle(IPC_CHANNELS.galleryList, (_e, payload = {}) => gallery.list(resolveGame(payload), payload));
ipcMain.handle(IPC_CHANNELS.galleryImage, (_e, payload = {}) => gallery.image(payload.path));

// ---- sprite editor (#90): load a draft/final, palette-lock edits, then promote ----
ipcMain.handle(IPC_CHANNELS.spritesList, (_e, payload = {}) => {
  try {
    return spriteEditor.list(resolveProjectTarget(payload));
  } catch (error) {
    return { ok: false, projectId: "", game: String(payload?.game || ""), assets: [], error: String((error as Error)?.message ?? error) };
  }
});
ipcMain.handle(IPC_CHANNELS.spritesLoad, (_e, payload = {}) => {
  try {
    return spriteEditor.load(resolveProjectTarget(payload), payload.asset);
  } catch (error) {
    return { ok: false, error: String((error as Error)?.message ?? error) };
  }
});

// ---- audio transcode (ffmpeg → WebM/Opus, the studio audio format) ----
ipcMain.handle(IPC_CHANNELS.studioPickAudioFiles, async () => {
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
ipcMain.handle(IPC_CHANNELS.studioTranscodeAudio, async (e, opts) => {
  const files = Array.isArray(opts?.files) ? opts.files : [];
  const target = resolveProjectTarget(opts);
  const game = target.slug;
  const category = AUDIO_CATEGORIES.includes(opts?.category) ? opts.category : "music";
  const bitrate = Math.max(32, Math.min(320, Number(opts?.bitrate) || 128));
  const normalize = !!opts?.normalize;
  const outDir = path.join(target.repoPath, "src", "assets", "audio", category);
  const send = (chunk) => { if (!e.sender.isDestroyed()) e.sender.send(IPC_CHANNELS.studioTranscodeLog, chunk); };
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
    const run = await streamCommand({
      command: ffmpeg,
      args,
      onChunk: send,
      timeoutMs: 300_000,
      spawnFn: spawn,
      formatProcessError: (error) => `\nffmpeg error: ${error} — is ffmpeg installed and on PATH?\n`,
    });
    log += run.log;
    const code = run.code;
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

ipcMain.handle(IPC_CHANNELS.studioGenerate, async (e, opts) => {
  const settings = readSettings();
  const target = resolveProjectTarget(opts);
  const { args, provider, game, kind, repo, model } = buildGenerateArgs({ assetgenPath: ASSETGEN, settings, opts, target });
  const send = (chunk) => { if (!e.sender.isDestroyed()) e.sender.send(IPC_CHANNELS.studioGenLog, chunk); };
  send(`$ assetgen --provider ${provider} --game ${game} --kind ${kind} --id ${opts?.id}${model ? ` --model ${model}` : ""}\n`);
  send(`[repo] ${repo}\n`);
  send(`[manifest] ${target.manifestPath}\n`);
  const run = await streamCommand({
    command: "bun",
    args,
    cwd: STUDIO_REPO,
    onChunk: send,
    timeoutMs: 300_000,
    spawnFn: spawn,
  });
  if (!run.spawned) {
    return { ok: false, log: run.log, path: null, dataUrl: null };
  }
  const parsed = parseGenerateResult(run.log);
  const p = run.log.match(/\[billboard\] (.+?\.html)/);
  let dataUrl = null, outPath = null, previewPath = null, mediaType = null;
  if (parsed) { outPath = parsed.path; mediaType = parsed.mediaType; try { dataUrl = dataUrlFor(parsed, await fs.promises.readFile(outPath)); } catch {} }
  if (p) previewPath = p[1].trim();
  send(`\n[exit ${run.code}]\n`);
  return { ok: run.code === 0 && !!parsed, log: run.log, path: outPath, dataUrl, previewPath, mediaType };
});

// ---- pixelize (#66): re-grade a generated sprite onto the true DOOM pixel grid ----
// Shells out to the SAME assetgen `pixelize` verb the CLI uses (one impl, two
// surfaces) rather than importing pixelize() — that would pull `sharp` (a native
// addon) into the Electron bundle. rembg cutout is auto-detected by the CLI; absent
// it falls back to the flood-fill, so the Sprites pane works with or without rembg.
function readPixelizeSource(payload: any): { buffer: Buffer } | { error: string } {
  if (payload?.dataUrl) {
    const decoded = decodePixelizeDataUrl(payload.dataUrl);
    if (decoded?.buffer?.length) return { buffer: decoded.buffer };
  }
  if (typeof payload?.path === "string" && payload.path && fs.existsSync(payload.path)) {
    try { return { buffer: fs.readFileSync(payload.path) }; } catch { /* fall through */ }
  }
  return { error: "nothing to pixelize — generate a sprite first" };
}

async function runPixelizePayload(payload: any = {}) {
  const source = readPixelizeSource(payload);
  if ("error" in source) return { ok: false, error: source.error };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "studio-pixelize-"));
  const inPath = path.join(dir, "in.png");
  const outPath = path.join(dir, "out.webp");
  try {
    fs.writeFileSync(inPath, source.buffer);
    const { args, height, cutout } = buildPixelizeArgs({ assetgenPath: ASSETGEN, inPath, outPath, opts: payload });
    const run = await new Promise<{ code: number | null; log: string }>((resolve) => {
      let child;
      try { child = spawn("bun", args, { cwd: STUDIO_REPO }); }
      catch (err) { return resolve({ code: -1, log: `spawn failed: ${err}` }); }
      let buf = "";
      const onData = (d) => { buf += d.toString(); };
      child.stdout.on("data", onData);
      child.stderr.on("data", onData);
      child.on("error", (err) => { buf += `\nprocess error: ${err}\n`; });
      const killer = setTimeout(() => { try { child.kill("SIGKILL"); buf += "\n[timed out after 120s]\n"; } catch {} }, 120_000);
      child.on("close", (code) => { clearTimeout(killer); resolve({ code, log: buf }); });
    });
    if (run.code !== 0 || !fs.existsSync(outPath)) {
      return { ok: false, error: `pixelize exited ${run.code}`, log: run.log, cutout: parsePixelizeCutout(run.log) };
    }
    const data = fs.readFileSync(outPath);
    return {
      ok: true,
      dataUrl: `data:image/webp;base64,${data.toString("base64")}`,
      bytes: data.length,
      height,
      requestedCutout: cutout,
      cutout: parsePixelizeCutout(run.log),
      log: run.log,
    };
  } catch (err) {
    return { ok: false, error: String((err as Error)?.message ?? err) };
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
}

ipcMain.handle(IPC_CHANNELS.studioPixelize, (_e, payload = {}) => runPixelizePayload(payload));

ipcMain.handle(IPC_CHANNELS.spritesSaveDraft, async (_e, payload = {}) => {
  try {
    const target = resolveProjectTarget(payload);
    const source = spriteEditor.load(target, payload.asset);
    const width = Math.floor(Number(payload.width));
    const height = Math.floor(Number(payload.height));
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width > 8192 || height > 8192) {
      throw new Error("edited sprite dimensions must be integers between 1 and 8192");
    }
    if (source.asset?.dimensions && (source.asset.dimensions[0] !== width || source.asset.dimensions[1] !== height)) {
      throw new Error(`pixel edits must preserve ${source.asset.dimensions[0]}×${source.asset.dimensions[1]} sheet geometry`);
    }
    const pixelized = await runPixelizePayload({
      dataUrl: payload.dataUrl,
      height,
      bgThreshold: 0,
      cutout: "none",
      palette: "doom",
      trim: false,
      preserveSize: true,
    });
    if (!pixelized.ok || !("dataUrl" in pixelized) || !pixelized.dataUrl) {
      throw new Error(("error" in pixelized && pixelized.error) || "palette-lock postprocess failed");
    }
    const decoded = decodePixelizeDataUrl(pixelized.dataUrl);
    if (!decoded?.buffer.length) throw new Error("palette-lock postprocess returned no image");
    const saved = await spriteEditor.saveDraft(target, payload.asset, decoded.buffer);
    return {
      ...saved,
      correctedOffPalette: Math.max(0, Math.floor(Number(payload.offPaletteCount) || 0)),
      log: pixelized.log,
    };
  } catch (error) {
    return { ok: false, error: String((error as Error)?.message ?? error) };
  }
});

ipcMain.handle(IPC_CHANNELS.spritesPromote, async (_e, payload = {}) => {
  try {
    const target = resolveProjectTarget(payload);
    if (payload.asset?.origin !== "draft") throw new Error("only a saved draft can be promoted");
    // Resolve the exact draft before spawning so a forged id/kind cannot select a
    // different manifest entry. assetgen remains the one canonical promoter.
    spriteEditor.load(target, payload.asset);
    const sameIdDrafts = spriteEditor.list(target).assets.filter(
      (asset) => asset.origin === "draft" && asset.id === payload.asset.id,
    );
    if (sameIdDrafts.length !== 1) {
      throw new Error(`cannot promote ${payload.asset.id}: ${sameIdDrafts.length} draft kinds share that id`);
    }
    const run = await new Promise<{ code: number | null; log: string }>((resolve) => {
      const args = [ASSETGEN, "promote", "--id", payload.asset.id, "--repo", target.repoPath];
      let child;
      try { child = spawn("bun", args, { cwd: STUDIO_REPO }); }
      catch (error) { resolve({ code: -1, log: `spawn failed: ${error}` }); return; }
      let log = "";
      const collect = (data) => { log += data.toString(); };
      child.stdout.on("data", collect);
      child.stderr.on("data", collect);
      child.on("error", (error) => { log += `\nprocess error: ${error}\n`; });
      const killer = setTimeout(() => { try { child.kill("SIGKILL"); log += "\n[timed out after 120s]\n"; } catch {} }, 120_000);
      child.on("close", (code) => { clearTimeout(killer); resolve({ code, log }); });
    });
    if (run.code !== 0) throw new Error(run.log.trim() || `assetgen promote exited ${run.code}`);
    const loaded = spriteEditor.load(target, { ...payload.asset, origin: "promoted" });
    return { ...loaded, log: run.log };
  } catch (error) {
    return { ok: false, error: String((error as Error)?.message ?? error) };
  }
});

ipcMain.handle(IPC_CHANNELS.resourcesList, async () => {
  try {
    const results = await Promise.all(
      RESOURCE_INVENTORY_KINDS.map(async (kind) => {
        const result = await runResourcesCommand([kind, "--json"]);
        return { kind, result, inventory: parseResourceInventory(kind, result.stdout) };
      }),
    );
    const byKind = Object.fromEntries(results.map(({ kind, inventory }) => [kind, inventory]));
    const failed = results.filter(({ result, inventory }) => result.code !== 0 || inventory.errors.length > 0);
    return {
      ok: failed.length === 0,
      error: failed.length
        ? failed.map(({ kind, result }) => `${kind} inventory exited ${result.code}`).join("; ")
        : null,
      sources: byKind.sources,
      transcripts: byKind.transcripts,
      derivatives: byKind.derivatives,
    };
  } catch (error) {
    const message = String((error as Error)?.message ?? error);
    return {
      ok: false,
      error: message,
      sources: emptyResourceInventory("sources", message),
      transcripts: emptyResourceInventory("transcripts", message),
      derivatives: emptyResourceInventory("derivatives", message),
    };
  }
});

ipcMain.handle(IPC_CHANNELS.resourcesValidate, async (e) => {
  const send = (chunk) => {
    if (!e.sender.isDestroyed()) e.sender.send(IPC_CHANNELS.studioResearchLog, chunk);
  };
  send("$ ressources validate\n");
  const result = await runResourcesCommand(["validate"], send);
  send(`\n[exit ${result.code}]\n`);
  return parseResourceValidation(result.code, result.log);
});

ipcMain.handle(IPC_CHANNELS.resourcesPreview, async (_e, payload = {}) => {
  try {
    const previewPath = realDerivativePath(payload.path);
    if (![".md", ".json"].includes(path.extname(previewPath).toLowerCase())) {
      throw new Error("only derivative Markdown and JSON files can be previewed");
    }
    const stats = fs.statSync(previewPath);
    if (!stats.isFile() || stats.size > 256 * 1024) {
      throw new Error("derivative preview must be a file no larger than 256 KB");
    }
    return {
      ok: true,
      path: previewPath,
      content: await fs.promises.readFile(previewPath, "utf8"),
    };
  } catch (error) {
    return { ok: false, path: null, content: null, error: String((error as Error)?.message ?? error) };
  }
});

ipcMain.handle(IPC_CHANNELS.resourcesReveal, (_e, payload = {}) => {
  try {
    electronShell.showItemInFolder(realDerivativePath(payload.path));
    return { ok: true };
  } catch (error) {
    return { ok: false, error: String((error as Error)?.message ?? error) };
  }
});

ipcMain.handle(IPC_CHANNELS.resourcesPromoteSkill, async (e, payload = {}) => {
  const send = (chunk) => {
    if (!e.sender.isDestroyed()) e.sender.send(IPC_CHANNELS.studioResearchLog, chunk);
  };
  try {
    const candidatePath = resolveRealSkillCandidatePath(RESSOURCES_ROOT, payload.candidatePath);
    const fingerprint = fingerprintResourceFile(candidatePath);
    const approve = payload.approve === true;

    if (approve) {
      if (!skillPromotionReviews.consume(candidatePath, fingerprint, e.sender.id)) {
        throw new Error("skill promotion approval requires a successful dry-run for the unchanged candidate");
      }
    } else {
      skillPromotionReviews.clear(candidatePath);
    }

    const mode = approve ? "--approve" : "--dry-run";
    send(`$ ressources promote-skill --candidate ${payload.candidatePath} ${mode}\n`);
    const result = await runResourcesCommand(
      ["promote-skill", "--candidate", candidatePath, mode],
      send,
      120_000,
    );
    send(`\n[exit ${result.code}]\n`);
    if (!approve && result.code === 0) {
      skillPromotionReviews.record(candidatePath, fingerprint, e.sender.id);
    }
    return {
      ok: result.code === 0,
      log: result.log,
      ...(result.code === 0 ? {} : { error: `skill promotion ${mode} exited ${result.code}` }),
    };
  } catch (error) {
    const message = String((error as Error)?.message ?? error);
    send(`${message}\n`);
    return { ok: false, log: message, error: message };
  }
});

// Ressources -> rules: drives @shipshitgames/ressources over a streaming log, same shape as
// studio:generate. Writes the ruleset into the repo under docs/rules/ by default.
ipcMain.handle(IPC_CHANNELS.studioResearch, async (e, opts) => {
  // Ressources only distills with codex | mock; ignore the image-gen default provider.
  const provider = opts?.provider === "mock" ? "mock" : "codex";
  const url = (opts?.url || "").trim();
  const slug = (opts?.slug || "ruleset").replace(/[^a-z0-9-]+/gi, "-").toLowerCase();
  const out = path.join(STUDIO_REPO, "docs", "rules", `${slug}.md`);
  const send = (chunk) => { if (!e.sender.isDestroyed()) e.sender.send(IPC_CHANNELS.studioResearchLog, chunk); };
  if (!url) { send("no url provided\n"); return { ok: false, log: "no url", path: null, rules: null }; }
  const args = [RESSOURCES, "distill", "--url", url, "--provider", provider, "--out", out];
  send(`$ ressources distill --url ${url} --provider ${provider} --out ${out}\n`);
  const run = await streamCommand({
    command: "bun",
    args,
    cwd: STUDIO_REPO,
    env: process.env,
    onChunk: send,
    timeoutMs: 300_000,
    spawnFn: spawn,
  });
  if (!run.spawned) {
    return { ok: false, log: run.log, path: null, rules: null };
  }
  const outPath = parseWroteLine(run.log, "md");
  let rules = null;
  if (outPath) { try { rules = await fs.promises.readFile(outPath, "utf8"); } catch {} }
  send(`\n[exit ${run.code}]\n`);
  return { ok: run.code === 0 && !!outPath, log: run.log, path: outPath, rules };
});

/** @type {BrowserWindow | null} */
let mainWindow = null;
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440, height: 900, minWidth: 960, minHeight: 600,
    backgroundColor: "#0a0a0a", title: "Ship Shit Games — Studio", autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, "..", "preload", "index.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  // Pin the renderer to its own origin/bundle and route external links through the OS
  // browser. The preload's terminal bridge pipes renderer strings into a login shell,
  // so a navigation onto attacker web content would be RCE-grade — deny it up front.
  const indexHtml = path.join(__dirname, "..", "..", "dist", "index.html");
  const allowedUrl = isDev ? DEV_SERVER_URL : pathToFileURL(indexHtml).toString();
  hardenWindow(mainWindow.webContents, allowedUrl, electronShell);
  if (isDev) { mainWindow.loadURL(DEV_SERVER_URL); mainWindow.webContents.openDevTools({ mode: "detach" }); }
  else { mainWindow.loadFile(indexHtml); }
  mainWindow.on("closed", () => { terminalManager.disposeAll(); mainWindow = null; });
}
app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("before-quit", () => terminalManager.disposeAll());
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
