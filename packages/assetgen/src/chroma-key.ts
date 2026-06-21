// chroma-key — palette-aware matte removal + extraction guardrails (issue #115).
//
// `key-color.ts` decides WHICH flat key colour is safe; this module does the
// pixel work: detect the matte, key it out, harden alpha, strip visible key
// residue, then hand off to `postprocess.bleedAlphaEdges` so transparent-pixel
// RGB no longer pulls the key colour back in under runtime filtering. Square
// padding keeps a STABLE plate — we never tight-crop per frame, because a tight
// box makes flyers/animations jitter as the silhouette changes between poses.
//
// The buffer-level helpers are pure (operate on a raw RGBA `Uint8Array`) so they
// unit-test without disk or `sharp`; `extractWithKey` is the `sharp`-backed
// orchestration, mirroring how `postprocess.ts` splits pure passes from `toWebp`.

import sharp from "sharp";

import { bleedAlphaEdges } from "./postprocess.ts";
import {
  hexToRgb,
  rgbToHex,
  selectKeyColor,
  type KeySelection,
  type RGB,
} from "./key-color.ts";

/** Default matte distance below which a pixel is fully keyed transparent. */
export const DEFAULT_TOLERANCE = 70;
/** Default upper distance for the alpha-fade halo band between key and subject. */
export const DEFAULT_HALO = 115;

const distance = (r: number, g: number, b: number, key: RGB): number =>
  Math.hypot(r - key[0], g - key[1], b - key[2]);

/**
 * Key a flat matte colour out of a raw RGBA buffer, in place. Pixels within
 * `tolerance` of the key go fully transparent; pixels in the `tolerance..halo`
 * band fade proportionally (softens the cut edge). RGB is left intact so a later
 * defringe/bleed can sample it. Returns the count of fully-keyed pixels.
 */
export function keyOutMatte(
  data: Uint8Array | Buffer,
  width: number,
  height: number,
  key: RGB,
  opts: { tolerance?: number; halo?: number } = {},
): number {
  const tolerance = opts.tolerance ?? DEFAULT_TOLERANCE;
  const halo = Math.max(tolerance, opts.halo ?? DEFAULT_HALO);
  let keyed = 0;
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    const d = distance(data[o]!, data[o + 1]!, data[o + 2]!, key);
    if (d <= tolerance) {
      data[o + 3] = 0;
      keyed++;
    } else if (d <= halo) {
      const fade = (d - tolerance) / Math.max(1, halo - tolerance);
      data[o + 3] = Math.round((data[o + 3]!) * Math.max(0, Math.min(1, fade)));
    }
  }
  return keyed;
}

/**
 * Count still-VISIBLE pixels whose colour is within `tolerance` of the key —
 * i.e. key residue that survived extraction (the purple/green halo the
 * winged-host fix had to scrub). `opaqueAlpha` is the floor for "visible".
 */
export function countVisibleKeyPixels(
  data: Uint8Array | Buffer,
  width: number,
  height: number,
  key: RGB,
  opts: { tolerance?: number; opaqueAlpha?: number } = {},
): number {
  const tolerance = opts.tolerance ?? DEFAULT_TOLERANCE;
  const opaqueAlpha = opts.opaqueAlpha ?? 8;
  let count = 0;
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    if ((data[o + 3]!) < opaqueAlpha) continue;
    if (distance(data[o]!, data[o + 1]!, data[o + 2]!, key) <= tolerance) count++;
  }
  return count;
}

/**
 * Flood the matte out from the FRAME EDGES inward, setting border-connected
 * key-coloured pixels transparent, in place. Generalises
 * `sprites.transparentizeEdgeBackground` from near-black to an arbitrary key
 * colour. Unlike a flat threshold pass it only removes the connected background,
 * so any key-coloured pixels INSIDE the subject silhouette survive — exactly the
 * residue/holes a `countVisibleKeyPixels` pass then reports. Returns the count
 * of pixels cleared.
 */
export function floodKeyFromEdges(
  data: Uint8Array | Buffer,
  width: number,
  height: number,
  key: RGB,
  opts: { tolerance?: number } = {},
): number {
  const tolerance = opts.tolerance ?? DEFAULT_TOLERANCE;
  const total = width * height;
  const visited = new Uint8Array(total);
  const stack: number[] = [];
  let removed = 0;

  const isKey = (index: number): boolean => {
    const o = index * 4;
    if ((data[o + 3]!) < 8) return true; // already transparent counts as background
    return distance(data[o]!, data[o + 1]!, data[o + 2]!, key) <= tolerance;
  };
  const seed = (index: number) => {
    if (!visited[index] && isKey(index)) {
      visited[index] = 1;
      stack.push(index);
    }
  };

  for (let x = 0; x < width; x++) {
    seed(x);
    if (height > 1) seed((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    seed(y * width);
    if (width > 1) seed(y * width + width - 1);
  }

  while (stack.length) {
    const index = stack.pop()!;
    const o = index * 4 + 3;
    if ((data[o]!) !== 0) {
      data[o] = 0;
      removed++;
    }
    const x = index % width;
    const y = Math.floor(index / width);
    if (x > 0) seed(index - 1);
    if (x < width - 1) seed(index + 1);
    if (y > 0) seed(index - width);
    if (y < height - 1) seed(index + width);
  }
  return removed;
}

/**
 * Snap alpha to fully opaque or fully transparent around `threshold`, in place —
 * the hard pixel alpha a crisp pixel-art runtime expects. RGB untouched.
 */
export function hardenAlpha(
  data: Uint8Array | Buffer,
  width: number,
  height: number,
  threshold = 128,
): void {
  for (let i = 0; i < width * height; i++) {
    const a = data[i * 4 + 3]!;
    data[i * 4 + 3] = a >= threshold ? 255 : 0;
  }
}

export interface MatteDetection {
  /** Dominant border colour as `#rrggbb`. */
  hex: string;
  rgb: RGB;
  /** Share (0..1) of sampled border pixels within tolerance of that colour. */
  share: number;
  /** Share of border pixels that are already transparent (no matte to key). */
  transparentShare: number;
}

/**
 * Detect the flat matte colour by sampling the OUTER border ring (matte
 * backgrounds bleed to the frame edge). Quantises border colours into coarse
 * bins and returns the modal opaque bin plus its coverage, so a near-flat key is
 * recovered even with mild noise. Pure over the raw RGBA buffer.
 */
export function dominantMatteColor(
  data: Uint8Array | Buffer,
  width: number,
  height: number,
): MatteDetection {
  const bins = new Map<number, { r: number; g: number; b: number; n: number }>();
  let border = 0;
  let transparent = 0;
  const q = (v: number) => v >> 4; // 16-level quantisation per channel

  const sample = (x: number, y: number) => {
    const o = (y * width + x) * 4;
    border++;
    if ((data[o + 3]!) < 8) {
      transparent++;
      return;
    }
    const r = data[o]!, g = data[o + 1]!, b = data[o + 2]!;
    const code = (q(r) << 8) | (q(g) << 4) | q(b);
    const cur = bins.get(code) ?? { r: 0, g: 0, b: 0, n: 0 };
    cur.r += r; cur.g += g; cur.b += b; cur.n++;
    bins.set(code, cur);
  };

  for (let x = 0; x < width; x++) {
    sample(x, 0);
    if (height > 1) sample(x, height - 1);
  }
  for (let y = 1; y < height - 1; y++) {
    sample(0, y);
    if (width > 1) sample(width - 1, y);
  }

  let best: { r: number; g: number; b: number; n: number } | null = null;
  for (const bin of bins.values()) if (!best || bin.n > best.n) best = bin;

  const rgb: RGB = best
    ? [Math.round(best.r / best.n), Math.round(best.g / best.n), Math.round(best.b / best.n)]
    : [0, 0, 0];
  return {
    hex: rgbToHex(rgb),
    rgb,
    share: best && border > 0 ? best.n / border : 0,
    transparentShare: border > 0 ? transparent / border : 0,
  };
}

export interface ExtractWithKeyOptions {
  /** Subject palette as hex strings — drives safe-key selection + safety. */
  palette: readonly string[];
  /** Force a key (`#rrggbb` or a candidate name resolved by the caller). Auto-selects when omitted. */
  key?: string;
  /** Override the out-of-palette safety distance. */
  minDistance?: number;
  tolerance?: number;
  halo?: number;
  /** Square plate size; pads (never tight-crops) the keyed image to size×size. Omit to keep source dims. */
  size?: number;
  /** Snap to hard pixel alpha after keying. Default false. */
  hardAlpha?: boolean;
  /** Defringe passes bled outward after keying. Default 4. */
  defringePasses?: number;
}

export interface ExtractWithKeyResult {
  /** Lossless WebP of the keyed, guardrailed sprite. */
  data: Buffer;
  /** The key that was selected/validated, with its safety reason. */
  key: KeySelection;
  /** [width, height] of the emitted plate. */
  dimensions: [number, number];
  /**
   * Visible key-coloured pixels matched in the SOURCE (`before`, includes the
   * matte being removed) and remaining after the full cleanup chain (`after`,
   * should be ~0 for a clean extraction).
   */
  residual: { before: number; after: number };
}

/**
 * Key a matte out of one source image and apply the full guardrail chain:
 * select/validate an out-of-palette key → key out the matte → optional hard
 * alpha → defringe (bleed subject RGB into the margin) → stable square pad →
 * lossless WebP. Returns the bytes plus the key selection + residue metrics so a
 * caller can record the chosen colour and why (issue #115 acceptance).
 */
export async function extractWithKey(input: Buffer, opts: ExtractWithKeyOptions): Promise<ExtractWithKeyResult> {
  const selection = opts.key
    ? selectKeyColor({ palette: opts.palette, prefer: opts.key, minDistance: opts.minDistance })
    : selectKeyColor({ palette: opts.palette, minDistance: opts.minDistance });
  const keyRgb = hexToRgb(selection.hex);

  const { data: raw, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const data = new Uint8Array(raw);
  const { width, height } = info;

  const residualBefore = countVisibleKeyPixels(data, width, height, keyRgb, { tolerance: opts.tolerance });

  keyOutMatte(data, width, height, keyRgb, { tolerance: opts.tolerance, halo: opts.halo });
  if (opts.hardAlpha) hardenAlpha(data, width, height);
  bleedAlphaEdges(data, width, height, opts.defringePasses ?? 4);

  const residualAfter = countVisibleKeyPixels(data, width, height, keyRgb, { tolerance: opts.tolerance });

  let img = sharp(Buffer.from(data), { raw: { width, height, channels: 4 } });
  let outWidth = width;
  let outHeight = height;
  if (opts.size && opts.size > 0) {
    const size = Math.floor(opts.size);
    if (width <= size && height <= size) {
      // Stable plate: centre-pad to the square, never trim — keeps the subject's
      // anchor fixed across an action's frames.
      img = img.extend({
        left: Math.floor((size - width) / 2),
        right: Math.ceil((size - width) / 2),
        top: Math.floor((size - height) / 2),
        bottom: Math.ceil((size - height) / 2),
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      });
    } else {
      // Oversized source: contain-fit with nearest to preserve hard pixels.
      img = img.resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: "nearest" });
    }
    outWidth = size;
    outHeight = size;
  }

  const out = await img.webp({ lossless: true, effort: 5 }).toBuffer();
  return {
    data: out,
    key: selection,
    dimensions: [outWidth, outHeight],
    residual: { before: residualBefore, after: residualAfter },
  };
}
