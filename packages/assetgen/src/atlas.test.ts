import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";

import { buildAtlas, packFrameBuffers, packPages, type FrameInput, type PackBox } from "./atlas.ts";
import { isPackedPageImage } from "./asset-index.ts";

async function solidFrame(id: string, w: number, h: number, rgb: { r: number; g: number; b: number }): Promise<FrameInput> {
  const data = await sharp({ create: { width: w, height: h, channels: 4, background: { ...rgb, alpha: 1 } } }).png().toBuffer();
  return { id, data };
}

function overlaps(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

describe("packPages", () => {
  const boxes: PackBox[] = [
    { id: "a", w: 30, h: 40 },
    { id: "b", w: 50, h: 20 },
    { id: "c", w: 40, h: 40 },
    { id: "d", w: 90, h: 10 },
  ];

  test("no two boxes on the same page overlap", () => {
    const { placed } = packPages(boxes, 100, 1000);
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        if (placed[i]!.page !== placed[j]!.page) continue;
        expect(overlaps(placed[i]!, placed[j]!)).toBe(false);
      }
    }
  });

  test("overflows onto additional pages when height is exceeded", () => {
    const tall: PackBox[] = Array.from({ length: 5 }, (_, i) => ({ id: `b${i}`, w: 50, h: 60 }));
    const { pages, placed } = packPages(tall, 100, 100); // 2 per row, one row per page
    expect(pages.length).toBeGreaterThan(1);
    expect(placed.length).toBe(5);
  });

  test("is deterministic", () => {
    expect(JSON.stringify(packPages(boxes, 100, 1000))).toBe(JSON.stringify(packPages(boxes, 100, 1000)));
  });
});

describe("buildAtlas (fixture)", () => {
  let dir: string;
  const colors: Record<string, { r: number; g: number; b: number; w: number; h: number }> = {
    "games/scourge-survivors/red.png": { r: 220, g: 20, b: 20, w: 20, h: 30 },
    "games/scourge-survivors/green.png": { r: 20, g: 200, b: 20, w: 40, h: 12 },
    "games/scourge-survivors/blue.png": { r: 20, g: 20, b: 220, w: 16, h: 16 },
  };

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "assetgen-atlas-"));
    await mkdir(join(dir, "games", "scourge-survivors"), { recursive: true });
    for (const [rel, c] of Object.entries(colors)) {
      await sharp({ create: { width: c.w, height: c.h, channels: 4, background: { r: c.r, g: c.g, b: c.b, alpha: 1 } } })
        .png()
        .toFile(join(dir, rel));
    }
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test("packs a game's sprites into atlas page(s) + a deterministic frame map", async () => {
    const { map, images } = await buildAtlas({ assetsDir: dir, game: "scourge-survivors", padding: 2 });
    expect(map.frameCount).toBe(3);
    expect(images.length).toBe(map.pages.length);
    expect(map.pages.length).toBe(1); // three tiny frames fit one page
    expect(map.frames.map((f) => f.id)).toEqual([...map.frames.map((f) => f.id)].sort());
    expect(map.frames.every((f) => f.game === "scourge-survivors")).toBe(true);

    // inner rects on the same page never overlap (extruded gutter keeps them apart)
    for (let i = 0; i < map.frames.length; i++) {
      for (let j = i + 1; j < map.frames.length; j++) {
        if (map.frames[i]!.page !== map.frames[j]!.page) continue;
        expect(overlaps(map.frames[i]!, map.frames[j]!)).toBe(false);
      }
    }

    // recorded size matches source; atlas pixels at the rect are the frame colour
    for (const f of map.frames) {
      const c = colors[f.id]!;
      expect(f.w).toBe(c.w);
      expect(f.h).toBe(c.h);
      // materialize the crop first — sharp's stats() reads the input, not pipeline output
      const cell = await sharp(images[f.page]!).extract({ left: f.x, top: f.y, width: f.w, height: f.h }).png().toBuffer();
      const region = await sharp(cell).stats();
      expect(Math.round(region.channels[0]!.mean)).toBeCloseTo(c.r, -1);
      expect(Math.round(region.channels[1]!.mean)).toBeCloseTo(c.g, -1);
      expect(Math.round(region.channels[2]!.mean)).toBeCloseTo(c.b, -1);
    }
  });

  test("throws when there is nothing to pack", async () => {
    await expect(buildAtlas({ assetsDir: dir, game: "redline" })).rejects.toThrow(/no sprites/);
  });

  test("walk skips already-packed atlas/anim page images", async () => {
    const packedDir = await mkdtemp(join(tmpdir(), "assetgen-atlas-packed-"));
    try {
      await mkdir(join(packedDir, "games", "scourge-survivors"), { recursive: true });
      // one real sprite + a packed atlas page + an expanded anim page in the same tree
      await sharp({ create: { width: 16, height: 16, channels: 4, background: { r: 200, g: 30, b: 30, alpha: 1 } } })
        .png()
        .toFile(join(packedDir, "games", "scourge-survivors", "real.png"));
      for (const name of ["warden.anim0.webp", "all.atlas0.webp"]) {
        await sharp({ create: { width: 64, height: 64, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
          .webp({ lossless: true })
          .toFile(join(packedDir, "games", "scourge-survivors", name));
      }
      const { map } = await buildAtlas({ assetsDir: packedDir, game: "scourge-survivors", padding: 2 });
      expect(map.frameCount).toBe(1); // only real.png; the .anim0/.atlas0 pages are skipped
      expect(map.frames[0]!.id.endsWith("real.png")).toBe(true);
    } finally {
      await rm(packedDir, { recursive: true, force: true });
    }
  });
});

describe("packFrameBuffers", () => {
  test("packs in-memory frames across multiple pages, preserving input order", async () => {
    const inputs: FrameInput[] = [
      await solidFrame("f0", 40, 40, { r: 220, g: 20, b: 20 }),
      await solidFrame("f1", 40, 40, { r: 20, g: 200, b: 20 }),
      await solidFrame("f2", 40, 40, { r: 20, g: 20, b: 220 }),
      await solidFrame("f3", 40, 40, { r: 200, g: 200, b: 20 }),
      await solidFrame("f4", 40, 40, { r: 200, g: 20, b: 200 }),
    ];
    // padded boxes are 44×44; a 100×50 page holds 2 per row, one row per page → 3 pages
    const packed = await packFrameBuffers(inputs, { padding: 2, maxWidth: 100, maxHeight: 50 });

    expect(packed.pageDims.length).toBeGreaterThan(1);
    expect(packed.images.length).toBe(packed.pageDims.length);
    // frames returned in INPUT order so callers can map back by index
    expect(packed.frames.map((f) => f.id)).toEqual(["f0", "f1", "f2", "f3", "f4"]);
    // inner rects keep the source size; gutter excluded
    for (const f of packed.frames) {
      expect(f.w).toBe(40);
      expect(f.h).toBe(40);
    }
    // every frame lands on a real page, and pages 0..N-1 are all used
    expect(new Set(packed.frames.map((f) => f.page)).size).toBe(packed.pageDims.length);
    // no two rects overlap on the same page
    for (let i = 0; i < packed.frames.length; i++) {
      for (let j = i + 1; j < packed.frames.length; j++) {
        if (packed.frames[i]!.page !== packed.frames[j]!.page) continue;
        expect(overlaps(packed.frames[i]!, packed.frames[j]!)).toBe(false);
      }
    }
  });

  test("throws on duplicate frame ids", async () => {
    const inputs: FrameInput[] = [
      await solidFrame("dup", 16, 16, { r: 10, g: 10, b: 10 }),
      await solidFrame("dup", 16, 16, { r: 20, g: 20, b: 20 }),
    ];
    await expect(packFrameBuffers(inputs)).rejects.toThrow(/duplicate frame ids/);
  });

  test("throws when there are no frames", async () => {
    await expect(packFrameBuffers([])).rejects.toThrow(/no frames/);
  });
});

describe("isPackedPageImage", () => {
  test("matches generated atlas/anim pages, not source sprites", () => {
    expect(isPackedPageImage("warden.anim0.webp")).toBe(true);
    expect(isPackedPageImage("all.atlas0.webp")).toBe(true);
    expect(isPackedPageImage("scourge-survivors.atlas12.webp")).toBe(true);
    expect(isPackedPageImage("warden.png")).toBe(false);
    expect(isPackedPageImage("idle.webp")).toBe(false);
    expect(isPackedPageImage("anim0.webp")).toBe(false); // needs the dotted suffix
  });
});
