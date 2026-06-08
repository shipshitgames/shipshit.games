// Ship Shit Games — Studio asset gallery (Electron main side).
//
// Reads the shared Deadrot `@shipshitgames/assets` package — the source of truth
// for shipped game art — and flattens its category-keyed manifests
// (`{ sprites, textures, ui, audio, runtime }`) into a flat, reviewable list of
// visual assets with resolved on-disk thumbnails. This is intentionally separate
// from `projects.ts`, whose flat `{ assets: [] }` model matches the studio's
// per-game manifest, NOT the Deadrot shared package.
import fs from "node:fs";
import path from "node:path";

const IMAGE_EXT = new Set([".webp", ".png", ".jpg", ".jpeg", ".gif", ".avif"]);
// Categories that hold renderable images. `audio` is non-visual; `runtime` is
// config (sprite/animation wiring), not assets.
const VISUAL_CATEGORIES = ["sprites", "textures", "ui"];
// Cap how much base64 a single list() call inlines. Anything past the budget is
// returned as `deferred` and fetched lazily by the renderer via image().
const DEFAULT_EMBED_BUDGET = 24 * 1024 * 1024;

function mimeFor(ext) {
  switch (String(ext).toLowerCase()) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".avif":
      return "image/avif";
    default:
      return "image/webp";
  }
}

// First path segment after the `games/<game>/` prefix — the natural bucket
// (enemies / weapons / players / pickups / textures / ui / fx / projectiles…).
// Shared/entity assets that live outside the game folder fall back to their own
// top-level segment.
function groupFor(game, relPath) {
  const norm = String(relPath || "").replace(/\\/g, "/");
  const prefix = `games/${game}/`;
  const rest = norm.startsWith(prefix) ? norm.slice(prefix.length) : norm;
  const segs = rest.split("/").filter(Boolean);
  segs.pop(); // drop filename
  return segs[0] || "root";
}

// Flatten one parsed manifest into review records. Pure (no fs) so it is unit
// testable. Sprites with `views` expand to one record per view; single-path
// entries (weapons, projectiles, textures, ui) yield one record.
function flattenManifest(game, data) {
  const out = [];
  for (const category of VISUAL_CATEGORIES) {
    const bucket = data && data[category];
    if (!bucket || typeof bucket !== "object") continue;
    for (const [key, entry] of Object.entries(bucket) as [string, any][]) {
      if (!entry || typeof entry !== "object") continue;
      const license = entry.license || null;
      const baseType = entry.type || category.replace(/s$/, "");
      const pushOne = (id, relPath, view, dims, scale) => {
        if (typeof relPath !== "string" || !relPath) return;
        const ext = path.extname(relPath).toLowerCase();
        if (!IMAGE_EXT.has(ext)) return;
        out.push({
          id,
          assetId: key,
          category,
          type: baseType,
          view: view || null,
          path: relPath,
          group: groupFor(game, relPath),
          dimensions: Array.isArray(dims) ? dims : Array.isArray(entry.dimensions) ? entry.dimensions : null,
          scale: Array.isArray(scale) ? scale : Array.isArray(entry.scale) ? entry.scale : null,
          filter: typeof entry.filter === "string" ? entry.filter : null,
          role: typeof entry.role === "string" ? entry.role : null,
          license,
        });
      };
      if (entry.views && typeof entry.views === "object") {
        for (const [view, raw] of Object.entries(entry.views)) {
          const v = raw as any;
          if (v && typeof v === "object") pushOne(`${key}:${view}`, v.path, view, v.dimensions, v.scale);
        }
      }
      if (typeof entry.path === "string") pushOne(key, entry.path, null, entry.dimensions, entry.scale);
    }
  }
  out.sort((a, b) => (a.group === b.group ? a.id.localeCompare(b.id) : a.group.localeCompare(b.group)));
  return out;
}

// Recursively collect manifest-relative image paths under a game dir. Used as a
// fallback for games that ship loose art folders but no `assets.json` yet, so the
// gallery can still review every game's assets.
function walkImages(rootDir, gameDir, game, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(gameDir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const abs = path.join(gameDir, e.name);
    if (e.isDirectory()) {
      walkImages(rootDir, abs, game, out);
    } else if (e.isFile() && IMAGE_EXT.has(path.extname(e.name).toLowerCase())) {
      const rel = path.relative(rootDir, abs).replace(/\\/g, "/");
      const noExt = rel.replace(/\.[^.]+$/, "");
      const prefix = `games/${game}/`;
      const id = noExt.startsWith(prefix) ? noExt.slice(prefix.length) : noExt;
      out.push({
        id,
        assetId: id,
        category: "files",
        type: "file",
        view: null,
        path: rel,
        group: groupFor(game, rel),
        dimensions: null,
        scale: null,
        filter: null,
        role: null,
        license: null,
      });
    }
  }
  return out;
}

function createGallery({ assetsRoot }) {
  function root() {
    const r = typeof assetsRoot === "function" ? assetsRoot() : assetsRoot;
    return r && fs.existsSync(r) ? r : null;
  }
  function gamesDir() {
    const r = root();
    return r ? path.join(r, "games") : null;
  }
  function manifestPath(game) {
    const r = root();
    return r ? path.join(r, "games", String(game), "assets.json") : null;
  }
  function dirHasImage(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return false;
    }
    for (const e of entries) {
      if (e.isFile() && IMAGE_EXT.has(path.extname(e.name).toLowerCase())) return true;
      if (e.isDirectory() && dirHasImage(path.join(dir, e.name))) return true;
    }
    return false;
  }
  function listGames() {
    const dir = gamesDir();
    if (!dir || !fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .filter((e) => fs.existsSync(path.join(dir, e.name, "assets.json")) || dirHasImage(path.join(dir, e.name)))
      .map((e) => e.name)
      .sort();
  }
  function readManifest(game) {
    const mp = manifestPath(game);
    if (!mp || !fs.existsSync(mp)) return null;
    try {
      return JSON.parse(fs.readFileSync(mp, "utf8"));
    } catch {
      return null;
    }
  }
  function embed(absPath) {
    try {
      const buf = fs.readFileSync(absPath);
      const ext = path.extname(absPath).toLowerCase();
      return { dataUrl: `data:${mimeFor(ext)};base64,${buf.toString("base64")}`, bytes: buf.length };
    } catch {
      return null;
    }
  }
  // Resolve a manifest-relative path to an absolute file, refusing anything that
  // escapes the assets package root (defense against `../` in a manifest).
  function resolveSafe(relPath) {
    const r = root();
    if (!r) return null;
    const norm = String(relPath || "").replace(/\\/g, "/");
    const abs = path.resolve(r, norm);
    const base = path.resolve(r);
    if (abs !== base && !abs.startsWith(base + path.sep)) return null;
    return abs;
  }

  function list(game, opts: any = {}) {
    const r = root();
    const games = listGames();
    if (!r) {
      return { ok: false, error: "Deadrot assets package not found", root: null, game: String(game || ""), games: [], assets: [] };
    }
    const safeGame = String(game || "").replace(/[^a-z0-9-]/gi, "");
    const data = readManifest(safeGame);
    let flat;
    let source;
    if (data) {
      flat = flattenManifest(safeGame, data);
      source = "manifest";
    } else {
      const gameDir = path.join(r, "games", safeGame);
      if (!fs.existsSync(gameDir)) {
        return { ok: false, error: `No assets for "${safeGame}"`, root: r, game: safeGame, games, assets: [] };
      }
      flat = walkImages(r, gameDir, safeGame).sort((a, b) =>
        a.group === b.group ? a.id.localeCompare(b.id) : a.group.localeCompare(b.group),
      );
      source = "filesystem";
    }
    const budget = Number.isFinite(opts.embedBudget) ? opts.embedBudget : DEFAULT_EMBED_BUDGET;
    let used = 0;
    const assets = flat.map((a) => {
      const abs = resolveSafe(a.path);
      if (!abs || !fs.existsSync(abs)) {
        return { ...a, missing: true, dataUrl: null, bytes: null, deferred: false };
      }
      const size = fs.statSync(abs).size;
      const approxB64 = Math.ceil(size * 1.37);
      if (used + approxB64 <= budget) {
        const e = embed(abs);
        if (e) {
          used += approxB64;
          return { ...a, missing: false, dataUrl: e.dataUrl, bytes: e.bytes, deferred: false };
        }
      }
      return { ...a, missing: false, dataUrl: null, bytes: size, deferred: true };
    });
    return {
      ok: true,
      root: r,
      source,
      manifestPath: source === "manifest" ? manifestPath(safeGame) : null,
      game: safeGame,
      games,
      assets,
      embeddedBytes: used,
    };
  }

  // On-demand single-image fetch for deferred thumbnails and full-res lightbox.
  function image(relPath) {
    const abs = resolveSafe(relPath);
    if (!abs || !fs.existsSync(abs)) return null;
    return embed(abs);
  }

  return { listGames, list, image, manifestPath, root };
}

export { createGallery, flattenManifest, groupFor, mimeFor, VISUAL_CATEGORIES, IMAGE_EXT };
