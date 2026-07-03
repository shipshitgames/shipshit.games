import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";

import {
  manifestKindForSprite,
  parseAnchor,
  parseViews,
  spritePromptDirective,
  toSpriteSheetWebp,
  transparentizeEdgeBackground,
} from "./sprites";

test("parseViews sanitizes, dedups, and defaults to front", () => {
  assert.deepEqual(parseViews(undefined), ["front"]);
  assert.deepEqual(parseViews(""), ["front"]);
  assert.deepEqual(parseViews("Front, Side , front"), ["front", "side"]);
  assert.deepEqual(parseViews("three quarter"), ["three-quarter"]);
});

test("parseAnchor parses, clamps, and falls back", () => {
  assert.deepEqual(parseAnchor("0.25,0.75"), [0.25, 0.75]);
  assert.deepEqual(parseAnchor("2,-1"), [1, 0]);
  assert.deepEqual(parseAnchor("nope"), [0.5, 1]);
  assert.deepEqual(parseAnchor(undefined), [0.5, 1]);
});

test("spritePromptDirective adapts to frames and views", () => {
  assert.match(spritePromptDirective(["front"], 1), /Single transparent billboard/);
  assert.match(spritePromptDirective(["front"], 4), /4 frames in one horizontal row/);
  assert.match(spritePromptDirective(["front", "side"], 1), /front, side views/);
  assert.match(spritePromptDirective(["front", "side"], 4), /4 animation frames per row/);
});

test("manifestKindForSprite promotes animated sprites", () => {
  assert.equal(manifestKindForSprite("sprite", 1), "sprite");
  assert.equal(manifestKindForSprite("sprite", 4), "sprite-anim");
  assert.equal(manifestKindForSprite("texture", 4), "texture");
});

async function rawPixels(buf: Buffer) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const at = (x: number, y: number) => {
    const i = (y * info.width + x) * info.channels;
    return { r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] };
  };
  return { data, info, at };
}

test("toSpriteSheetWebp slices a gridded source into the correct sheet cells", async () => {
  // Two opaque blocks on a transparent canvas, one per view cell. trim() keeps
  // both (the union bounding box), then slicing must place left->cell0, right->cell1.
  const red = await sharp({ create: { width: 18, height: 18, channels: 4, background: { r: 230, g: 24, b: 24, alpha: 1 } } }).png().toBuffer();
  const blue = await sharp({ create: { width: 18, height: 18, channels: 4, background: { r: 24, g: 24, b: 230, alpha: 1 } } }).png().toBuffer();
  const source = await sharp({ create: { width: 100, height: 40, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([
      { input: red, left: 16, top: 11 },
      { input: blue, left: 66, top: 11 },
    ])
    .png()
    .toBuffer();

  const { data, frames, metadata } = await toSpriteSheetWebp(source, {
    id: "twocell",
    game: "scourge-survivors",
    prompt: "p",
    provider: "mock",
    views: ["left", "right"],
    frameCount: 1,
    size: 128,
  });

  assert.deepEqual(metadata.views, ["left", "right"]);
  assert.equal(metadata.sheet.usedColumns, 2);
  assert.equal(metadata.sheet.usedRows, 1);
  assert.equal(frames.length, 2);
  assert.deepEqual(frames.map((frame) => frame.view), ["left", "right"]);

  const { info, at } = await rawPixels(data);
  const cellW = metadata.frameSize[0];
  // Scan each cell for its dominant opaque color.
  function dominant(colStart: number, colEnd: number) {
    let redHits = 0;
    let blueHits = 0;
    for (let y = 0; y < info.height; y += 3) {
      for (let x = colStart; x < colEnd; x += 3) {
        const p = at(x, y);
        if ((p.a ?? 0) < 40) continue;
        if ((p.r ?? 0) > (p.b ?? 0) + 40) redHits++;
        else if ((p.b ?? 0) > (p.r ?? 0) + 40) blueHits++;
      }
    }
    return { redHits, blueHits };
  }
  const cell0 = dominant(0, cellW);
  const cell1 = dominant(cellW, cellW * 2);
  assert.ok(cell0.redHits > cell0.blueHits, `cell0 should be red-dominant: ${JSON.stringify(cell0)}`);
  assert.ok(cell1.blueHits > cell1.redHits, `cell1 should be blue-dominant: ${JSON.stringify(cell1)}`);
});

test("toSpriteSheetWebp exposes normalized frame buffers for a 1x4 pose sheet", async () => {
  const colors = [
    { r: 220, g: 20, b: 20 },
    { r: 20, g: 220, b: 20 },
    { r: 20, g: 20, b: 220 },
    { r: 220, g: 180, b: 20 },
  ];
  const cells = await Promise.all(
    colors.map((color) =>
      sharp({
        create: {
          width: 18,
          height: 18,
          channels: 4,
          background: { ...color, alpha: 1 },
        },
      })
        .png()
        .toBuffer(),
    ),
  );
  const source = await sharp({
    create: { width: 180, height: 48, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(cells.map((input, i) => ({ input, left: 14 + i * 42, top: 15 })))
    .png()
    .toBuffer();

  const { frames, metadata } = await toSpriteSheetWebp(source, {
    id: "poses",
    game: "scourge-survivors",
    prompt: "p",
    provider: "mock",
    views: ["front"],
    frameCount: 4,
    size: 128,
  });

  assert.equal(frames.length, 4);
  assert.deepEqual(metadata.frameSize, [32, 128]);
  assert.equal(metadata.frameSize[0] & (metadata.frameSize[0] - 1), 0);
  assert.equal(metadata.frameSize[1] & (metadata.frameSize[1] - 1), 0);

  for (const [index, frame] of frames.entries()) {
    assert.equal(frame.frame, index);
    assert.equal(frame.view, "front");
    assert.deepEqual(frame.dimensions, metadata.frameSize);
    const meta = await sharp(frame.data).metadata();
    assert.deepEqual([meta.width, meta.height], metadata.frameSize);
    const { at } = await rawPixels(frame.data);
    assert.equal(at(0, 0).a, 0, "frame padding should stay transparent");
  }
});

test("transparentizeEdgeBackground keys near-black background but keeps the subject", async () => {
  // #0a0a0a (luma ~10) backdrop with a brighter #2a2a2a (luma ~42) subject square.
  const subject = await sharp({ create: { width: 24, height: 24, channels: 4, background: { r: 42, g: 42, b: 42, alpha: 1 } } }).png().toBuffer();
  const source = await sharp({ create: { width: 64, height: 64, channels: 4, background: { r: 10, g: 10, b: 10, alpha: 1 } } })
    .composite([{ input: subject, left: 20, top: 20 }])
    .png()
    .toBuffer();

  const cut = await transparentizeEdgeBackground(source);
  const { at } = await rawPixels(cut);
  // Corner (background) is keyed transparent; center (subject) survives.
  assert.equal(at(1, 1).a, 0, "near-black background corner should be transparent");
  assert.ok((at(32, 32).a ?? 0) > 0, "subject center should remain opaque");
});
