import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";

import type { AnimClip, AnimFrame, SpriteAnimSheet } from "./expand.ts";
import { DIRECTIONS, directionCountOf, isCanonicalDirectionSet } from "./sprite-frames.ts";
import {
  discoverAnimSheets,
  formatReports,
  gateSpriteGeometry,
  loadSpriteContract,
  mergeContract,
  validateContract,
  validatePixels,
  validateSpriteAnimSheet,
  validateStructure,
} from "./sprite-geometry.ts";

const PAGE = { image: "warden.anim0.webp", width: 400, height: 50 };

function uniformClip(directions: string[], frames: number, w = 16, h = 16): AnimClip {
  const dirs: Record<string, AnimFrame[]> = {};
  directions.forEach((facing, di) => {
    dirs[facing] = Array.from({ length: frames }, (_unused, i) => ({
      page: 0,
      x: (di * frames + i) * 20,
      y: 0,
      w,
      h,
      duration: 125,
    }));
  });
  return { loop: true, frames, directions: dirs };
}

function makeSheet(directions: string[] = DIRECTIONS[4]!): SpriteAnimSheet {
  return {
    version: 1,
    id: "warden",
    game: "shared",
    origin: "warden.png",
    provider: "mock",
    fps: 8,
    padding: 2,
    anchor: [0.5, 1],
    scale: 1,
    directions,
    pages: [PAGE],
    clips: { idle: uniformClip(directions, 2), run: uniformClip(directions, 2) },
    frameCount: directions.length * 4,
  };
}

const codes = (vs: { code: string }[]): string[] => vs.map((v) => v.code);

describe("sprite-frames helpers", () => {
  test("directionCountOf accepts canonical sets in order and rejects others", () => {
    expect(directionCountOf(DIRECTIONS[1]!)).toBe(1);
    expect(directionCountOf(DIRECTIONS[4]!)).toBe(4);
    expect(directionCountOf(DIRECTIONS[8]!)).toBe(8);
    expect(directionCountOf(["south", "north", "west", "east"])).toBeNull(); // wrong order
    expect(directionCountOf(["south", "west"])).toBeNull(); // not a canonical count
    expect(isCanonicalDirectionSet(DIRECTIONS[8]!)).toBe(true);
    expect(isCanonicalDirectionSet(["up", "down"])).toBe(false);
  });
});

describe("validateStructure", () => {
  test("a well-formed sheet passes", () => {
    expect(validateStructure(makeSheet())).toEqual([]);
  });

  test("non-canonical direction order is flagged", () => {
    const sheet = makeSheet(["south", "north", "west", "east"]);
    expect(codes(validateStructure(sheet))).toContain("invalid-direction-set");
  });

  test("a missing facing in a clip is flagged", () => {
    const sheet = makeSheet();
    delete sheet.clips.idle!.directions.north;
    const v = validateStructure(sheet);
    expect(codes(v)).toContain("direction-coverage");
    expect(v.some((x) => x.message.includes("missing facing \"north\""))).toBe(true);
  });

  test("an undeclared (extra) facing is flagged", () => {
    const sheet = makeSheet();
    sheet.clips.run!.directions.up = [{ page: 0, x: 0, y: 30, w: 16, h: 16, duration: 125 }];
    expect(codes(validateStructure(sheet))).toContain("direction-coverage");
  });

  test("a clip whose facing array length disagrees with clip.frames is flagged", () => {
    const sheet = makeSheet();
    sheet.clips.idle!.frames = 3; // arrays still have 2 frames each
    expect(codes(validateStructure(sheet))).toContain("frame-count-mismatch");
  });

  test("a degenerate rect (zero size) is flagged", () => {
    const sheet = makeSheet();
    sheet.clips.idle!.directions.south![0]!.w = 0;
    expect(codes(validateStructure(sheet))).toContain("empty-frame-rect");
  });

  test("a rect that overflows its atlas page is a clipped-bounds violation", () => {
    const sheet = makeSheet();
    sheet.clips.idle!.directions.south![0]!.w = 9999;
    expect(codes(validateStructure(sheet))).toContain("clipped-bounds");
  });

  test("a frame referencing a missing page is clipped-bounds", () => {
    const sheet = makeSheet();
    sheet.clips.idle!.directions.south![0]!.page = 7;
    expect(codes(validateStructure(sheet))).toContain("clipped-bounds");
  });

  test("malformed sheets short-circuit", () => {
    expect(codes(validateStructure({ ...makeSheet(), directions: [] }))).toEqual(["malformed-sheet"]);
    expect(codes(validateStructure({ ...makeSheet(), clips: {} }))).toEqual(["malformed-sheet"]);
    expect(codes(validateStructure({ ...makeSheet(), pages: [] }))).toEqual(["malformed-sheet"]);
  });
});

describe("validateContract", () => {
  test("an empty contract runs NO per-frame checks (the gate is additive)", () => {
    // Trimmed expand output is legitimately variable-size: a wide slash, a tall
    // lunge. With nothing declared, none of that may be flagged.
    const sheet = makeSheet();
    sheet.clips.idle!.directions.south![0]!.w = 256; // 256×16 → aspect 16
    sheet.clips.run!.directions.west![1]!.h = 256; //   16×256 → aspect 1/16
    expect(validateContract(sheet, {})).toEqual([]);
  });

  test("a declared aspectRange flags the extreme frames an empty contract ignored", () => {
    const sheet = makeSheet();
    sheet.clips.idle!.directions.south![0]!.w = 256; // 256×16 → aspect 16
    expect(codes(validateContract(sheet, { aspectRange: [0.5, 2] }))).toContain("bad-aspect");
  });

  test("aspectRange accepts frames exactly on the band boundary", () => {
    const sheet = makeSheet();
    const idle = sheet.clips.idle!.directions.south!;
    idle[0]!.w = 16;
    idle[0]!.h = 32; // aspect 0.5 (== min)
    idle[1]!.w = 32;
    idle[1]!.h = 16; // aspect 2 (== max)
    expect(validateContract(sheet, { aspectRange: [0.5, 2] })).toEqual([]);
  });

  test("direction-count mismatch is flagged", () => {
    expect(codes(validateContract(makeSheet(), { directions: 8 }))).toContain("direction-count");
    expect(validateContract(makeSheet(), { directions: 4 })).toEqual([]);
  });

  test("missing required states are flagged", () => {
    const v = validateContract(makeSheet(), { states: ["idle", "walk", "attack"] });
    expect(codes(v)).toEqual(["missing-state", "missing-state"]);
    expect(v.map((x) => x.clip).sort()).toEqual(["attack", "walk"]);
  });

  test("uniformFrames flags a clip mixing sizes", () => {
    const sheet = makeSheet();
    sheet.clips.idle!.directions.south![1]!.w = 20; // now idle mixes 16×16 and 20×16
    expect(codes(validateContract(sheet, { uniformFrames: true }))).toContain("non-uniform-frames");
    expect(validateContract(makeSheet(), { uniformFrames: true })).toEqual([]);
  });

  test("uniformFrames tolerates a malformed facing without crashing or false-flagging", () => {
    // A non-array facing value violates the type but is valid JSON; the structural
    // pass owns it (direction-coverage), so the contract pass must not throw on it
    // nor invent a size mismatch from undefined dimensions.
    const sheet = makeSheet();
    (sheet.clips.idle!.directions as Record<string, unknown>).west = "not-an-array";
    expect(() => validateContract(sheet, { uniformFrames: true })).not.toThrow();
    expect(codes(validateContract(sheet, { uniformFrames: true }))).not.toContain("non-uniform-frames");
  });

  test("maxFrameDims flags oversized frames", () => {
    expect(codes(validateContract(makeSheet(), { maxFrameDims: [10, 10] }))).toContain("frame-too-large");
    expect(validateContract(makeSheet(), { maxFrameDims: [16, 16] })).toEqual([]);
  });

  test("aspectRange flags out-of-band frames", () => {
    const sheet = makeSheet();
    sheet.clips.idle!.directions.south![0]!.h = 4; // 16×4 → aspect 4
    expect(codes(validateContract(sheet, { aspectRange: [0.9, 1.1] }))).toContain("bad-aspect");
  });
});

describe("mergeContract", () => {
  test("override wins field-by-field", () => {
    expect(mergeContract({ directions: 4, uniformFrames: true }, { directions: 8 })).toEqual({
      directions: 8,
      uniformFrames: true,
    });
  });
});

describe("validatePixels + validateSpriteAnimSheet", () => {
  test("flags a fully-transparent frame and passes an opaque one", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assetgen-geom-px-"));
    try {
      // 40×20 page: opaque red at (0,0,16,16); (20,0,16,16) left transparent.
      const page = await sharp({ create: { width: 40, height: 20, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
        .composite([{ input: await sharp({ create: { width: 16, height: 16, channels: 4, background: { r: 200, g: 30, b: 30, alpha: 1 } } }).png().toBuffer(), left: 0, top: 0 }])
        .webp({ lossless: true })
        .toBuffer();
      await writeFile(join(dir, "warden.anim0.webp"), page);

      const sheet: SpriteAnimSheet = {
        ...makeSheet(DIRECTIONS[1]!),
        pages: [{ image: "warden.anim0.webp", width: 40, height: 20 }],
        clips: {
          idle: {
            loop: true,
            frames: 2,
            directions: {
              south: [
                { page: 0, x: 0, y: 0, w: 16, h: 16, duration: 125 },
                { page: 0, x: 20, y: 0, w: 16, h: 16, duration: 125 },
              ],
            },
          },
        },
      };

      const px = await validatePixels(sheet, dir);
      expect(codes(px)).toEqual(["blank-frame"]);
      expect(px[0]!.frameIndex).toBe(1);

      // structural is clean; readPixels surfaces the same single blank-frame.
      const all = await validateSpriteAnimSheet(sheet, { pageDir: dir, readPixels: true });
      expect(codes(all)).toEqual(["blank-frame"]);
      // without readPixels, structural only → clean
      expect(await validateSpriteAnimSheet(sheet, { pageDir: dir })).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("missing page image surfaces as blank-frame", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assetgen-geom-nopage-"));
    try {
      const px = await validatePixels(makeSheet(DIRECTIONS[1]!), dir);
      expect(px.length).toBeGreaterThan(0);
      expect(px.every((v) => v.code === "blank-frame")).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("the pixel-scan cap stops early and does not flag the un-scanned tail", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assetgen-geom-cap-"));
    try {
      const red = await sharp({ create: { width: 16, height: 16, channels: 4, background: { r: 200, g: 30, b: 30, alpha: 1 } } }).png().toBuffer();
      // 60×20 page: opaque at frames 0 and 1; frame 2 (x=40) left transparent.
      const page = await sharp({ create: { width: 60, height: 20, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
        .composite([{ input: red, left: 0, top: 0 }, { input: red, left: 20, top: 0 }])
        .webp({ lossless: true })
        .toBuffer();
      await writeFile(join(dir, "warden.anim0.webp"), page);
      const sheet: SpriteAnimSheet = {
        ...makeSheet(DIRECTIONS[1]!),
        pages: [{ image: "warden.anim0.webp", width: 60, height: 20 }],
        clips: {
          idle: {
            loop: true,
            frames: 3,
            directions: {
              south: [
                { page: 0, x: 0, y: 0, w: 16, h: 16, duration: 125 },
                { page: 0, x: 20, y: 0, w: 16, h: 16, duration: 125 },
                { page: 0, x: 40, y: 0, w: 16, h: 16, duration: 125 }, // transparent → blank
              ],
            },
          },
        },
      };
      // cap=2: the blank 3rd frame is never scanned, so it is NOT flagged (cap is surfaced via console.warn).
      expect(await validatePixels(sheet, dir, 2)).toEqual([]);
      // full scan: the blank tail frame surfaces.
      const full = await validatePixels(sheet, dir);
      expect(codes(full)).toEqual(["blank-frame"]);
      expect(full[0]!.frameIndex).toBe(2);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("discoverAnimSheets", () => {
  test("walks nested dirs, filters by game, and skips ignored dirs", async () => {
    const assetsDir = await mkdtemp(join(tmpdir(), "assetgen-geom-discover-"));
    try {
      await mkdir(join(assetsDir, "sprites", "scourge"), { recursive: true });
      await mkdir(join(assetsDir, "node_modules", "pkg"), { recursive: true });

      const shared = makeSheet(); // game "shared"
      const other: SpriteAnimSheet = { ...makeSheet(), id: "demon", game: "scourge-survivors" };
      await writeFile(join(assetsDir, "sprites", "warden.anim.json"), JSON.stringify(shared));
      await writeFile(join(assetsDir, "sprites", "scourge", "demon.anim.json"), JSON.stringify(other));
      // A sheet buried in an ignored dir must never be discovered.
      await writeFile(join(assetsDir, "node_modules", "pkg", "ghost.anim.json"), JSON.stringify(shared));

      const all = await discoverAnimSheets(assetsDir);
      expect(all.map((s) => s.sheet?.id).sort()).toEqual(["demon", "warden"]);

      const scoped = await discoverAnimSheets(assetsDir, "scourge-survivors");
      expect(scoped.map((s) => s.sheet?.id)).toEqual(["demon"]);
    } finally {
      await rm(assetsDir, { recursive: true, force: true });
    }
  });
});

describe("gateSpriteGeometry + loadSpriteContract", () => {
  test("discovers sheets, applies a per-game contract file, and reports per-asset", async () => {
    const assetsDir = await mkdtemp(join(tmpdir(), "assetgen-geom-gate-"));
    try {
      const spritesDir = join(assetsDir, "sprites");
      await mkdir(spritesDir, { recursive: true });

      // valid sheet
      await writeFile(join(spritesDir, "warden.anim.json"), JSON.stringify(makeSheet()));
      // malformed JSON sheet
      await writeFile(join(spritesDir, "broken.anim.json"), "{ not json");
      // structurally bad sheet (overflowing rect)
      const bad = makeSheet();
      bad.id = "ripper";
      bad.clips.idle!.directions.south![0]!.w = 9999;
      await writeFile(join(spritesDir, "ripper.anim.json"), JSON.stringify(bad));

      // per-game contract requires 8 directions → the 4-dir valid sheet now fails too
      await mkdir(join(assetsDir, "shared"), { recursive: true });
      await writeFile(join(assetsDir, "shared", "sprite-contract.json"), JSON.stringify({ directions: 8 }));

      const contract = await loadSpriteContract(assetsDir, "shared");
      expect(contract).toEqual({ directions: 8 }); // the per-game file is the source

      const { ok, reports } = await gateSpriteGeometry({ assetsDir, game: "shared", contract });
      expect(ok).toBe(false);
      expect(reports.length).toBe(3);
      const byId = Object.fromEntries(reports.map((r) => [r.assetId, r]));
      expect(byId["warden"]!.ok).toBe(false); // fails the directions:8 contract
      expect(codes(byId["warden"]!.violations)).toContain("direction-count");
      expect(byId["ripper"]!.ok).toBe(false);
      // the malformed file is the one flagged malformed (reported by its path)
      const brokenReport = reports.find((r) => r.source.includes("broken"));
      expect(brokenReport?.violations[0]?.code).toBe("malformed-sheet");

      const text = formatReports(reports);
      expect(text).toContain("FAIL");
    } finally {
      await rm(assetsDir, { recursive: true, force: true });
    }
  });

  test("no sheets → ok with empty reports", async () => {
    const assetsDir = await mkdtemp(join(tmpdir(), "assetgen-geom-empty-"));
    try {
      const { ok, reports } = await gateSpriteGeometry({ assetsDir });
      expect(ok).toBe(true);
      expect(reports).toEqual([]);
    } finally {
      await rm(assetsDir, { recursive: true, force: true });
    }
  });
});
