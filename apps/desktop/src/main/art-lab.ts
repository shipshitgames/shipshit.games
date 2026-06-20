// Art Direction Lab (#82): a per-game look-dev workspace. A game has one
// "subject" (the base art concept) and many "variants" — the same subject
// re-prompted with different style-direction text. Variants are scored, tagged
// and annotated; the chosen one is *locked* into lock.json, a small,
// pipeline-readable style-target contract the asset pipeline can later consume
// (wiring that consumption is a separate card, #56).
//
// Pure + dependency-injected (rootDir/now/id) so it runs under `bun test` with a
// temp dir — no Electron runtime. Mirrors moodboards.ts: variant images live
// under the board dir and are returned to the renderer as base64 data URLs.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const EXT_BY_MIME = {
  "image/gif": ".gif",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

function sanitizeGame(game) {
  const slug = String(game || "scourge-survivors")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "scourge-survivors";
}

function cleanText(value, max = 4000) {
  return String(value || "").trim().slice(0, max);
}

function clampScore(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(5, n));
}

// Tags are short, slugged keywords ("hi-contrast", "warm") — a small, capped set
// the renderer can filter on. Dedupe and drop empties.
function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of tags) {
    const tag = cleanText(raw, 40).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    if (tag && !seen.has(tag)) {
      seen.add(tag);
      out.push(tag);
    }
    if (out.length >= 12) break;
  }
  return out;
}

function safeReadJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

// Defense-in-depth: image.path is read back from on-disk lab.json/lock.json, then
// path.join'd onto labDir and fs-read/copied. A corrupted/tampered store must not
// be able to escape the lab dir via an absolute path or "..". Mirrors the
// scaffolder's assertSafeLorePath, but fails *soft* (returns false → drop the
// image) so the rest of an otherwise-loadable lab still loads. Not IPC-reachable.
function isSafeRelImagePath(labDirAbs, relPath) {
  const value = String(relPath || "");
  if (!value) return false;
  // Reject absolute paths (POSIX "/..." and Windows "C:\...").
  if (value.startsWith("/") || value.startsWith("\\") || /^[a-zA-Z]:/.test(value)) return false;
  // Reject any traversal segment.
  if (value.split(/[\\/]/).some((segment) => segment === "..")) return false;
  // Belt-and-suspenders: the resolved path must stay under labDir.
  const root = path.resolve(labDirAbs);
  const resolved = path.resolve(root, value);
  return resolved === root || resolved.startsWith(root + path.sep);
}

// Cache base64 data URLs keyed by absolute image path so the Electron main thread
// only re-reads + re-encodes an image when its bytes actually change. Every lab
// mutation re-publishes the full lab WITH dataUrls; without this, score/tag/lock
// would readFileSync + base64 every variant (and the lock) on each keystroke. The
// cheap fs.statSync mtime check gates the expensive read.
const dataUrlCache = new Map();

function encodeImage(absolute, mime) {
  let stat;
  try {
    stat = fs.statSync(absolute);
  } catch {
    dataUrlCache.delete(absolute);
    return null;
  }
  const cached = dataUrlCache.get(absolute);
  if (cached && cached.mtimeMs === stat.mtimeMs) return cached.dataUrl;
  let dataUrl = null;
  try {
    dataUrl = `data:${mime};base64,${fs.readFileSync(absolute).toString("base64")}`;
  } catch {
    dataUrlCache.delete(absolute);
    return null;
  }
  dataUrlCache.set(absolute, { mtimeMs: stat.mtimeMs, dataUrl });
  return dataUrl;
}

// Drop a cache entry when its file is deleted or about to be overwritten, so a
// fresh image written at the same path (possibly within the filesystem's mtime
// granularity) can't be masked by a stale encode.
function evictDataUrl(absolute) {
  dataUrlCache.delete(absolute);
}

function extFor(mime) {
  return EXT_BY_MIME[String(mime || "").toLowerCase()] || ".png";
}

// Decode a `data:<mime>;base64,<payload>` URL (what studio:generate hands the
// renderer for an inline preview) back into bytes we can persist.
function decodeDataUrl(dataUrl) {
  const match = /^data:([^;,]+);base64,([\s\S]*)$/.exec(String(dataUrl || ""));
  if (!match) return null;
  return { mime: match[1], buffer: Buffer.from(match[2], "base64") };
}

function createArtLabStore(options) {
  const now = options?.now || (() => new Date().toISOString());
  const makeId = options?.id || (() => crypto.randomUUID());
  const rootDir = () => {
    const root = typeof options?.rootDir === "function" ? options.rootDir() : options?.rootDir;
    if (!root) throw new Error("art-lab rootDir is required");
    return root;
  };

  function labDir(game) {
    return path.join(rootDir(), sanitizeGame(game));
  }
  function labPath(game) {
    return path.join(labDir(game), "lab.json");
  }
  function lockPath(game) {
    return path.join(labDir(game), "lock.json");
  }
  function variantsDir(game) {
    return path.join(labDir(game), "variants");
  }
  function lockedDir(game) {
    return path.join(labDir(game), "locked");
  }

  function normalizeVariant(raw, labDirAbs?) {
    // Drop the image (rather than throw) if its stored path is unsafe — a corrupted
    // store still loads the rest of the lab. When labDirAbs is omitted (addVariant
    // builds the image from a path we just wrote) the value is already trusted.
    const safe = !raw?.image?.path
      ? false
      : !labDirAbs || isSafeRelImagePath(labDirAbs, raw.image.path);
    const image = safe
      ? { path: String(raw.image.path), mime: String(raw.image.mime || "image/png") }
      : null;
    return {
      id: String(raw?.id || makeId()),
      direction: cleanText(raw?.direction, 600),
      prompt: cleanText(raw?.prompt, 4000),
      provider: cleanText(raw?.provider, 40) || "codex",
      score: clampScore(raw?.score),
      tags: normalizeTags(raw?.tags),
      note: cleanText(raw?.note),
      locked: !!raw?.locked,
      image,
      createdAt: typeof raw?.createdAt === "string" ? raw.createdAt : now(),
      updatedAt: typeof raw?.updatedAt === "string" ? raw.updatedAt : now(),
    };
  }

  function normalizeLab(game, raw) {
    const safeGame = sanitizeGame(game || raw?.game);
    const createdAt = typeof raw?.createdAt === "string" ? raw.createdAt : now();
    const labDirAbs = labDir(safeGame);
    const variants = Array.isArray(raw?.variants) ? raw.variants.map((v) => normalizeVariant(v, labDirAbs)) : [];
    return {
      game: safeGame,
      subject: cleanText(raw?.subject, 4000),
      kind: cleanText(raw?.kind, 40) || "sprite",
      variants,
      createdAt,
      updatedAt: typeof raw?.updatedAt === "string" ? raw.updatedAt : createdAt,
    };
  }

  // Attach a base64 data URL (read from the on-disk image) for the renderer. The
  // mtime-keyed cache means an unchanged image is encoded once, not on every
  // score/tag/lock mutation. normalizeVariant has already dropped unsafe paths.
  function publicVariant(game, variant) {
    if (!variant.image?.path) return { ...variant, dataUrl: null };
    const absolute = path.join(labDir(game), variant.image.path);
    return { ...variant, dataUrl: encodeImage(absolute, variant.image.mime) };
  }

  function readLock(game) {
    const safeGame = sanitizeGame(game);
    const raw = safeReadJson(lockPath(safeGame), null);
    if (!raw) return null;
    let dataUrl = null;
    // Same defense-in-depth as normalizeVariant: a tampered lock.json must not be
    // able to read outside the lab dir. Drop the image (still return the lock).
    if (raw.image?.path && isSafeRelImagePath(labDir(safeGame), raw.image.path)) {
      dataUrl = encodeImage(path.join(labDir(safeGame), raw.image.path), raw.image.mime);
    }
    return { ...raw, dataUrl };
  }

  function readLabRaw(game) {
    const safeGame = sanitizeGame(game);
    return normalizeLab(safeGame, safeReadJson(labPath(safeGame), { game: safeGame, variants: [] }));
  }

  function readLab(game) {
    const safeGame = sanitizeGame(game);
    const lab = readLabRaw(safeGame);
    return {
      ...lab,
      variants: lab.variants.map((variant) => publicVariant(safeGame, variant)),
      lock: readLock(safeGame),
    };
  }

  function writeLab(lab) {
    const safeGame = sanitizeGame(lab?.game);
    const persisted = normalizeLab(safeGame, { ...lab, updatedAt: now() });
    fs.mkdirSync(labDir(safeGame), { recursive: true });
    fs.writeFileSync(labPath(safeGame), JSON.stringify(persisted, null, 2));
    return readLab(safeGame);
  }

  function setSubject(game, subject, kind) {
    const lab = readLabRaw(game);
    lab.subject = cleanText(subject, 4000);
    if (kind != null && cleanText(kind, 40)) lab.kind = cleanText(kind, 40);
    return writeLab(lab);
  }

  // Persist a freshly generated variant. The image arrives either as a data URL
  // (the renderer's inline preview) or as a source file path; either way a copy
  // is written under variants/ so the lab is self-contained.
  function addVariant(game, input: any = {}) {
    const safeGame = sanitizeGame(game);
    const lab = readLabRaw(safeGame);
    const id = makeId();
    let image = null;
    const decoded = input?.dataUrl ? decodeDataUrl(input.dataUrl) : null;
    if (decoded) {
      // The data URL's own mime is authoritative for its bytes — never let an
      // out-of-band input.mime mislabel them and break the read-back round-trip.
      const mime = decoded.mime;
      const relativePath = path.join("variants", `${id}${extFor(mime)}`);
      fs.mkdirSync(variantsDir(safeGame), { recursive: true });
      fs.writeFileSync(path.join(labDir(safeGame), relativePath), decoded.buffer);
      image = { path: relativePath, mime };
    } else if (input?.sourcePath && fs.existsSync(input.sourcePath)) {
      const ext = path.extname(input.sourcePath).toLowerCase() || extFor(input.mime);
      const relativePath = path.join("variants", `${id}${ext}`);
      fs.mkdirSync(variantsDir(safeGame), { recursive: true });
      fs.copyFileSync(input.sourcePath, path.join(labDir(safeGame), relativePath));
      image = { path: relativePath, mime: input.mime || "image/png" };
    }
    lab.variants.push(normalizeVariant({
      id,
      direction: input?.direction,
      prompt: input?.prompt,
      provider: input?.provider,
      image,
      createdAt: now(),
      updatedAt: now(),
    }));
    return writeLab(lab);
  }

  function mutateVariant(game, id, mutate) {
    const safeGame = sanitizeGame(game);
    const lab = readLabRaw(safeGame);
    const variant = lab.variants.find((candidate) => candidate.id === String(id || ""));
    if (!variant) return readLab(safeGame);
    mutate(variant);
    variant.updatedAt = now();
    return writeLab(lab);
  }

  function scoreVariant(game, id, score) {
    return mutateVariant(game, id, (variant) => { variant.score = clampScore(score); });
  }

  function tagVariant(game, id, tags) {
    return mutateVariant(game, id, (variant) => { variant.tags = normalizeTags(tags); });
  }

  function annotateVariant(game, id, note) {
    return mutateVariant(game, id, (variant) => { variant.note = cleanText(note); });
  }

  function removeVariant(game, id) {
    const safeGame = sanitizeGame(game);
    const lab = readLabRaw(safeGame);
    const target = lab.variants.find((candidate) => candidate.id === String(id || ""));
    if (target?.image?.path) {
      const absolute = path.join(labDir(safeGame), target.image.path);
      try { fs.rmSync(absolute, { force: true }); } catch {}
      evictDataUrl(absolute);
    }
    lab.variants = lab.variants.filter((candidate) => candidate.id !== String(id || ""));
    writeLab(lab);
    // Removing the locked variant must also drop the style-target contract.
    const lock = readLock(safeGame);
    if (lock && lock.variantId === String(id || "")) return clearLock(safeGame);
    return readLab(safeGame);
  }

  // Lock a variant as the game's style target: copy its image into locked/ and
  // write lock.json (subject + winning direction + prompt + image reference).
  function lockVariant(game, id) {
    const safeGame = sanitizeGame(game);
    const lab = readLabRaw(safeGame);
    const variant = lab.variants.find((candidate) => candidate.id === String(id || ""));
    if (!variant) return readLab(safeGame);
    const previous = safeReadJson(lockPath(safeGame), null);
    let lockImage = null;
    if (variant.image?.path) {
      const ext = path.extname(variant.image.path) || extFor(variant.image.mime);
      const relativePath = path.join("locked", `${variant.id}${ext}`);
      fs.mkdirSync(lockedDir(safeGame), { recursive: true });
      const destination = path.join(labDir(safeGame), relativePath);
      try {
        fs.copyFileSync(path.join(labDir(safeGame), variant.image.path), destination);
        // Re-locking the same variant overwrites locked/<id>.<ext> in place.
        evictDataUrl(destination);
        lockImage = { path: relativePath, mime: variant.image.mime };
      } catch {}
    }
    // Re-locking a different variant would otherwise orphan the old locked image.
    if (previous?.image?.path && previous.image.path !== lockImage?.path) {
      const absolute = path.join(labDir(safeGame), previous.image.path);
      try { fs.rmSync(absolute, { force: true }); } catch {}
      evictDataUrl(absolute);
    }
    const lock = {
      game: safeGame,
      variantId: variant.id,
      subject: lab.subject,
      kind: lab.kind,
      direction: variant.direction,
      prompt: variant.prompt,
      provider: variant.provider,
      image: lockImage,
      lockedAt: now(),
    };
    fs.mkdirSync(labDir(safeGame), { recursive: true });
    fs.writeFileSync(lockPath(safeGame), JSON.stringify(lock, null, 2));
    lab.variants = lab.variants.map((candidate) => ({ ...candidate, locked: candidate.id === variant.id }));
    return writeLab(lab);
  }

  function clearLock(game) {
    const safeGame = sanitizeGame(game);
    // Drop the copied locked image too, so a cleared lock leaves nothing behind.
    const lock = safeReadJson(lockPath(safeGame), null);
    if (lock?.image?.path) {
      const absolute = path.join(labDir(safeGame), lock.image.path);
      try { fs.rmSync(absolute, { force: true }); } catch {}
      evictDataUrl(absolute);
    }
    try { fs.rmSync(lockPath(safeGame), { force: true }); } catch {}
    const lab = readLabRaw(safeGame);
    lab.variants = lab.variants.map((candidate) => ({ ...candidate, locked: false }));
    return writeLab(lab);
  }

  return {
    readLab,
    setSubject,
    addVariant,
    scoreVariant,
    tagVariant,
    annotateVariant,
    removeVariant,
    lockVariant,
    clearLock,
    readLock,
  };
}

export {
  createArtLabStore,
  sanitizeGame,
};
