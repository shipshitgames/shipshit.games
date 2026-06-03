import sharp from "sharp";

/** Trim transparent edges, optionally fit into a square, encode optimized .webp. */
export async function toWebp(buf: Buffer, opts: { size?: number } = {}): Promise<Buffer> {
  let img = sharp(buf).trim();
  if (opts.size) {
    img = img.resize(opts.size, opts.size, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    });
  }
  return img.webp({ quality: 90, effort: 5 }).toBuffer();
}
