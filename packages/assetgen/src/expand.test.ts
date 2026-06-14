import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";

import {
  SPRITE_ANIM_VERSION,
  clipLoops,
  expandSprite,
  frameId,
  gradeFrame,
  parseActions,
  resolveDirections,
} from "./expand.ts";
import type { FrameGenerator } from "./expand.ts";

async function solidPng(size: number, rgb: { r: number; g: number; b: number }): Promise<Buffer> {
  return sharp({ create: { width: size, height: size, channels: 4, background: { ...rgb, alpha: 1 } } })
    .png()
    .toBuffer();
}

async function writeOrigin(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "assetgen-expand-origin-"));
  const path = join(dir, "warden.png");
  await writeFile(path, await solidPng(32, { r: 90, g: 70, b: 60 }));
  return path;
}

// A bright frame survives pixelize (luma > bg threshold), so grading keeps it.
const brightGenerator: FrameGenerator = async () => ({
  data: await solidPng(40, { r: 190, g: 170, b: 150 }),
  mediaType: "image/png",
  provider: "mock",
  model: "mock",
});

// Reports a different provider/model than requested, exercising the attribution
// override (usedProvider/usedModel come from the generated frame, not the request).
const openaiGenerator: FrameGenerator = async () => ({
  data: await solidPng(40, { r: 190, g: 170, b: 150 }),
  mediaType: "image/png",
  provider: "openai",
  model: "gpt-image-2",
});

const throwingGenerator: FrameGenerator = async () => {
  throw new Error("synth boom");
};

test("parseActions: defaults, per-action frame counts, dedup, sanitization", () => {
  assert.deepEqual(parseActions(undefined, 4), [{ name: "idle", frames: 4 }]);
  assert.deepEqual(parseActions("idle,run:6,attack", 4), [
    { name: "idle", frames: 4 },
    { name: "run", frames: 6 },
    { name: "attack", frames: 4 },
  ]);
  // dedup keeps the first occurrence; junk frame counts fall back to default
  assert.deepEqual(parseActions("Run, run, walk:0", 3), [
    { name: "run", frames: 3 },
    { name: "walk", frames: 3 },
  ]);
  // empty / all-blank input falls back to a single idle clip
  assert.deepEqual(parseActions("   ,  ", 5), [{ name: "idle", frames: 5 }]);
});

test("resolveDirections: maps 1/4/8 and rejects others", () => {
  assert.deepEqual(resolveDirections(1), ["south"]);
  assert.equal(resolveDirections(4).length, 4);
  assert.equal(resolveDirections(8).length, 8);
  assert.equal(new Set(resolveDirections(8)).size, 8);
  assert.throws(() => resolveDirections(2), /unsupported --dirs 2/);
});

test("clipLoops: one-shot actions do not loop", () => {
  assert.equal(clipLoops("idle"), true);
  assert.equal(clipLoops("run"), true);
  assert.equal(clipLoops("attack"), false);
  assert.equal(clipLoops("death"), false);
});

test("frameId is stable and unique per cell", () => {
  assert.equal(frameId("run", "south", 0), "run__south__0");
  const ids = new Set([frameId("run", "south", 0), frameId("run", "south", 1), frameId("run", "north", 0)]);
  assert.equal(ids.size, 3);
});

test("gradeFrame falls back to a resize when the cutout would empty a flat frame", async () => {
  // Mock-style flat dark fill: pixelize floods it transparent, so the fallback runs.
  const flat = await solidPng(64, { r: 26, g: 20, b: 20 });
  const graded = await gradeFrame(flat, 48);
  const meta = await sharp(graded).metadata();
  assert.equal(meta.format, "webp");
  assert.equal(meta.height, 48);
  // Fallback preserves the opaque fill rather than producing an empty frame.
  // (A fully-opaque WebP reports no alpha channel, so check both shapes.)
  const stats = await sharp(graded).stats();
  const alpha = stats.channels[3];
  assert.ok(!alpha || alpha.max > 0, "graded frame must not be fully transparent");
  assert.equal(stats.isOpaque, true);
});

test("gradeFrame keeps a bright sprite through the pixelize grid", async () => {
  const bright = await solidPng(40, { r: 200, g: 190, b: 180 });
  const graded = await gradeFrame(bright, 32);
  const meta = await sharp(graded).metadata();
  assert.equal(meta.format, "webp");
  assert.equal(meta.height, 32);
});

test("expandSprite builds a packed sheet, frame map, and sprite-anim entry", async () => {
  const origin = await writeOrigin();
  const repo = await mkdtemp(join(tmpdir(), "assetgen-expand-"));
  const outputRoot = join(repo, "src/assets");

  const result = await expandSprite({
    id: "warden",
    origin,
    game: "scourge-survivors",
    actions: [
      { name: "idle", frames: 1 },
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
    outputRoot,
    usageLogPath: "off",
    now: () => new Date("2026-06-13T10:00:00.000Z"),
    generate: brightGenerator,
  });

  // frame map: clips × facings × frames
  assert.equal(result.sheet.version, SPRITE_ANIM_VERSION);
  assert.deepEqual(Object.keys(result.sheet.clips), ["idle", "run", "attack"]);
  assert.equal(result.sheet.clips.idle!.loop, true);
  assert.equal(result.sheet.clips.attack!.loop, false);
  assert.equal(result.sheet.clips.run!.frames, 2);
  assert.deepEqual(Object.keys(result.sheet.clips.run!.directions), ["south", "west", "north", "east"]);
  assert.equal(result.sheet.clips.run!.directions.south!.length, 2);

  const duration = Math.round(1000 / 8);
  const allRects: { page: number; x: number; y: number; w: number; h: number }[] = [];
  for (const clip of Object.values(result.sheet.clips)) {
    for (const frames of Object.values(clip.directions)) {
      for (const f of frames) {
        assert.equal(f.duration, duration);
        for (const v of [f.page, f.x, f.y, f.w, f.h]) assert.equal(typeof v, "number");
        // The bright generator grades to a square at --height, so every cell is 24×24.
        assert.equal(f.w, 24);
        assert.equal(f.h, 24);
        allRects.push({ page: f.page, x: f.x, y: f.y, w: f.w, h: f.h });
      }
    }
  }
  // Every (action × facing × frame) cell must occupy a DISTINCT atlas rect —
  // a frame map that collapsed cells onto one rect would still pass the loop above.
  const distinct = new Set(allRects.map((r) => `${r.page}:${r.x}:${r.y}`));
  assert.equal(distinct.size, result.frameCount);

  // (1 + 2 + 2) clips × 4 directions = 20 frames
  assert.equal(result.frameCount, 20);
  assert.equal(result.sheet.frameCount, 20);

  // manifest entry shape
  const entry = result.entry;
  assert.equal(entry.kind, "sprite-anim");
  assert.equal(entry.game, "scourge-survivors");
  assert.equal(entry.path, "sprites/warden.anim0.webp");
  assert.deepEqual(entry.clips, ["idle", "run", "attack"]);
  assert.deepEqual(entry.views, ["south", "west", "north", "east"]);
  assert.equal(entry.animation, "sprites/warden.anim.json");
  assert.equal(entry.origin, origin);
  assert.equal(entry.frames, 20);
  assert.equal(entry.fps, 8);
  // Computed geometry: frameSize is the max graded frame extent (24×24 here);
  // dimensions is the max page extent (single page, so equals page 0).
  assert.deepEqual(entry.frameSize, [24, 24]);
  assert.deepEqual(entry.dimensions, [result.pages[0]!.width, result.pages[0]!.height]);
  // Provider/model attribution flows from the generated frame, not just the request.
  assert.equal(entry.model, "mock");
  assert.equal(result.sheet.model, "mock");
  assert.equal(entry.preview, "previews/warden-anim.html");
  assert.equal(entry.license.kind, "sprite-anim");
  assert.equal(entry.license.type, "ai-generated");
  assert.equal(entry.license.date, "2026-06-13");
  assert.equal(entry.license.tool, "mock");

  // files written + manifest registered
  assert.equal(result.written, true);
  assert.equal(existsSync(join(outputRoot, "sprites/warden.anim0.webp")), true);
  assert.equal(existsSync(join(outputRoot, "previews/warden-anim.html")), true);
  const animOnDisk = JSON.parse(await readFile(join(outputRoot, "sprites/warden.anim.json"), "utf8"));
  assert.equal(animOnDisk.frameCount, 20);
  assert.deepEqual(Object.keys(animOnDisk.clips), ["idle", "run", "attack"]);
  const manifest = JSON.parse(await readFile(join(outputRoot, "assets.json"), "utf8"));
  assert.equal(manifest.assets.length, 1);
  assert.equal(manifest.assets[0].kind, "sprite-anim");
  assert.equal(manifest.assets[0].id, "warden");
});

test("expandSprite writes a success usage event with expand attribution", async () => {
  const origin = await writeOrigin();
  const repo = await mkdtemp(join(tmpdir(), "assetgen-expand-usage-"));
  const usageLogPath = join(repo, "usage.jsonl");

  await expandSprite({
    id: "warden",
    origin,
    game: "shared",
    actions: [{ name: "idle", frames: 1 }],
    directions: resolveDirections(1),
    provider: "mock",
    fps: 8,
    size: 40,
    height: 24,
    anchor: [0.5, 1],
    scale: 1,
    outputRoot: join(repo, "src/assets"),
    usageLogPath,
    now: () => new Date("2026-06-13T10:00:00.000Z"),
    generate: brightGenerator,
  });

  const events = (await readFile(usageLogPath, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(events.length, 1);
  const event = events[0];
  assert.equal(event.command, "expand");
  assert.equal(event.provider, "mock");
  assert.equal(event.kind, "sprite-anim");
  assert.equal(event.id, "warden");
  assert.equal(event.model, "mock");
  assert.equal(event.success, true);
  assert.ok(event.outputPath.endsWith(".anim0.webp"), `outputPath was ${event.outputPath}`);
});

test("expandSprite writes a failure usage event when synthesis throws", async () => {
  const origin = await writeOrigin();
  const repo = await mkdtemp(join(tmpdir(), "assetgen-expand-usage-fail-"));
  const usageLogPath = join(repo, "usage.jsonl");

  await assert.rejects(
    expandSprite({
      id: "warden",
      origin,
      game: "shared",
      actions: [{ name: "idle", frames: 1 }],
      directions: resolveDirections(1),
      provider: "mock",
      fps: 8,
      size: 40,
      height: 24,
      anchor: [0.5, 1],
      scale: 1,
      outputRoot: join(repo, "src/assets"),
      usageLogPath,
      generate: throwingGenerator,
    }),
    /synth boom/,
  );

  const events = (await readFile(usageLogPath, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(events.length, 1);
  assert.equal(events[0].command, "expand");
  assert.equal(events[0].success, false);
});

test("expandSprite attributes the provider/model the generator actually used", async () => {
  const origin = await writeOrigin();
  const repo = await mkdtemp(join(tmpdir(), "assetgen-expand-override-"));

  const result = await expandSprite({
    id: "warden",
    origin,
    game: "shared",
    actions: [{ name: "idle", frames: 1 }],
    directions: resolveDirections(1),
    provider: "mock", // requested mock, but the generator reports openai
    fps: 8,
    size: 40,
    height: 24,
    anchor: [0.5, 1],
    scale: 1,
    outputRoot: join(repo, "src/assets"),
    usageLogPath: "off",
    now: () => new Date("2026-06-13T10:00:00.000Z"),
    generate: openaiGenerator,
  });

  assert.equal(result.sheet.provider, "openai");
  assert.equal(result.sheet.model, "gpt-image-2");
  assert.equal(result.entry.provider, "openai");
  assert.equal(result.entry.model, "gpt-image-2");
  assert.equal(result.entry.license.tool, "openai");
});

test("expandSprite records --method and stays on identical output paths", async () => {
  const origin = await writeOrigin();
  const repo = await mkdtemp(join(tmpdir(), "assetgen-expand-method-"));
  const outputRoot = join(repo, "src/assets");

  const result = await expandSprite({
    id: "husk",
    origin,
    game: "shared",
    actions: [{ name: "idle", frames: 1 }],
    directions: resolveDirections(1),
    provider: "mock",
    method: "controlnet",
    fps: 8,
    size: 40,
    height: 24,
    anchor: [0.5, 1],
    scale: 1,
    outputRoot,
    usageLogPath: "off",
    now: () => new Date("2026-06-13T10:00:00.000Z"),
    generate: brightGenerator,
  });

  assert.equal(result.sheet.method, "controlnet");
  assert.equal(result.entry.path, "sprites/husk.anim0.webp");
  assert.equal(result.entry.animation, "sprites/husk.anim.json");
  assert.match(result.sheet.clips.idle!.directions.south![0]!.duration.toString(), /\d+/);
});

test("expandSprite dry-run computes the plan without touching disk", async () => {
  const origin = await writeOrigin();
  const repo = await mkdtemp(join(tmpdir(), "assetgen-expand-dry-"));
  const outputRoot = join(repo, "src/assets");

  const result = await expandSprite({
    id: "ghost",
    origin,
    game: "shared",
    actions: [{ name: "idle", frames: 2 }],
    directions: resolveDirections(4),
    provider: "mock",
    fps: 10,
    size: 40,
    height: 24,
    anchor: [0.5, 1],
    scale: 1,
    outputRoot,
    usageLogPath: "off",
    dryRun: true,
    now: () => new Date("2026-06-13T10:00:00.000Z"),
    generate: brightGenerator,
  });

  assert.equal(result.written, false);
  assert.equal(result.frameCount, 8);
  assert.equal(result.outputPath, undefined);
  assert.equal(existsSync(outputRoot), false);
});

test("expandSprite rejects a missing origin", async () => {
  await assert.rejects(
    expandSprite({
      id: "nope",
      origin: join(tmpdir(), "does-not-exist-xyz.png"),
      game: "shared",
      actions: [{ name: "idle", frames: 1 }],
      directions: resolveDirections(1),
      provider: "mock",
      fps: 8,
      size: 40,
      height: 24,
      anchor: [0.5, 1],
      scale: 1,
      outputRoot: join(tmpdir(), "unused"),
      usageLogPath: "off",
      generate: brightGenerator,
    }),
    /origin sprite not found/,
  );
});
