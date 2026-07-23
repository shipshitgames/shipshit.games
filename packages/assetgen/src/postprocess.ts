import sharp from "sharp";
import { softGradeRgba, type ColorGamutReport, type SoftGradeConfig } from "./soft-grade";

/** Round to the nearest integer and clamp into a valid 0-255 RGBA channel byte. */
function toByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

export interface ToWebpOptions {
  size?: number;
  /**
   * Lossless WebP keeps sprite/alpha edges clean (lossy WebP smears the alpha
   * boundary into a halo). Default true — these are game sprites.
   */
  lossless?: boolean;
  /** Quality for lossy mode (ignored when lossless). */
  quality?: number;
  /**
   * Bleed opaque RGB outward into the semi-transparent / transparent margin so
   * edge pixels carry the subject's colour instead of background black. Kills
   * the dark-halo fringe (and runtime atlas bleed under bilinear filtering)
   * without touching the alpha shape, so anti-aliasing is preserved. Default true.
   */
  defringe?: boolean;
  /** How many pixel rings to bleed outward (default 4). */
  defringePasses?: number;
  /**
   * Tint hard black outline pixels (opaque near-black pixels that touch the
   * transparent margin) toward the fill colour they enclose, so a deliberate
   * 1px silhouette line stops reading as a harsh cutout once the sprite is
   * composited over a stylised background. Complementary to `defringe`/
   * `bleedAlphaEdges` — that pass only repaints the *invisible* RGB of
   * transparent pixels; this one repaints the *visible* opaque outline itself.
   * Opt-in — default false (no behaviour change unless enabled).
   */
  outlineTint?: boolean;
  /** Lerp strength (0..1) from the outline colour toward the fill colour when `outlineTint` is on. Default 0.5. */
  outlineTintStrength?: number;
  /** Max value any RGB channel may have for a pixel to count as a "black" outline. Default 32. */
  outlineTintThreshold?: number;
  /** Opt into the canonical non-destructive color grade and advisory report. */
  softGrade?: boolean | Partial<SoftGradeConfig>;
}

export interface ToWebpResult {
  data: Buffer;
  colorGamutReport?: ColorGamutReport;
}

export interface OutlineTintOptions {
  /**
   * A pixel counts as a near-black outline when `max(r,g,b) <= threshold`
   * (0-255). Default 32 — catches deliberate black silhouette lines while
   * ignoring merely dark fill.
   */
  threshold?: number;
  /**
   * Lerp factor (0..1) from the outline's own colour toward the sampled fill
   * colour. 0 leaves the outline untouched; 1 replaces it with the neighbour
   * fill. Clamped into range. Default 0.5.
   */
  strength?: number;
  /** Alpha at/above which a pixel is treated as opaque sprite body. Default 250. */
  solidAlpha?: number;
}

/**
 * Dilate solid-pixel RGB outward into lower-alpha pixels, in place. Alpha is
 * never modified — only the (otherwise invisible) RGB of edge/transparent
 * pixels — so the cut stays soft but no longer fringes dark when filtered or
 * composited. Pure over the raw RGBA buffer, so it is unit-testable.
 */
export function bleedAlphaEdges(
  data: Uint8Array | Buffer,
  width: number,
  height: number,
  passes = 4,
  solidAlpha = 250,
): void {
  const solid = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) solid[i] = data[i * 4 + 3]! >= solidAlpha ? 1 : 0;

  const neighbors = [
    [-1, 0], [1, 0], [0, -1], [0, 1],
    [-1, -1], [1, -1], [-1, 1], [1, 1],
  ];

  for (let pass = 0; pass < passes; pass++) {
    const filled: number[] = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const s = y * width + x;
        if (solid[s]) continue;
        for (const [dx, dy] of neighbors) {
          const nx = x + dx!;
          const ny = y + dy!;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          if (!solid[ny * width + nx]) continue;
          const di = s * 4;
          const si = (ny * width + nx) * 4;
          data[di] = data[si]!;
          data[di + 1] = data[si + 1]!;
          data[di + 2] = data[si + 2]!;
          filled.push(s);
          break;
        }
      }
    }
    if (filled.length === 0) break;
    for (const s of filled) solid[s] = 1;
  }
}

/**
 * Tint hard black outline pixels toward the colour of the fill they enclose, in
 * place. A 1px black silhouette line that touches transparent pixels reads as a
 * harsh cutout once the sprite is composited over a stylised background; nudging
 * those outline pixels toward the adjacent fill softens the seam without
 * dissolving the silhouette. Orthogonal to `bleedAlphaEdges`: that pass repaints
 * the (invisible) RGB of transparent margin pixels, while this one repaints the
 * visible opaque outline itself.
 *
 * Only opaque, near-black pixels that are 8-adjacent to a fully transparent
 * pixel are candidates; each is lerped toward the average colour of its opaque,
 * non-black neighbours. Candidates with no fill neighbour are left untouched
 * (nothing to sample). Alpha is never modified, so the silhouette shape and
 * anti-aliasing survive. Pure over the raw RGBA buffer — reads every original
 * value before writing any, so the result is order-independent and unit-testable.
 */
export function tintHardOutline(
  data: Uint8Array | Buffer,
  width: number,
  height: number,
  opts: OutlineTintOptions = {},
): void {
  const threshold = Math.max(0, Math.min(255, opts.threshold ?? 32));
  const strength = Math.max(0, Math.min(1, opts.strength ?? 0.5));
  const solidAlpha = opts.solidAlpha ?? 250;
  if (strength === 0) return;

  const count = width * height;
  const opaque = new Uint8Array(count);
  const nearBlack = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    const op = data[i * 4 + 3]! >= solidAlpha ? 1 : 0;
    opaque[i] = op;
    if (op) {
      const r = data[i * 4]!;
      const g = data[i * 4 + 1]!;
      const b = data[i * 4 + 2]!;
      nearBlack[i] = Math.max(r, g, b) <= threshold ? 1 : 0;
    }
  }

  const neighbors = [
    [-1, 0], [1, 0], [0, -1], [0, 1],
    [-1, -1], [1, -1], [-1, 1], [1, 1],
  ];

  // Collect the new colours first and apply them after the full scan, so a
  // freshly tinted outline pixel never feeds the sampling of an adjacent one.
  const updates: Array<[number, number, number, number]> = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const s = y * width + x;
      if (!opaque[s] || !nearBlack[s]) continue;

      let touchesTransparent = false;
      let fr = 0, fg = 0, fb = 0, fills = 0;
      for (const [dx, dy] of neighbors) {
        const nx = x + dx!;
        const ny = y + dy!;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const ni = ny * width + nx;
        if (data[ni * 4 + 3]! === 0) touchesTransparent = true;
        if (opaque[ni] && !nearBlack[ni]) {
          fr += data[ni * 4]!;
          fg += data[ni * 4 + 1]!;
          fb += data[ni * 4 + 2]!;
          fills++;
        }
      }
      if (!touchesTransparent || fills === 0) continue;

      const r0 = data[s * 4]!;
      const g0 = data[s * 4 + 1]!;
      const b0 = data[s * 4 + 2]!;
      // A lerp of two in-range channels stays in [0,255]; clamp anyway so the
      // pass can never write an out-of-range byte if fed unusual fill values.
      updates.push([
        s,
        toByte(r0 + (fr / fills - r0) * strength),
        toByte(g0 + (fg / fills - g0) * strength),
        toByte(b0 + (fb / fills - b0) * strength),
      ]);
    }
  }

  for (const [s, r, g, b] of updates) {
    data[s * 4] = r;
    data[s * 4 + 1] = g;
    data[s * 4 + 2] = b;
    // alpha (s*4 + 3) deliberately untouched
  }
}

/**
 * Trim transparent edges, optionally fit into a square, tint hard outlines,
 * defringe the alpha edge, and encode an optimized (lossless by default) `.webp`.
 */
export async function toWebp(buf: Buffer, opts: ToWebpOptions = {}): Promise<Buffer> {
  return (await toWebpDetailed(buf, opts)).data;
}

/** `toWebp` plus the optional advisory gamut report used by pipeline sidecars. */
export async function toWebpDetailed(buf: Buffer, opts: ToWebpOptions = {}): Promise<ToWebpResult> {
  const {
    size,
    lossless = true,
    quality = 90,
    defringe = true,
    defringePasses = 4,
    outlineTint = false,
    outlineTintStrength = 0.5,
    outlineTintThreshold = 32,
    softGrade = false,
  } = opts;

  let img = sharp(buf).trim();
  if (size) {
    img = img.resize(size, size, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    });
  }

  let colorGamutReport: ColorGamutReport | undefined;
  if (defringe || outlineTint || softGrade) {
    const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    if (softGrade) {
      colorGamutReport = softGradeRgba(
        data,
        info.width,
        info.height,
        typeof softGrade === "object" ? softGrade : {},
      ).report;
    }
    // Tint the outline first so the recoloured silhouette — not raw black — is
    // what `bleedAlphaEdges` then dilates outward into the transparent margin.
    if (outlineTint) {
      tintHardOutline(data, info.width, info.height, {
        strength: outlineTintStrength,
        threshold: outlineTintThreshold,
      });
    }
    if (defringe) bleedAlphaEdges(data, info.width, info.height, defringePasses);
    img = sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } });
  }

  const webp = lossless ? { lossless: true, effort: 5 } : { quality, effort: 5 };
  const data = await img.webp(webp).toBuffer();
  return { data, ...(colorGamutReport ? { colorGamutReport } : {}) };
}
