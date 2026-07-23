// Sprite editor persistence, kept free of Electron and sharp so path, manifest,
// draft, and provenance behavior can be tested without the desktop runtime.
import fs from "node:fs";
import path from "node:path";

import {
  register,
  type AssetEntry,
} from "../../../../packages/assetgen/src/manifest.ts";

type SpriteOrigin = "draft" | "promoted";

interface ProjectTarget {
  id: string;
  slug: string;
  repoPath: string;
}

interface SpriteSelector {
  id: string;
  kind: string;
  origin: SpriteOrigin;
}

const SPRITE_KINDS = new Set(["sprite", "sprite-anim"]);
const MAX_INLINE_BYTES = 32 * 1024 * 1024;

function assetsRoot(target: ProjectTarget): string {
  return path.join(path.resolve(target.repoPath), "src", "assets");
}

function manifestPath(target: ProjectTarget, origin: SpriteOrigin): string {
  const root = assetsRoot(target);
  return origin === "draft"
    ? path.join(root, "drafts", "drafts.json")
    : path.join(root, "assets.json");
}

function contentRoot(target: ProjectTarget, origin: SpriteOrigin): string {
  const root = assetsRoot(target);
  return origin === "draft" ? path.join(root, "drafts") : root;
}

function readEntries(file: string): AssetEntry[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return Array.isArray(parsed?.assets) ? parsed.assets : [];
  } catch {
    return [];
  }
}

function safeAssetPath(root: string, relativePath: string): string {
  if (
    typeof relativePath !== "string" ||
    !relativePath ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error("sprite path must be a non-empty relative path");
  }
  const base = path.resolve(root);
  const resolved = path.resolve(base, relativePath);
  if (resolved === base || !resolved.startsWith(`${base}${path.sep}`)) {
    throw new Error("sprite path escapes the project assets root");
  }
  return resolved;
}

function mimeFor(file: string): string {
  switch (path.extname(file).toLowerCase()) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    default:
      return "image/webp";
  }
}

function publicAsset(entry: AssetEntry, origin: SpriteOrigin) {
  return {
    id: entry.id,
    kind: entry.kind,
    game: entry.game,
    path: entry.path,
    origin,
    prompt: entry.prompt ?? null,
    provider: entry.provider ?? null,
    dimensions: entry.dimensions ?? null,
    frameSize: entry.frameSize ?? entry.dimensions ?? null,
    frames: entry.frames ?? 1,
    fps: entry.fps ?? null,
    views: entry.views ?? ["front"],
    sheet: entry.sheet ?? null,
    provenance: entry.provenance ?? null,
    human: entry.human ?? null,
    license: entry.license,
  };
}

function findEntry(
  target: ProjectTarget,
  selector: SpriteSelector,
): AssetEntry {
  if (!SPRITE_KINDS.has(selector.kind))
    throw new Error("only sprite assets can be edited");
  const entry = readEntries(manifestPath(target, selector.origin)).find(
    (candidate) =>
      candidate.id === selector.id && candidate.kind === selector.kind,
  );
  if (!entry)
    throw new Error(
      `sprite ${selector.id}:${selector.kind} is not ${selector.origin}`,
    );
  return entry;
}

function imageData(
  target: ProjectTarget,
  entry: AssetEntry,
  origin: SpriteOrigin,
): string {
  const file = safeAssetPath(contentRoot(target, origin), entry.path);
  const stat = fs.statSync(file);
  if (!stat.isFile()) throw new Error("sprite source is not a file");
  if (stat.size > MAX_INLINE_BYTES)
    throw new Error("sprite exceeds the 32 MiB editor limit");
  return `data:${mimeFor(file)};base64,${fs.readFileSync(file).toString("base64")}`;
}

function createSpriteEditorStore() {
  function list(target: ProjectTarget) {
    const drafts = readEntries(manifestPath(target, "draft"))
      .flatMap((entry) => SPRITE_KINDS.has(entry.kind) ? [publicAsset(entry, "draft")] : []);
    const promoted = readEntries(manifestPath(target, "promoted"))
      .flatMap((entry) => SPRITE_KINDS.has(entry.kind) ? [publicAsset(entry, "promoted")] : []);
    const assets = [...drafts, ...promoted].sort((a, b) =>
      a.id === b.id
        ? a.origin.localeCompare(b.origin)
        : a.id.localeCompare(b.id),
    );
    return { ok: true, projectId: target.id, game: target.slug, assets };
  }

  function load(target: ProjectTarget, selector: SpriteSelector) {
    const entry = findEntry(target, selector);
    return {
      ok: true,
      asset: publicAsset(entry, selector.origin),
      dataUrl: imageData(target, entry, selector.origin),
    };
  }

  async function saveDraft(
    target: ProjectTarget,
    selector: SpriteSelector,
    webp: Buffer,
  ) {
    if (!Buffer.isBuffer(webp) || webp.length === 0)
      throw new Error("edited sprite output is empty");
    if (webp.length > MAX_INLINE_BYTES)
      throw new Error("edited sprite exceeds the 32 MiB editor limit");
    const source = findEntry(target, selector);
    const edited: AssetEntry = {
      ...source,
      human: { authored: true, editKind: "pixel-editor" },
    };
    const draftRoot = contentRoot(target, "draft");
    const destination = safeAssetPath(draftRoot, edited.path);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    const temporary = `${destination}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, webp);
    fs.renameSync(temporary, destination);
    await register(manifestPath(target, "draft"), edited);
    return load(target, { id: edited.id, kind: edited.kind, origin: "draft" });
  }

  return { list, load, saveDraft };
}

export { createSpriteEditorStore, safeAssetPath };
export type { ProjectTarget, SpriteOrigin, SpriteSelector };
