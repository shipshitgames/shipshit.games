// Asset indexer core: scan an assets directory and produce a canonical,
// deterministic assets.index.json that agents can trust. Game-aware (every
// asset is tagged with its game), with 2D image analysis via sharp and a
// dependency-free glTF/GLB metadata parser for 3D models.

import { readFile, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";
import sharp from "sharp";

import { GAME_SLUGS, type GameSlug } from "./assets-package.ts";

export const ASSET_INDEX_VERSION = 1;
export const ASSET_INDEX_FILE = "assets.index.json";

const IMAGE_EXTS = new Set([".png", ".webp", ".jpg", ".jpeg", ".gif"]);
const MODEL_EXTS = new Set([".glb", ".gltf"]);
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", ".turbo", "sources"]);

/**
 * True for already-packed atlas page images (`<base>.atlas0.webp`) and expanded
 * sprite-anim pages (`<id>.anim0.webp`). Asset walkers must skip these so a
 * second `assetgen atlas`/`index` run never re-packs an already-packed sheet.
 */
export function isPackedPageImage(name: string): boolean {
  return /\.(atlas|anim)\d*\.webp$/i.test(name);
}
/** Above this frame count we skip per-frame blank scanning to stay fast. */
const MAX_SHEET_FRAMES = 256;

export interface SheetInfo {
  frameWidth: number;
  frameHeight: number;
  cols: number;
  rows: number;
  frames: number;
  /** Frame indices (row-major) that are empty/transparent, when scanned. */
  blankFrames: number[];
}

export interface ImageAsset {
  path: string;
  type: "image";
  game: string | null;
  group: string;
  id: string | null;
  format: string;
  width: number;
  height: number;
  hasAlpha: boolean;
  bytes: number;
  blank: boolean;
  sheet: SheetInfo | null;
  inCatalog: boolean;
}

export interface ModelAnimation {
  name: string;
  durationSeconds: number;
  channels: number;
  /** Best-effort: glTF does not encode looping, so this is a name heuristic. */
  loops: boolean;
}

export interface ModelAsset {
  path: string;
  type: "model";
  game: string | null;
  group: string;
  id: string | null;
  format: "glb" | "gltf";
  bytes: number;
  meshes: number;
  materials: number;
  textures: number;
  skins: number;
  joints: number;
  animations: ModelAnimation[];
}

export type Asset = ImageAsset | ModelAsset;

export interface GameSummary {
  game: string;
  images: number;
  models: number;
  blank: number;
  total: number;
}

export interface AssetIndex {
  version: number;
  generatedFrom: string;
  assetCount: number;
  images: number;
  models: number;
  games: GameSummary[];
  assets: Asset[];
}

export interface BuildIndexOptions {
  assetsDir: string;
  /** Limit the index to a single game's assets. */
  game?: string;
  /** Treat images as sprite sheets of this cell size (e.g. "64x64"). */
  frameSize?: { width: number; height: number };
}

const LOOP_HINT = /\b(idle|loop|walk|run|fly|float|hover|breath|spin|cycle)\b/i;

// ── glTF / GLB parsing ─────────────────────────────────────────────────────

const GLB_MAGIC = 0x46546c67; // "glTF"
const GLB_CHUNK_JSON = 0x4e4f534a; // "JSON"

interface GltfAccessor {
  max?: number[];
}
interface GltfAnimationSampler {
  input: number;
}
interface GltfAnimation {
  name?: string;
  samplers?: GltfAnimationSampler[];
  channels?: unknown[];
}
interface GltfSkin {
  joints?: number[];
}
interface GltfDocument {
  meshes?: unknown[];
  materials?: unknown[];
  textures?: unknown[];
  skins?: GltfSkin[];
  animations?: GltfAnimation[];
  accessors?: GltfAccessor[];
}

/** Extract the glTF JSON document from a .glb (binary container) or .gltf buffer. */
export function parseGltfJson(buffer: Buffer): GltfDocument {
  if (buffer.length >= 12 && buffer.readUInt32LE(0) === GLB_MAGIC) {
    let offset = 12;
    while (offset + 8 <= buffer.length) {
      const chunkLength = buffer.readUInt32LE(offset);
      const chunkType = buffer.readUInt32LE(offset + 4);
      const start = offset + 8;
      if (chunkType === GLB_CHUNK_JSON) {
        return JSON.parse(buffer.subarray(start, start + chunkLength).toString("utf8")) as GltfDocument;
      }
      offset = start + chunkLength;
    }
    throw new Error("GLB file has no JSON chunk");
  }
  return JSON.parse(buffer.toString("utf8")) as GltfDocument;
}

function animationDuration(animation: GltfAnimation, accessors: GltfAccessor[]): number {
  let max = 0;
  for (const sampler of animation.samplers ?? []) {
    const accessor = accessors[sampler.input];
    const t = accessor?.max?.[0];
    if (typeof t === "number" && t > max) max = t;
  }
  return Number(max.toFixed(4));
}

function summarizeModel(doc: GltfDocument): Pick<ModelAsset, "meshes" | "materials" | "textures" | "skins" | "joints" | "animations"> {
  const accessors = doc.accessors ?? [];
  const skins = doc.skins ?? [];
  return {
    meshes: doc.meshes?.length ?? 0,
    materials: doc.materials?.length ?? 0,
    textures: doc.textures?.length ?? 0,
    skins: skins.length,
    joints: skins.reduce((n, s) => n + (s.joints?.length ?? 0), 0),
    animations: (doc.animations ?? []).map((anim, i) => {
      const name = anim.name ?? `animation_${i}`;
      return {
        name,
        durationSeconds: animationDuration(anim, accessors),
        channels: anim.channels?.length ?? 0,
        loops: LOOP_HINT.test(name),
      };
    }),
  };
}

// ── path / game classification ─────────────────────────────────────────────

function toPosix(p: string): string {
  return p.split(sep).join("/");
}

const GAME_SET = new Set<string>(GAME_SLUGS);

function stripExt(name: string): string {
  const ext = extname(name);
  return ext ? name.slice(0, -ext.length) : name;
}

/** Derive the owning game slug from an asset's relative posix path, or null. */
export function deriveGame(relPosix: string): string | null {
  const parts = relPosix.split("/");
  for (let i = 0; i < parts.length; i++) {
    const seg = i === parts.length - 1 ? stripExt(parts[i]!) : parts[i]!;
    if (GAME_SET.has(seg)) return seg;
  }
  return null;
}

function classify(relPosix: string): { group: string; id: string | null } {
  const parts = relPosix.split("/");
  const group = parts[0] ?? "";
  // entities/<id>/<game>.ext -> id is the entity folder.
  const id = parts.length >= 3 ? (parts[1] ?? null) : null;
  return { group, id };
}

// ── image analysis ─────────────────────────────────────────────────────────

interface Uniformity {
  uniform: boolean;
  transparent: boolean;
}

async function regionUniformity(image: sharp.Sharp): Promise<Uniformity> {
  const stats = await image.stats();
  const channels = stats.channels;
  const uniform = channels.length > 0 && channels.every((c) => c.max - c.min < 1);
  const alpha = channels.length >= 4 ? channels[channels.length - 1] : undefined;
  const transparent = alpha !== undefined && alpha.max === 0;
  return { uniform, transparent };
}

async function analyzeImage(
  absPath: string,
  relPosix: string,
  bytes: number,
  inCatalog: boolean,
  frameSize?: { width: number; height: number },
): Promise<ImageAsset> {
  const meta = await sharp(absPath).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  const hasAlpha = meta.hasAlpha ?? false;
  const { uniform, transparent } = await regionUniformity(sharp(absPath));
  const { group, id } = classify(relPosix);

  let sheet: SheetInfo | null = null;
  if (frameSize && frameSize.width > 0 && frameSize.height > 0 && width > 0 && height > 0) {
    const cols = Math.floor(width / frameSize.width);
    const rows = Math.floor(height / frameSize.height);
    const frames = cols * rows;
    const blankFrames: number[] = [];
    if (frames > 0 && frames <= MAX_SHEET_FRAMES) {
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          // sharp's stats() reads the input image, not pipeline output, so the
          // cell must be materialized to a buffer before its stats are read.
          const cellBuffer = await sharp(absPath)
            .extract({
              left: c * frameSize.width,
              top: r * frameSize.height,
              width: frameSize.width,
              height: frameSize.height,
            })
            .png()
            .toBuffer();
          const u = await regionUniformity(sharp(cellBuffer));
          if (u.uniform || u.transparent) blankFrames.push(r * cols + c);
        }
      }
    }
    sheet = { frameWidth: frameSize.width, frameHeight: frameSize.height, cols, rows, frames, blankFrames };
  }

  return {
    path: relPosix,
    type: "image",
    game: deriveGame(relPosix),
    group,
    id,
    format: meta.format ?? extname(absPath).slice(1),
    width,
    height,
    hasAlpha,
    bytes,
    blank: uniform || transparent,
    sheet,
    inCatalog,
  };
}

async function analyzeModel(absPath: string, relPosix: string, bytes: number, inCatalog: boolean): Promise<ModelAsset> {
  const buffer = await readFile(absPath);
  const doc = parseGltfJson(buffer);
  const { group, id } = classify(relPosix);
  return {
    path: relPosix,
    type: "model",
    game: deriveGame(relPosix),
    group,
    id,
    format: extname(absPath).toLowerCase() === ".glb" ? "glb" : "gltf",
    bytes,
    ...summarizeModel(doc),
  };
}

// ── catalog enrichment ───────────────────────────────────────────────────────

async function readCatalogIds(assetsDir: string): Promise<Set<string>> {
  const ids = new Set<string>();
  const catalogPath = join(assetsDir, "assets-catalog.json");
  if (!existsSync(catalogPath)) return ids;
  try {
    const catalog = JSON.parse(await readFile(catalogPath, "utf8")) as {
      entities?: { id?: string }[];
      shared?: { id?: string }[];
    };
    for (const e of [...(catalog.entities ?? []), ...(catalog.shared ?? [])]) {
      if (e.id) ids.add(e.id);
    }
  } catch {
    // A malformed catalog should not abort indexing.
  }
  return ids;
}

// ── walk + build ─────────────────────────────────────────────────────────────

async function walk(dir: string, out: string[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, out);
    } else if (entry.isFile()) {
      const ext = extname(entry.name).toLowerCase();
      if (isPackedPageImage(entry.name)) continue; // skip already-packed atlas/anim pages
      if (IMAGE_EXTS.has(ext) || MODEL_EXTS.has(ext)) out.push(full);
    }
  }
}

function rollupGames(assets: Asset[]): GameSummary[] {
  const map = new Map<string, GameSummary>();
  for (const asset of assets) {
    const key = asset.game ?? "shared";
    let s = map.get(key);
    if (!s) {
      s = { game: key, images: 0, models: 0, blank: 0, total: 0 };
      map.set(key, s);
    }
    s.total++;
    if (asset.type === "image") {
      s.images++;
      if (asset.blank) s.blank++;
    } else {
      s.models++;
    }
  }
  return [...map.values()].sort((a, b) => a.game.localeCompare(b.game));
}

export async function buildAssetIndex(options: BuildIndexOptions): Promise<AssetIndex> {
  const { assetsDir, game, frameSize } = options;
  if (!existsSync(assetsDir)) {
    throw new Error(`assets directory not found: ${assetsDir}`);
  }
  const catalogIds = await readCatalogIds(assetsDir);
  const files: string[] = [];
  await walk(assetsDir, files);

  const assets: Asset[] = [];
  for (const absPath of files) {
    const relPosix = toPosix(relative(assetsDir, absPath));
    if (game && deriveGame(relPosix) !== game) continue;
    const ext = extname(absPath).toLowerCase();
    const bytes = (await stat(absPath)).size;
    const { id } = classify(relPosix);
    const inCatalog = id !== null && catalogIds.has(id);
    try {
      if (MODEL_EXTS.has(ext)) {
        assets.push(await analyzeModel(absPath, relPosix, bytes, inCatalog));
      } else {
        assets.push(await analyzeImage(absPath, relPosix, bytes, inCatalog, frameSize));
      }
    } catch (error) {
      throw new Error(`failed to index ${relPosix}: ${(error as Error).message}`);
    }
  }

  assets.sort((a, b) => a.path.localeCompare(b.path));
  const images = assets.filter((a) => a.type === "image").length;

  return {
    version: ASSET_INDEX_VERSION,
    generatedFrom: game ?? "all",
    assetCount: assets.length,
    images,
    models: assets.length - images,
    games: rollupGames(assets),
    assets,
  };
}

/** Stable JSON serialization for deterministic, reviewable output. */
export function serializeAssetIndex(index: AssetIndex): string {
  return `${JSON.stringify(index, null, 2)}\n`;
}

export interface CheckResult {
  stale: boolean;
  reason: string;
}

/** Compare a freshly built index against the one on disk at `indexPath`. */
export async function checkAssetIndex(index: AssetIndex, indexPath: string): Promise<CheckResult> {
  if (!existsSync(indexPath)) {
    return { stale: true, reason: `no index at ${indexPath} — run \`assetgen index\` to create it` };
  }
  const current = await readFile(indexPath, "utf8");
  const fresh = serializeAssetIndex(index);
  if (current === fresh) return { stale: false, reason: "up to date" };
  return { stale: true, reason: `index at ${indexPath} is out of date — re-run \`assetgen index\`` };
}

export type { GameSlug };
