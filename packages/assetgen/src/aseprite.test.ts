import assert from "node:assert/strict";
import { test } from "node:test";

import {
  expandTagFrames,
  normalizeFrames,
  parseAseprite,
  sanitizeClipName,
  splitTagName,
} from "./aseprite.ts";
import type { AsepriteDoc, AsepriteFrameTag, NormalizedFrame } from "./aseprite.ts";

const rect = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });

/** Build an Aseprite doc with `count` left-to-right cells of `size` px and optional tags. */
function sheet(count: number, size = 16, tags?: AsepriteFrameTag[]): AsepriteDoc {
  const frames = Array.from({ length: count }, (_unused, i) => ({
    filename: `f${i}`,
    frame: rect(i * size, 0, size, size),
    duration: 100,
  }));
  return { frames, meta: { image: "sheet.png", size: { w: count * size, h: size }, frameTags: tags } };
}

test("sanitizeClipName lowercases, kebab-cases, and trims", () => {
  assert.equal(sanitizeClipName("  Run Cycle  "), "run-cycle");
  assert.equal(sanitizeClipName("Attack!!"), "attack");
  assert.equal(sanitizeClipName("__idle__"), "idle");
});

test("splitTagName peels a recognized facing suffix, else keeps the whole clip", () => {
  assert.deepEqual(splitTagName("run_west"), { clip: "run", facing: "west" });
  assert.deepEqual(splitTagName("idle_se"), { clip: "idle", facing: "southeast" });
  assert.deepEqual(splitTagName("walk-northwest"), { clip: "walk", facing: "northwest" });
  // No facing suffix -> whole name is the clip, default facing south.
  assert.deepEqual(splitTagName("attack"), { clip: "attack", facing: "south" });
  // Single-letter / cardinal-word tails are NOT treated as facings (avoid mis-splitting).
  assert.deepEqual(splitTagName("power_up"), { clip: "power-up", facing: "south" });
  assert.deepEqual(splitTagName("cast_e"), { clip: "cast-e", facing: "south" });
});

test("normalizeFrames handles both an array and a filename-keyed hash", () => {
  const arr = normalizeFrames([
    { frame: rect(0, 0, 8, 8), duration: 120 },
    { frame: rect(8, 0, 8, 8) },
  ]);
  assert.equal(arr.length, 2);
  assert.equal(arr[0]!.duration, 120);
  // Missing/zero duration falls back to the 100ms Aseprite default.
  assert.equal(arr[1]!.duration, 100);

  const hash = normalizeFrames({
    "a.png": { frame: rect(0, 0, 8, 8), duration: 50 },
    "b.png": { frame: rect(8, 0, 8, 8), duration: 50 },
  });
  assert.equal(hash.length, 2);
  assert.deepEqual(hash[0]!.rect, rect(0, 0, 8, 8));
});

test("normalizeFrames rejects missing or degenerate rects", () => {
  assert.throws(() => normalizeFrames([{ frame: undefined as never }]), /missing a valid/);
  assert.throws(() => normalizeFrames([{ frame: rect(0, 0, 0, 8) }]), /non-positive size/);
});

test("normalizeFrames floors fractional rects so they stay integer-safe for sharp.extract", () => {
  // A hand-edited / tool-mangled JSON can carry sub-pixel coords. Floor them here so
  // they never reach sharp.extract as non-integers (the cryptic mid-pack failure the
  // importer's bounds check exists to prevent), and validate the floored size > 0.
  const [floored] = normalizeFrames([{ frame: rect(0.5, 2.9, 16.7, 16.2), duration: 100 }]);
  assert.deepEqual(floored!.rect, rect(0, 2, 16, 16));
  // A sub-pixel width floors to 0 and is rejected as non-positive, not passed to sharp.
  assert.throws(() => normalizeFrames([{ frame: rect(0, 0, 0.5, 8) }]), /non-positive size/);
});

test("expandTagFrames unrolls forward / reverse / pingpong sequences", () => {
  const frames: NormalizedFrame[] = [0, 1, 2, 3].map((i) => ({ rect: rect(i * 8, 0, 8, 8), duration: 100 }));
  const idx = (tag: Parameters<typeof expandTagFrames>[0]) => expandTagFrames(tag, frames).map((f) => f.frameIndex);

  assert.deepEqual(idx({ name: "f", from: 0, to: 3, direction: "forward" }), [0, 1, 2, 3]);
  assert.deepEqual(idx({ name: "r", from: 0, to: 3, direction: "reverse" }), [3, 2, 1, 0]);
  // pingpong does not repeat the endpoints
  assert.deepEqual(idx({ name: "p", from: 0, to: 3, direction: "pingpong" }), [0, 1, 2, 3, 2, 1]);
  assert.deepEqual(idx({ name: "pr", from: 0, to: 3, direction: "pingpong_reverse" }), [3, 2, 1, 0, 1, 2]);
  // from/to swapped is normalized to lo..hi
  assert.deepEqual(idx({ name: "s", from: 3, to: 1, direction: "forward" }), [1, 2, 3]);
  // out-of-range indices clamp into the frame list rather than producing holes
  assert.deepEqual(idx({ name: "c", from: 0, to: 99, direction: "forward" }), [0, 1, 2, 3]);
});

test("parseAseprite with no tags makes one clip from the default clip name", () => {
  const parsed = parseAseprite(sheet(3), { defaultClip: "Idle Pose" });
  assert.equal(parsed.clips.length, 1);
  assert.equal(parsed.clips[0]!.name, "idle-pose");
  assert.equal(parsed.clips[0]!.facing, "south");
  assert.equal(parsed.clips[0]!.frames.length, 3);
  assert.equal(parsed.image, "sheet.png");
  assert.deepEqual(parsed.size, { w: 48, h: 16 });
});

test("parseAseprite makes one clip per tag, splitting facing suffixes", () => {
  const parsed = parseAseprite(
    sheet(4, 16, [
      { name: "run_south", from: 0, to: 1, direction: "forward" },
      { name: "run_north", from: 2, to: 3, direction: "forward" },
    ]),
  );
  assert.equal(parsed.clips.length, 2);
  assert.deepEqual(
    parsed.clips.map((c) => [c.name, c.facing, c.frames.length]),
    [
      ["run", "south", 2],
      ["run", "north", 2],
    ],
  );
});

test("parseAseprite throws on an empty / frameless doc", () => {
  assert.throws(() => parseAseprite({ frames: [] }), /no frames/);
  assert.throws(() => parseAseprite({} as AsepriteDoc), /missing a `frames`/);
});
