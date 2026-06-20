// pixelize — turn a raw AI "pixel-flavored" image into a clean, game-ready pixel
// sprite on a TRUE grid. The AI only approximates pixels; THIS enforces the grid +
// the fixed DOOM palette (see DESIGN.md assetgen.gradeParams). One shared engine:
// the `assetgen pixelize` CLI and the apps/desktop Sprites pane both call this.
//
// Pipeline: cutout -> trim -> box-downscale to target height -> nearest-color
// quantize to the fixed DOOM ramp -> hard 1px alpha -> lossless webp.
//
// Cutout backends (issue #66): "flood" is the original border flood-fill of
// near-black (only background CONNECTED to the edge goes transparent; interior dark
// body pixels are kept). "rembg" is subject segmentation for non-void / dark-bodied
// subjects that blend into the void. "auto" prefers rembg, falling back to the
// flood-fill when rembg is not installed. The core default is "flood" so every
// existing caller (expand, import-aseprite) stays byte-for-byte unchanged; the CLI
// and the studio Sprites pane default to "auto" — that's where #66 scopes the upgrade.
import sharp from "sharp";
import { maybeCutout } from "./cutout.ts";
import type { CutoutResult } from "./cutout.ts";
import type { CutoutMode } from "./pixelize-opts.ts";

export type { CutoutMode } from "./pixelize-opts.ts";

export type RGB = [number, number, number];

const hexToRgb = (h: string): RGB => {
  const n = parseInt(h.replace(/^#/, ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

// Fixed DOOM ramp (brand tokens + value steps so shading has somewhere to land).
// Toxic-green is included but should only appear where the source already glows it.
export const DOOM_RAMP: string[] = [
  "#000000", "#0a0a0a", "#161214", "#241a1a", // darks
  "#34343c", "#4a4a52", "#6a655e", "#8a8278", "#b3ab9e", "#e9e3d6", // metal -> bone
  "#3a0a0e", "#7a0f16", "#c1121f", "#ff2a18", // blood ramp
  "#5a2e18", "#8a4b2a", "#b06a32", "#d98a4a", // rust ramp
  "#a83c00", "#ff6a00", "#ffa030", "#ffce5c", // hellfire ramp
  "#2c5410", "#5a9a18", "#8bdc1f", // toxic ramp (Scourge only)
];

/** Named palettes the grid can lock to. DOOM is the house ramp + single source of truth. */
export const PIXELIZE_PALETTES: Record<string, string[]> = { doom: DOOM_RAMP };

/** Resolve a named palette to its hex ramp, or undefined for an unknown name. */
export function resolvePaletteByName(name?: string): string[] | undefined {
  if (!name) return undefined;
  return PIXELIZE_PALETTES[name.toLowerCase()];
}

let CACHE: { pal: RGB[]; key: string } | null = null;
function paletteRGB(palette: string[]): RGB[] {
  const key = palette.join(",");
  if (CACHE && CACHE.key === key) return CACHE.pal;
  const pal = palette.map(hexToRgb);
  CACHE = { pal, key };
  return pal;
}

function nearest(r: number, g: number, b: number, pal: RGB[]): RGB {
  const first = pal[0];
  if (!first) throw new Error("palette must contain at least one color");
  let best = first;
  let bd = Infinity;
  for (const p of pal) {
    // weighted euclidean (luma-ish) — keeps value steps clean
    const dr = r - p[0], dg = g - p[1], db = b - p[2];
    const d = 0.3 * dr * dr + 0.59 * dg * dg + 0.11 * db * db;
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

export interface PixelizeOpts {
  /** Target sprite HEIGHT in px (the grid). Rank-and-file ~110, boss ~180. */
  height?: number;
  /** Fixed palette (hex). Defaults to the DOOM ramp. */
  palette?: string[];
  /** Luminance (0-255) at/below which a pixel is treated as background -> transparent. */
  bgThreshold?: number;
  /** Trim transparent margins after cutout (default true). */
  trim?: boolean;
  /** Cutout backend. Default "flood" (preserves existing callers); CLI/studio pass "auto". */
  cutout?: CutoutMode;
  /** Injectable rembg cutout (tests) — defaults to the real maybeCutout. */
  cutoutFn?: (input: Buffer) => Promise<CutoutResult>;
}

export interface PixelizeCutoutInfo {
  /** Which cutout actually produced the alpha. */
  tool: "rembg" | "flood-fill" | "none";
  /** Why rembg was skipped, when "auto"/"rembg" fell back to the flood-fill. */
  reason?: string;
}

export interface PixelizeResult {
  /** Lossless-webp pixel sprite. */
  data: Buffer;
  cutout: PixelizeCutoutInfo;
}

// The original border FLOOD-FILL of near-black: only background CONNECTED to the
// edge goes transparent; interior dark body pixels are kept. Avoids the
// global-threshold bug that punches holes in a dark subject on a void bg.
async function floodFillCutout(input: Buffer, bgT: number): Promise<sharp.Sharp> {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, ch = info.channels;
  const cut = Buffer.from(data);
  const isBg = (i: number): boolean => {
    const o = i * ch;
    const r = cut[o] ?? 0;
    const g = cut[o + 1] ?? 0;
    const b = cut[o + 2] ?? 0;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b <= bgT;
  };
  const visited = new Uint8Array(W * H);
  const stack: number[] = [];
  const seed = (i: number) => { if (!visited[i] && isBg(i)) { visited[i] = 1; stack.push(i); } };
  for (let x = 0; x < W; x++) { seed(x); seed((H - 1) * W + x); }
  for (let y = 0; y < H; y++) { seed(y * W); seed(y * W + W - 1); }
  while (stack.length) {
    const i = stack.pop()!;
    cut[i * ch + 3] = 0; // background -> transparent
    const x = i % W, y = (i / W) | 0;
    if (x > 0) seed(i - 1);
    if (x < W - 1) seed(i + 1);
    if (y > 0) seed(i - W);
    if (y < H - 1) seed(i + W);
  }
  return sharp(cut, { raw: { width: W, height: H, channels: ch } });
}

// Resolve the cutout stage to an alpha-cut sharp image + which tool produced it.
async function resolveCutout(
  input: Buffer,
  opts: PixelizeOpts,
): Promise<{ img: sharp.Sharp; info: PixelizeCutoutInfo }> {
  const mode: CutoutMode = opts.cutout ?? "flood";
  const bgT = opts.bgThreshold ?? 42;
  if (mode === "none") return { img: sharp(input).ensureAlpha(), info: { tool: "none" } };
  if (mode === "flood") return { img: await floodFillCutout(input, bgT), info: { tool: "flood-fill" } };
  // "rembg" | "auto": try rembg, fall back to the flood-fill on any no-op.
  const res = await (opts.cutoutFn ?? maybeCutout)(input);
  if (res.applied) return { img: sharp(res.data).ensureAlpha(), info: { tool: "rembg" } };
  return { img: await floodFillCutout(input, bgT), info: { tool: "flood-fill", reason: res.reason } };
}

/** Raw AI image buffer -> clean, palette-locked, grid-true pixel sprite + the cutout used. */
export async function pixelizeDetailed(input: Buffer, opts: PixelizeOpts = {}): Promise<PixelizeResult> {
  const height = opts.height ?? 110;
  const pal = paletteRGB(opts.palette ?? DOOM_RAMP);

  // 1. cutout (flood-fill / rembg / none)
  const { img, info: cutout } = await resolveCutout(input, opts);

  // 2. trim, then box-downscale to the target grid
  let s = img;
  if (opts.trim !== false) s = s.trim();
  s = s.resize({ height, kernel: sharp.kernel.mitchell, fit: "inside", withoutEnlargement: false });

  // 3. quantize to the fixed ramp + hard 1px alpha
  const small = await s.raw().toBuffer({ resolveWithObject: true });
  const sd = Buffer.from(small.data);
  const sch = small.info.channels;
  for (let i = 0, n = small.info.width * small.info.height; i < n; i++) {
    const o = i * sch;
    if (sch === 4 && (sd[o + 3] ?? 0) < 128) { sd[o + 3] = 0; continue; } // stay transparent
    const [r, g, b] = nearest(sd[o] ?? 0, sd[o + 1] ?? 0, sd[o + 2] ?? 0, pal);
    sd[o] = r; sd[o + 1] = g; sd[o + 2] = b;
    if (sch === 4) sd[o + 3] = 255; // hard edge
  }

  // 4. lossless webp at native pixel size (engine scales up with NearestFilter)
  const data = await sharp(sd, { raw: { width: small.info.width, height: small.info.height, channels: sch } })
    .webp({ lossless: true })
    .toBuffer();
  return { data, cutout };
}

/** Raw AI image buffer -> clean, palette-locked, grid-true pixel sprite (lossless webp). */
export async function pixelize(input: Buffer, opts: PixelizeOpts = {}): Promise<Buffer> {
  return (await pixelizeDetailed(input, opts)).data;
}
