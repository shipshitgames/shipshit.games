import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync } from "node:fs";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";

import { importAseprite } from "./import-aseprite.ts";
import { expandSprite, resolveDirections } from "./expand.ts";
import type { FrameGenerator } from "./expand.ts";
import type { AsepriteDoc, AsepriteFrameTag } from "./aseprite.ts";

const rect = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });

/** A horizontal strip PNG of `cells` distinct, non-background colored squares. */
async function stripPng(cells: number, size: number): Promise<Buffer> {
  const overlays: sharp.OverlayOptions[] = [];
  for (let i = 0; i < cells; i++) {
    const r = 60 + ((i * 9) % 180);
    const g = 70 + ((i * 13) % 170);
    const b = 80 + ((i * 7) % 160);
    const cell = await sharp({ create: { width: size, height: size, channels: 4, background: { r, g, b, alpha: 1 } } })
      .png()
      .toBuffer();
    overlays.push({ input: cell, left: i * size, top: 0 });
  }
  return sharp({ create: { width: cells * size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(overlays)
    .png()
    .toBuffer();
}

/** Build a tagged Aseprite doc: one tag per (clip, facing), `framesPerTag` cells each. */
function tagsDoc(opts: {
  clips: string[];
  facings: string[];
  framesPerTag: number;
  size: number;
  durationMs: number;
}): { doc: AsepriteDoc; cells: number } {
  const frames: AsepriteDoc["frames"] = [];
  const tags: AsepriteFrameTag[] = [];
  let idx = 0;
  for (const clip of opts.clips) {
    for (const facing of opts.facings) {
      const from = idx;
      for (let f = 0; f < opts.framesPerTag; f++) {
        (frames as unknown[]).push({ filename: `${clip}_${facing}_${f}`, frame: rect(idx * opts.size, 0, opts.size, opts.size), duration: opts.durationMs });
        idx++;
      }
      tags.push({ name: `${clip}_${facing}`, from, to: idx - 1, direction: "forward" });
    }
  }
  return { doc: { frames, meta: { image: "sheet.png", size: { w: idx * opts.size, h: opts.size }, frameTags: tags } }, cells: idx };
}

/** Build a doc from an explicit [tagName, frameCount] spec — allows ragged/uneven tags. */
function specDoc(spec: Array<[string, number]>, size: number, durationMs: number): { doc: AsepriteDoc; cells: number } {
  const frames: AsepriteDoc["frames"] = [];
  const tags: AsepriteFrameTag[] = [];
  let idx = 0;
  for (const [tag, n] of spec) {
    const from = idx;
    for (let f = 0; f < n; f++) {
      (frames as unknown[]).push({ filename: `${tag}_${f}`, frame: rect(idx * size, 0, size, size), duration: durationMs });
      idx++;
    }
    tags.push({ name: tag, from, to: idx - 1, direction: "forward" });
  }
  return { doc: { frames, meta: { image: "s.png", size: { w: idx * size, h: size }, frameTags: tags } }, cells: idx };
}

const brightGenerator: FrameGenerator = async () => ({
  data: await sharp({ create: { width: 40, height: 40, channels: 4, background: { r: 190, g: 170, b: 150, alpha: 1 } } }).png().toBuffer(),
  mediaType: "image/png",
  provider: "mock",
  model: "mock",
});

/** Recursive structural fingerprint: object key-sets + element/leaf TYPES, values ignored. */
function shapeOf(value: unknown): unknown {
  if (Array.isArray(value)) return value.length ? ["array", shapeOf(value[0])] : ["array"];
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as object).sort()) out[key] = shapeOf((value as Record<string, unknown>)[key]);
    return out;
  }
  return typeof value;
}

const FIXED_NOW = () => new Date("2026-06-14T10:00:00.000Z");

test("importAseprite builds a packed sheet, frame map, and sprite-anim entry", async () => {
  const { doc, cells } = tagsDoc({ clips: ["idle", "run", "attack"], facings: ["south", "west", "north", "east"], framesPerTag: 2, size: 16, durationMs: 125 });
  const sheetData = await stripPng(cells, 16);
  const repo = await mkdtemp(join(tmpdir(), "assetgen-import-"));
  const outputRoot = join(repo, "src/assets");

  const result = await importAseprite({
    id: "warden",
    game: "scourge-survivors",
    sheetPath: "/virtual/warden.png",
    doc,
    sheetData,
    fps: 8,
    anchor: [0.5, 1],
    scale: 1,
    outputRoot,
    usageLogPath: "off",
    now: FIXED_NOW,
  });

  // frame map: clips × facings × frames, same structure expand produces
  assert.equal(result.sheet.version, 1);
  assert.deepEqual(Object.keys(result.sheet.clips), ["idle", "run", "attack"]);
  assert.deepEqual(result.sheet.directions, ["south", "west", "north", "east"]);
  assert.equal(result.sheet.clips.idle!.loop, true);
  assert.equal(result.sheet.clips.attack!.loop, false);
  assert.equal(result.sheet.clips.run!.frames, 2);
  assert.deepEqual(Object.keys(result.sheet.clips.run!.directions), ["south", "west", "north", "east"]);

  const allRects: string[] = [];
  for (const clip of Object.values(result.sheet.clips)) {
    for (const frames of Object.values(clip.directions)) {
      for (const f of frames) {
        assert.equal(f.duration, 125); // forced fps 8 -> uniform 125ms
        for (const v of [f.page, f.x, f.y, f.w, f.h]) assert.equal(typeof v, "number");
        allRects.push(`${f.page}:${f.x}:${f.y}`);
      }
    }
  }
  // Every (clip × facing × frame) cell occupies a DISTINCT atlas rect.
  assert.equal(new Set(allRects).size, result.frameCount);
  assert.equal(result.frameCount, 24);
  assert.equal(result.sheet.frameCount, 24);

  // manifest entry shape
  const entry = result.entry;
  assert.equal(entry.kind, "sprite-anim");
  assert.equal(entry.game, "scourge-survivors");
  assert.equal(entry.path, "sprites/warden.anim0.webp");
  assert.deepEqual(entry.clips, ["idle", "run", "attack"]);
  assert.deepEqual(entry.views, ["south", "west", "north", "east"]);
  assert.equal(entry.animation, "sprites/warden.anim.json");
  assert.equal(entry.origin, "/virtual/warden.png");
  assert.equal(entry.frames, 24);
  assert.equal(entry.fps, 8);
  assert.equal(entry.provider, "aseprite");
  assert.equal(entry.preview, "previews/warden-anim.html");
  assert.equal(entry.license.kind, "sprite-anim");
  assert.equal(entry.license.type, "hand-authored");
  assert.equal(entry.license.date, "2026-06-14");
  assert.equal(entry.license.tool, "aseprite");

  // files written + manifest registered
  assert.equal(result.written, true);
  assert.equal(existsSync(join(outputRoot, "sprites/warden.anim0.webp")), true);
  assert.equal(existsSync(join(outputRoot, "previews/warden-anim.html")), true);
  const animOnDisk = JSON.parse(await readFile(join(outputRoot, "sprites/warden.anim.json"), "utf8"));
  assert.equal(animOnDisk.frameCount, 24);
  assert.deepEqual(Object.keys(animOnDisk.clips), ["idle", "run", "attack"]);
  const manifest = JSON.parse(await readFile(join(outputRoot, "assets.json"), "utf8"));
  assert.equal(manifest.assets.length, 1);
  assert.equal(manifest.assets[0].kind, "sprite-anim");
  assert.equal(manifest.assets[0].id, "warden");
});

test("import is indistinguishable in FORMAT from an expand-generated sprite-anim (#78 acceptance)", async () => {
  // Same clips × facings × frame counts both ways, so the structures line up 1:1.
  const { doc, cells } = tagsDoc({ clips: ["idle", "run", "attack"], facings: ["south", "west", "north", "east"], framesPerTag: 2, size: 16, durationMs: 125 });
  const sheetData = await stripPng(cells, 16);
  const importRepo = await mkdtemp(join(tmpdir(), "assetgen-import-fmt-"));
  const expandRepo = await mkdtemp(join(tmpdir(), "assetgen-expand-fmt-"));

  const imported = await importAseprite({
    id: "warden",
    game: "shared",
    sheetPath: "/virtual/warden.png",
    doc,
    sheetData,
    fps: 8,
    model: "hand",
    anchor: [0.5, 1],
    scale: 1,
    outputRoot: join(importRepo, "src/assets"),
    usageLogPath: "off",
    now: FIXED_NOW,
  });

  // expand origin fixture
  const origin = join(expandRepo, "warden-origin.png");
  await sharp({ create: { width: 32, height: 32, channels: 4, background: { r: 90, g: 70, b: 60, alpha: 1 } } }).png().toFile(origin);
  const expanded = await expandSprite({
    id: "warden",
    origin,
    game: "shared",
    actions: [
      { name: "idle", frames: 2 },
      { name: "run", frames: 2 },
      { name: "attack", frames: 2 },
    ],
    directions: resolveDirections(4),
    provider: "mock",
    fps: 8,
    size: 40,
    height: 24,
    anchor: [0.5, 1],
    scale: 1,
    outputRoot: join(expandRepo, "src/assets"),
    usageLogPath: "off",
    now: FIXED_NOW,
    generate: brightGenerator,
  });

  // The whole point of #78: the two paths land in the IDENTICAL runtime format.
  assert.deepEqual(shapeOf(imported.entry), shapeOf(expanded.entry), "AssetEntry format must match expand");
  assert.deepEqual(shapeOf(imported.sheet), shapeOf(expanded.sheet), "SpriteAnimSheet format must match expand");
  // Spot-check the load-bearing identity points beyond pure shape.
  assert.equal(imported.entry.kind, expanded.entry.kind);
  assert.deepEqual(Object.keys(imported.sheet.clips), Object.keys(expanded.sheet.clips));
  assert.deepEqual(imported.sheet.directions, expanded.sheet.directions);
  assert.equal(imported.sheet.version, expanded.sheet.version);
});

test("importAseprite densifies ragged sheets to expand's contract: every clip carries every facing, uniform length", async () => {
  // idle is tagged south-only; run has uneven per-facing frame counts. expand would
  // never emit either shape, so import must densify (fallback facing + held frames).
  const size = 16;
  const { doc, cells } = specDoc(
    [
      ["idle_south", 2],
      ["run_south", 3],
      ["run_west", 1],
      ["run_north", 2],
      ["run_east", 2],
    ],
    size,
    100,
  );
  const sheetData = await stripPng(cells, size);
  const result = await importAseprite({
    id: "ranger",
    game: "shared",
    sheetPath: "/virtual/ranger.png",
    doc,
    sheetData,
    anchor: [0.5, 1],
    scale: 1,
    outputRoot: join(await mkdtemp(join(tmpdir(), "assetgen-import-ragged-")), "src/assets"),
    usageLogPath: "off",
    now: FIXED_NOW,
  });

  const facings = ["south", "west", "north", "east"];
  assert.deepEqual(result.sheet.directions, facings);
  // Only real frames are packed; held/fallback slots re-reference existing rects.
  assert.equal(result.frameCount, cells);

  // expand's invariant: EVERY clip has EVERY facing, and clip.frames === each facing's length.
  for (const [name, clip] of Object.entries(result.sheet.clips)) {
    assert.deepEqual(Object.keys(clip.directions), facings, `${name} must carry every facing`);
    for (const facing of facings) {
      assert.equal(clip.directions[facing]!.length, clip.frames, `${name}.${facing} length must equal clip.frames`);
    }
  }

  // idle was south-only -> west/north/east fall back to south's rects.
  assert.equal(result.sheet.clips.idle!.frames, 2);
  assert.deepEqual(result.sheet.clips.idle!.directions.west, result.sheet.clips.idle!.directions.south);

  // run's longest facing is south(3) -> frameLen 3; west(1) holds its last frame for slots 1,2.
  const runWest = result.sheet.clips.run!.directions.west!;
  assert.equal(result.sheet.clips.run!.frames, 3);
  assert.equal(runWest.length, 3);
  assert.deepEqual(runWest[1], runWest[0]);
  assert.deepEqual(runWest[2], runWest[0]);
});

test("importAseprite with no tags makes a single clip from --clip", async () => {
  const size = 16;
  const sheetData = await stripPng(3, size);
  const doc: AsepriteDoc = {
    frames: [0, 1, 2].map((i) => ({ frame: rect(i * size, 0, size, size), duration: 100 })),
    meta: { image: "s.png", size: { w: 3 * size, h: size } },
  };
  const result = await importAseprite({
    id: "torch",
    game: "shared",
    sheetPath: "/virtual/torch.png",
    doc,
    sheetData,
    defaultClip: "Flicker Loop",
    anchor: [0.5, 1],
    scale: 1,
    outputRoot: join(await mkdtemp(join(tmpdir(), "assetgen-import-notag-")), "src/assets"),
    usageLogPath: "off",
    now: FIXED_NOW,
  });
  assert.deepEqual(Object.keys(result.sheet.clips), ["flicker-loop"]);
  assert.deepEqual(result.sheet.directions, ["south"]);
  assert.equal(result.sheet.clips["flicker-loop"]!.directions.south!.length, 3);
});

test("importAseprite honors Aseprite per-frame durations when --fps is omitted", async () => {
  const size = 16;
  const sheetData = await stripPng(2, size);
  const doc: AsepriteDoc = {
    frames: [
      { frame: rect(0, 0, size, size), duration: 80 },
      { frame: rect(size, 0, size, size), duration: 200 },
    ],
    meta: { image: "s.png", size: { w: 2 * size, h: size }, frameTags: [{ name: "idle", from: 0, to: 1, direction: "forward" }] },
  };
  const result = await importAseprite({
    id: "lamp",
    game: "shared",
    sheetPath: "/virtual/lamp.png",
    doc,
    sheetData,
    anchor: [0.5, 1],
    scale: 1,
    outputRoot: join(await mkdtemp(join(tmpdir(), "assetgen-import-dur-")), "src/assets"),
    usageLogPath: "off",
    now: FIXED_NOW,
  });
  const south = result.sheet.clips.idle!.directions.south!;
  assert.deepEqual(south.map((f) => f.duration), [80, 200]);
});

test("importAseprite re-grades frames onto the DOOM grid when --pixelize is set", async () => {
  const size = 24;
  const sheetData = await stripPng(2, size);
  const doc: AsepriteDoc = {
    frames: [
      { frame: rect(0, 0, size, size), duration: 100 },
      { frame: rect(size, 0, size, size), duration: 100 },
    ],
    meta: { image: "s.png", size: { w: 2 * size, h: size }, frameTags: [{ name: "idle", from: 0, to: 1, direction: "forward" }] },
  };
  const result = await importAseprite({
    id: "gel",
    game: "shared",
    sheetPath: "/virtual/gel.png",
    doc,
    sheetData,
    pixelize: true,
    height: 16,
    anchor: [0.5, 1],
    scale: 1,
    outputRoot: join(await mkdtemp(join(tmpdir(), "assetgen-import-pix-")), "src/assets"),
    usageLogPath: "off",
    now: FIXED_NOW,
  });
  // graded frames keep the grid height; packed rects must stay positive and on-page.
  assert.equal(result.written, true);
  for (const f of result.sheet.clips.idle!.directions.south!) {
    assert.ok(f.w > 0 && f.h > 0, "graded frame rect must be positive");
    assert.ok(f.h <= 16, "graded frame must not exceed the target grid height");
  }
});

test("importAseprite rejects a frame rect that falls outside the sheet", async () => {
  const sheetData = await stripPng(1, 16); // 16x16 sheet
  const doc: AsepriteDoc = {
    frames: [{ frame: rect(0, 0, 64, 64), duration: 100 }], // rect bigger than the sheet
    meta: { image: "s.png", size: { w: 16, h: 16 } },
  };
  await assert.rejects(
    importAseprite({
      id: "bad",
      game: "shared",
      sheetPath: "/virtual/bad.png",
      doc,
      sheetData,
      anchor: [0.5, 1],
      scale: 1,
      outputRoot: join(tmpdir(), "unused-import"),
      usageLogPath: "off",
      now: FIXED_NOW,
    }),
    /outside the 16x16 sheet/,
  );
});

test("importAseprite dry-run computes the plan without touching disk", async () => {
  const { doc, cells } = tagsDoc({ clips: ["idle"], facings: ["south"], framesPerTag: 2, size: 16, durationMs: 100 });
  const sheetData = await stripPng(cells, 16);
  const outputRoot = join(await mkdtemp(join(tmpdir(), "assetgen-import-dry-")), "src/assets");
  const result = await importAseprite({
    id: "ghost",
    game: "shared",
    sheetPath: "/virtual/ghost.png",
    doc,
    sheetData,
    anchor: [0.5, 1],
    scale: 1,
    outputRoot,
    usageLogPath: "off",
    dryRun: true,
    now: FIXED_NOW,
  });
  assert.equal(result.written, false);
  assert.equal(result.frameCount, 2);
  assert.equal(result.outputPath, undefined);
  assert.equal(existsSync(outputRoot), false);
});

test("importAseprite writes a success usage event with import attribution", async () => {
  const { doc, cells } = tagsDoc({ clips: ["idle"], facings: ["south"], framesPerTag: 1, size: 16, durationMs: 100 });
  const sheetData = await stripPng(cells, 16);
  const repo = await mkdtemp(join(tmpdir(), "assetgen-import-usage-"));
  const usageLogPath = join(repo, "usage.jsonl");
  await importAseprite({
    id: "warden",
    game: "shared",
    sheetPath: "/virtual/warden.png",
    doc,
    sheetData,
    anchor: [0.5, 1],
    scale: 1,
    outputRoot: join(repo, "src/assets"),
    usageLogPath,
    now: FIXED_NOW,
  });
  const events = (await readFile(usageLogPath, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(events.length, 1);
  assert.equal(events[0].command, "import");
  assert.equal(events[0].provider, "aseprite");
  assert.equal(events[0].kind, "sprite-anim");
  assert.equal(events[0].success, true);
});
