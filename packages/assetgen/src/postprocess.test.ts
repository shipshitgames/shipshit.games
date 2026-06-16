import { describe, expect, test } from "bun:test";
import sharp from "sharp";

import { bleedAlphaEdges, tintHardOutline, toWebp } from "./postprocess.ts";

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

describe("tintHardOutline", () => {
  // Build a 5x5 RGBA buffer: a 3x3 opaque block centred at (2,2) whose outer
  // ring is near-black outline and whose centre is a coloured fill, surrounded
  // by a transparent margin. Every ring pixel touches transparent AND is
  // 8-adjacent to the fill, so all eight are tint candidates.
  function ringFixture(fill: [number, number, number] = [200, 100, 40]) {
    const w = 5, h = 5;
    const data = new Uint8Array(w * h * 4); // transparent black
    const set = (x: number, y: number, r: number, g: number, b: number, a: number) => {
      const i = (y * w + x) * 4;
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a;
    };
    for (let y = 1; y <= 3; y++) for (let x = 1; x <= 3; x++) set(x, y, 0, 0, 0, 255); // opaque black ring
    set(2, 2, fill[0], fill[1], fill[2], 255); // coloured fill core
    return { data, w, h, at: (x: number, y: number) => (y * w + x) * 4 };
  }

  test("lerps a real outline pixel halfway toward the enclosed fill", () => {
    const { data, w, h, at } = ringFixture([200, 100, 40]);
    tintHardOutline(data, w, h, { strength: 0.5 });

    // Top-centre ring pixel (2,1): only fill neighbour is the core, so it lerps
    // 0 -> round(fill * 0.5) per channel.
    const i = at(2, 1);
    expect(data[i]).toBe(100); // 200 * 0.5
    expect(data[i + 1]).toBe(50); // 100 * 0.5
    expect(data[i + 2]).toBe(20); // 40 * 0.5
    expect(data[i + 3]).toBe(255); // alpha never touched
  });

  test("strength 1 replaces the outline with the fill colour", () => {
    const { data, w, h, at } = ringFixture([180, 60, 240]);
    tintHardOutline(data, w, h, { strength: 1 });
    const i = at(1, 2); // left-centre ring pixel
    expect([data[i], data[i + 1], data[i + 2]]).toEqual([180, 60, 240]);
    expect(data[i + 3]).toBe(255);
  });

  test("strength 0 is a no-op", () => {
    const { data, w, h, at } = ringFixture();
    const before = Uint8Array.from(data);
    tintHardOutline(data, w, h, { strength: 0 });
    expect(data).toEqual(before);
    // sanity: the candidate pixel really is still pure black
    const i = at(2, 1);
    expect([data[i], data[i + 1], data[i + 2]]).toEqual([0, 0, 0]);
  });

  test("leaves outline pixels that touch no transparent margin untouched", () => {
    // Fully opaque 3x3: centre near-black, ring fill. The centre has fill
    // neighbours but no transparent neighbour, so it is not a candidate.
    const w = 3, h = 3;
    const data = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      data[i * 4] = 200; data[i * 4 + 1] = 100; data[i * 4 + 2] = 40; data[i * 4 + 3] = 255;
    }
    const c = (1 * w + 1) * 4;
    data[c] = 0; data[c + 1] = 0; data[c + 2] = 0; // opaque near-black centre
    tintHardOutline(data, w, h, { strength: 1 });
    expect([data[c], data[c + 1], data[c + 2]]).toEqual([0, 0, 0]);
  });

  test("leaves an isolated outline pixel with no fill neighbour untouched", () => {
    // Single opaque near-black pixel in a transparent field: touches transparent
    // but has no opaque non-black neighbour to sample, so it stays black.
    const w = 3, h = 3;
    const data = new Uint8Array(w * h * 4);
    const c = (1 * w + 1) * 4;
    data[c] = 0; data[c + 1] = 0; data[c + 2] = 0; data[c + 3] = 255;
    tintHardOutline(data, w, h, { strength: 1 });
    expect([data[c], data[c + 1], data[c + 2]]).toEqual([0, 0, 0]);
  });

  test("respects the near-black threshold (a dark-but-not-black outline is skipped)", () => {
    const { data, w, h, at } = ringFixture();
    // Repaint the ring as mid-grey (80) which exceeds the default threshold (32).
    for (let y = 1; y <= 3; y++) for (let x = 1; x <= 3; x++) {
      if (x === 2 && y === 2) continue;
      const i = at(x, y);
      data[i] = 80; data[i + 1] = 80; data[i + 2] = 80;
    }
    const before = Uint8Array.from(data);
    tintHardOutline(data, w, h, { strength: 1 }); // default threshold 32
    expect(data).toEqual(before);
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

  // An L-shaped silhouette (transparent top-right quadrant) with a black outline
  // around a red fill. The L touches all four image edges, so `trim()` crops
  // nothing and the transparent quadrant survives — meaning the black outline
  // along the L's inner corner still borders transparency post-trim, which is
  // exactly the geometry outline-tint repaints. (A solid rectangle would be
  // trimmed flush to its own edges, leaving the outline with no transparent
  // neighbour and making outline-tint a silent no-op.)
  async function ringSprite(): Promise<Buffer> {
    const W = 12, H = 12;
    const raw = Buffer.alloc(W * H * 4); // transparent
    const inShape = (x: number, y: number) => x < 6 || y >= 6; // left half ∪ bottom half
    const put = (x: number, y: number, r: number, g: number, b: number, a: number) => {
      const i = (y * W + x) * 4;
      raw[i] = r; raw[i + 1] = g; raw[i + 2] = b; raw[i + 3] = a;
    };
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (!inShape(x, y)) continue;
        // Boundary pixels (any 8-neighbour outside the shape or off-image) become
        // the black outline; interior pixels are red fill.
        let boundary = false;
        for (let dy = -1; dy <= 1 && !boundary; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H || !inShape(nx, ny)) { boundary = true; break; }
          }
        }
        if (boundary) put(x, y, 0, 0, 0, 255);
        else put(x, y, 210, 40, 40, 255);
      }
    }
    return sharp(raw, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
  }

  test("outlineTint is opt-in: default output leaves the buffer unchanged vs explicit-off", async () => {
    const src = await ringSprite();
    const off = await toWebp(src);
    const explicitOff = await toWebp(src, { outlineTint: false });
    expect(Buffer.compare(off, explicitOff)).toBe(0);
  });

  test("outlineTint:true recolours the silhouette, changing the encoded output", async () => {
    const src = await ringSprite();
    const off = await toWebp(src);
    const on = await toWebp(src, { outlineTint: true });
    // Still a valid lossless WebP of the same geometry...
    expect(headChunks(on)).toContain("VP8L");
    const [a, b] = await Promise.all([sharp(off).metadata(), sharp(on).metadata()]);
    expect(on.length).toBeGreaterThan(0);
    expect(b.width).toBe(a.width);
    expect(b.height).toBe(a.height);
    // ...but the recoloured outline makes the bytes differ from the default pass.
    expect(Buffer.compare(off, on)).not.toBe(0);
  });

  test("outlineTint with strength 0 matches the default (no recolour)", async () => {
    const src = await ringSprite();
    const off = await toWebp(src);
    const zeroed = await toWebp(src, { outlineTint: true, outlineTintStrength: 0 });
    expect(Buffer.compare(off, zeroed)).toBe(0);
  });
});
