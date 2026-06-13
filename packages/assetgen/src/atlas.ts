// Texture-atlas packer: pack a game's individual sprite frames into one or more
// padded, edge-extruded atlas pages + a deterministic JSON frame map. Gutters
// are edge-extruded (not transparent) so bilinear filtering never samples a
// neighbouring frame — the classic runtime "atlas bleed". Frames that overflow
// a page wrap onto additional pages (WebP caps at 16383px/side; default 4096).

import { readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";
import sharp from "sharp";

import { deriveGame, isPackedPageImage } from "./asset-index.ts";

export const ATLAS_VERSION = 1;

const IMAGE_EXTS = new Set([".png", ".webp"]);
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", ".turbo", "sources"]);

export interface AtlasFrame {
  id: string;
  game: string | null;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface AtlasPage {
  image: string;
  width: number;
  height: number;
}

export interface AtlasMap {
  version: number;
  game: string;
  padding: number;
  pages: AtlasPage[];
  frameCount: number;
  frames: AtlasFrame[];
}

export interface PackBox {
  id: string;
  w: number;
  h: number;
}

export interface PackedBox extends PackBox {
  page: number;
  x: number;
  y: number;
}

/**
 * Deterministic multi-page shelf packer: tallest-first, stable by id. Frames
 * fill rows up to `maxWidth`, rows stack up to `maxHeight`, and overflow starts
 * a new page. A single frame larger than a page gets its own (oversized) page.
 */
export function packPages(
  boxes: PackBox[],
  maxWidth: number,
  maxHeight: number,
): { pages: Array<{ width: number; height: number }>; placed: PackedBox[] } {
  const sorted = [...boxes].sort((a, b) => b.h - a.h || a.id.localeCompare(b.id));
  const placed: PackedBox[] = [];
  const pages: Array<{ width: number; height: number }> = [];

  let page = 0;
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  let pageWidth = 0;

  const closePage = () => {
    pages[page] = { width: pageWidth, height: y + rowHeight };
  };

  for (const box of sorted) {
    if (x > 0 && x + box.w > maxWidth) {
      // wrap to next row
      y += rowHeight;
      x = 0;
      rowHeight = 0;
    }
    if (y > 0 && y + box.h > maxHeight) {
      // overflow to next page
      closePage();
      page += 1;
      x = 0;
      y = 0;
      rowHeight = 0;
      pageWidth = 0;
    }
    placed.push({ ...box, page, x, y });
    x += box.w;
    rowHeight = Math.max(rowHeight, box.h);
    pageWidth = Math.max(pageWidth, x);
  }
  closePage();
  return { pages, placed };
}

/** One in-memory frame to pack: a stable id plus its raw image bytes. */
export interface FrameInput {
  id: string;
  data: Buffer;
}

/** Inner frame rect (id-keyed, gutter excluded) plus its page placement. */
export interface PackedFrame {
  id: string;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PackedFrames {
  /** Page dimensions in pack order; caller assigns image names. */
  pageDims: Array<{ width: number; height: number }>;
  /** One lossless-WebP buffer per page, indexed by page number. */
  images: Buffer[];
  /** Inner rects in the SAME order as `inputs` (not re-sorted), so callers can map back. */
  frames: PackedFrame[];
  padding: number;
}

/**
 * Pack already-in-memory frame buffers (e.g. freshly synthesized animation
 * frames) into padded, edge-extruded atlas page(s). Mirrors `buildAtlas`'s
 * compositing but skips the filesystem walk — it shares the same deterministic
 * shelf packer (`packPages`) so packing is identical. Frame ids must be unique.
 */
export async function packFrameBuffers(
  inputs: FrameInput[],
  opts: { padding?: number; maxWidth?: number; maxHeight?: number } = {},
): Promise<PackedFrames> {
  const padding = opts.padding ?? 2;
  const maxWidth = opts.maxWidth ?? 4096;
  const maxHeight = opts.maxHeight ?? 4096;
  if (inputs.length === 0) throw new Error("packFrameBuffers: no frames to pack");
  // Enforce the documented "Frame ids must be unique" contract: duplicate ids
  // would silently collapse onto one rect in the id-keyed Maps below.
  if (new Set(inputs.map((i) => i.id)).size !== inputs.length) {
    throw new Error("packFrameBuffers: duplicate frame ids");
  }

  const prepared: Array<{ id: string; innerW: number; innerH: number; padded: Buffer }> = [];
  for (const input of inputs) {
    const meta = await sharp(input.data).metadata();
    const innerW = meta.width ?? 0;
    const innerH = meta.height ?? 0;
    if (innerW === 0 || innerH === 0) throw new Error(`packFrameBuffers: frame "${input.id}" has zero dimensions`);
    const padded = await sharp(input.data)
      .ensureAlpha()
      .extend({ top: padding, bottom: padding, left: padding, right: padding, extendWith: "copy" })
      .png()
      .toBuffer();
    prepared.push({ id: input.id, innerW, innerH, padded });
  }

  const boxes: PackBox[] = prepared.map((p) => ({ id: p.id, w: p.innerW + padding * 2, h: p.innerH + padding * 2 }));
  const { pages, placed } = packPages(boxes, maxWidth, maxHeight);
  const placedById = new Map(placed.map((p) => [p.id, p]));
  const byId = new Map(prepared.map((p) => [p.id, p]));

  const images: Buffer[] = [];
  for (let page = 0; page < pages.length; page++) {
    const dims = pages[page]!;
    const composites = placed
      .filter((p) => p.page === page)
      .map((p) => ({ input: byId.get(p.id)!.padded, left: p.x, top: p.y }));
    images[page] = await sharp({
      create: { width: dims.width, height: dims.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite(composites)
      .webp({ lossless: true, effort: 5 })
      .toBuffer();
  }

  const frames: PackedFrame[] = prepared.map((p) => {
    const pos = placedById.get(p.id)!;
    return { id: p.id, page: pos.page, x: pos.x + padding, y: pos.y + padding, w: p.innerW, h: p.innerH };
  });

  return { pageDims: pages, images, frames, padding };
}

export interface BuildAtlasOptions {
  assetsDir: string;
  game?: string;
  /** Gutter (edge-extruded) around each frame, in px. Default 2. */
  padding?: number;
  /** Max page dimensions before wrapping/paging. Default 4096 (WebP-safe). */
  maxWidth?: number;
  maxHeight?: number;
  /** Base name for page images: `<base>.atlas<page>.webp`. Default `<game|all>`. */
  baseName?: string;
}

export interface AtlasResult {
  map: AtlasMap;
  /** One WebP buffer per page, indexed by page number. */
  images: Buffer[];
}

const toPosix = (p: string): string => p.split(sep).join("/");

async function walkImages(dir: string, out: string[]): Promise<void> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkImages(full, out);
    } else if (entry.isFile() && IMAGE_EXTS.has(extname(entry.name).toLowerCase()) && !isPackedPageImage(entry.name)) {
      out.push(full);
    }
  }
}

interface Prepared {
  id: string;
  game: string | null;
  innerW: number;
  innerH: number;
  padded: Buffer;
}

export async function buildAtlas(options: BuildAtlasOptions): Promise<AtlasResult> {
  const { assetsDir, game, padding = 2, maxWidth = 4096, maxHeight = 4096 } = options;
  if (!existsSync(assetsDir)) throw new Error(`assets directory not found: ${assetsDir}`);
  const base = options.baseName ?? game ?? "all";

  const files: string[] = [];
  await walkImages(assetsDir, files);

  const prepared: Prepared[] = [];
  for (const abs of files) {
    const rel = toPosix(relative(assetsDir, abs));
    if (game && deriveGame(rel) !== game) continue;
    const meta = await sharp(abs).metadata();
    const innerW = meta.width ?? 0;
    const innerH = meta.height ?? 0;
    if (innerW === 0 || innerH === 0) continue;
    const padded = await sharp(abs)
      .ensureAlpha()
      .extend({ top: padding, bottom: padding, left: padding, right: padding, extendWith: "copy" })
      .png()
      .toBuffer();
    prepared.push({ id: rel, game: deriveGame(rel), innerW, innerH, padded });
  }

  if (prepared.length === 0) {
    throw new Error(`no sprites to pack under ${assetsDir}${game ? ` for game "${game}"` : ""}`);
  }

  const boxes: PackBox[] = prepared.map((p) => ({ id: p.id, w: p.innerW + padding * 2, h: p.innerH + padding * 2 }));
  const { pages, placed } = packPages(boxes, maxWidth, maxHeight);
  const placedById = new Map(placed.map((p) => [p.id, p]));
  const byId = new Map(prepared.map((p) => [p.id, p]));

  const images: Buffer[] = [];
  for (let page = 0; page < pages.length; page++) {
    const dims = pages[page]!;
    const composites = placed
      .filter((p) => p.page === page)
      .map((p) => ({ input: byId.get(p.id)!.padded, left: p.x, top: p.y }));
    images[page] = await sharp({
      create: { width: dims.width, height: dims.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite(composites)
      .webp({ lossless: true, effort: 5 })
      .toBuffer();
  }

  const frames: AtlasFrame[] = prepared
    .map((p) => {
      const pos = placedById.get(p.id)!;
      return { id: p.id, game: p.game, page: pos.page, x: pos.x + padding, y: pos.y + padding, w: p.innerW, h: p.innerH };
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  const map: AtlasMap = {
    version: ATLAS_VERSION,
    game: game ?? "all",
    padding,
    pages: pages.map((d, i) => ({ image: `${base}.atlas${i}.webp`, width: d.width, height: d.height })),
    frameCount: frames.length,
    frames,
  };

  return { map, images };
}

export function serializeAtlasMap(map: AtlasMap): string {
  return `${JSON.stringify(map, null, 2)}\n`;
}
