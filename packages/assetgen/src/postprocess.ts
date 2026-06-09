import sharp from "sharp";

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
 * Trim transparent edges, optionally fit into a square, defringe the alpha
 * edge, and encode an optimized (lossless by default) `.webp`.
 */
export async function toWebp(buf: Buffer, opts: ToWebpOptions = {}): Promise<Buffer> {
  const { size, lossless = true, quality = 90, defringe = true, defringePasses = 4 } = opts;

  let img = sharp(buf).trim();
  if (size) {
    img = img.resize(size, size, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    });
  }

  if (defringe) {
    const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    bleedAlphaEdges(data, info.width, info.height, defringePasses);
    img = sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } });
  }

  const webp = lossless ? { lossless: true, effort: 5 } : { quality, effort: 5 };
  return img.webp(webp).toBuffer();
}
