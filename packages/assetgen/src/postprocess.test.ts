import { describe, expect, test } from "bun:test";
import sharp from "sharp";

import { bleedAlphaEdges, toWebp } from "./postprocess.ts";

const headChunks = (b: Buffer) => b.toString("latin1", 0, Math.min(b.length, 64));

describe("bleedAlphaEdges", () => {
  test("dilates opaque RGB into low-alpha neighbours without changing alpha", () => {
    const w = 5, h = 5;
    const data = new Uint8Array(w * h * 4); // transparent black
    const set = (x: number, y: number, r: number, g: number, b: number, a: number) => {
      const i = (y * w + x) * 4;
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a;
    };
    set(2, 2, 255, 0, 0, 255); // solid red core
    // dark semi-transparent ring (the kind of fringe lossy mattes leave behind)
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) set(2 + dx!, 2 + dy!, 0, 0, 0, 100);

    bleedAlphaEdges(data, w, h, 1);

    const above = (1 * w + 2) * 4; // pixel directly above the core
    expect(data[above]).toBe(255); // RGB bled from the red core
    expect(data[above + 1]).toBe(0);
    expect(data[above + 3]).toBe(100); // alpha untouched -> anti-aliasing preserved
  });

  test("stops early when nothing is solid", () => {
    const data = new Uint8Array(2 * 2 * 4); // all transparent
    expect(() => bleedAlphaEdges(data, 2, 2, 4)).not.toThrow();
  });
});

describe("toWebp", () => {
  async function sprite(): Promise<Buffer> {
    const core = await sharp({ create: { width: 8, height: 8, channels: 4, background: { r: 200, g: 30, b: 30, alpha: 1 } } })
      .png()
      .toBuffer();
    return sharp({ create: { width: 16, height: 16, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: core, left: 4, top: 4 }])
      .png()
      .toBuffer();
  }

  test("defaults to lossless WebP (clean edges)", async () => {
    const out = await toWebp(await sprite());
    expect(headChunks(out)).toContain("VP8L");
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe("webp");
  });

  test("honors lossless:false for lossy encoding", async () => {
    const out = await toWebp(await sprite(), { lossless: false });
    const head = headChunks(out);
    expect(head).not.toContain("VP8L");
    expect(head).toContain("VP8");
  });

  test("size option produces a square output", async () => {
    const out = await toWebp(await sprite(), { size: 32 });
    const meta = await sharp(out).metadata();
    expect(meta.width).toBe(32);
    expect(meta.height).toBe(32);
  });
});
