import assert from "node:assert/strict";
import { describe, test } from "bun:test";

import {
  alphaBounds,
  alphaMargins,
  copyRgbaCrop,
  countBorderAlphaPixels,
  cropForBounds,
  edgeQualityMetrics,
  measureDarkFringe,
  padHorizontalCells,
  rematteDarkEdgePixels,
  rematteDarkFringe,
} from "./rgba.ts";
import type { RgbaImage } from "./types.ts";

function image(width: number, height: number, pixels: number[][]): RgbaImage {
  const data = Buffer.alloc(width * height * 4);
  for (const [x = 0, y = 0, red = 0, green = 0, blue = 0, alpha = 0] of pixels) {
    data.set([red, green, blue, alpha], (y * width + x) * 4);
  }
  return { data, width, height };
}

function pixel(source: RgbaImage, x: number, y: number): number[] {
  const offset = (y * source.width + x) * 4;
  return Array.from(source.data.subarray(offset, offset + 4));
}

describe("asset QA RGBA primitives", () => {
  test("measures alpha bounds, margins, and border pixels with one threshold contract", () => {
    const source = image(6, 5, [
      [2, 1, 20, 30, 40, 255],
      [4, 1, 20, 30, 40, 255],
      [3, 3, 20, 30, 40, 255],
      [0, 4, 20, 30, 40, 4],
    ]);
    const bounds = alphaBounds(source, 4);
    assert.deepEqual(bounds, { minX: 2, minY: 1, maxX: 4, maxY: 3, pixels: 3 });
    assert.deepEqual(alphaMargins(bounds, source.width, source.height), { left: 2, top: 1, right: 1, bottom: 1 });
    assert.equal(countBorderAlphaPixels(source, 4), 0);
    assert.equal(countBorderAlphaPixels(source, 0), 1);
  });

  test("crops declared bounds with clamped padding", () => {
    const source = image(5, 4, [
      [1, 1, 10, 20, 30, 255],
      [3, 2, 40, 50, 60, 255],
    ]);
    const crop = cropForBounds({ minX: 1, minY: 1, maxX: 3, maxY: 2 }, 5, 4, 1);
    assert.deepEqual(crop, { x: 0, y: 0, width: 5, height: 4 });
    const cropped = copyRgbaCrop(source, { x: 1, y: 1, width: 3, height: 2 });
    assert.deepEqual(alphaBounds(cropped), { minX: 0, minY: 0, maxX: 2, maxY: 1, pixels: 2 });
  });

  test("pads each horizontal cell without leaking alpha across cell boundaries", () => {
    const source = image(6, 2, [
      [0, 0, 10, 0, 0, 255],
      [1, 0, 20, 0, 0, 255],
      [2, 0, 30, 0, 0, 255],
      [3, 0, 40, 0, 0, 255],
      [4, 0, 50, 0, 0, 255],
      [5, 0, 60, 0, 0, 255],
    ]);
    const padded = padHorizontalCells(source, {
      columns: 3,
      padding: { left: 1, right: 1, top: 1, bottom: 1 },
    });
    assert.equal(padded.width, 12);
    assert.equal(padded.height, 4);
    assert.equal(countBorderAlphaPixels(padded), 0);
    assert.deepEqual(pixel(padded, 1, 1), [10, 0, 0, 255]);
    assert.deepEqual(pixel(padded, 6, 1), [40, 0, 0, 255]);
  });

  test("remattes weighted-luma dark edges while preserving alpha and opaque contours", () => {
    const source = image(5, 5, [
      [1, 2, 0, 0, 0, 128],
      [2, 2, 210, 170, 120, 255],
      [3, 2, 220, 180, 130, 255],
      [1, 3, 0, 0, 0, 255],
    ]);
    const before = edgeQualityMetrics(source);
    assert.equal(rematteDarkEdgePixels(source, { minLumaDelta: 20 }), 1);
    assert.equal(pixel(source, 1, 2)[3], 128);
    assert.ok((pixel(source, 1, 2)[0] ?? 0) > 200);
    assert.deepEqual(pixel(source, 1, 3), [0, 0, 0, 255]);
    assert.ok(edgeQualityMetrics(source).fringeLuma < before.fringeLuma);
  });

  test("measures and remattes conservative dark alpha fringe deterministically", () => {
    const source = image(3, 3, [
      [1, 1, 8, 8, 8, 120],
      [2, 1, 235, 220, 190, 255],
      [1, 2, 205, 35, 28, 255],
      [2, 2, 235, 220, 190, 255],
    ]);
    assert.deepEqual(measureDarkFringe(source), { darkFringePixels: 1, semiTransparentPixels: 1 });
    assert.deepEqual(rematteDarkFringe(source), { changedPixels: 1, remattedPixels: 1, clearedPixels: 0 });
    assert.deepEqual(pixel(source, 1, 1), [225, 158, 136, 120]);
    assert.deepEqual(measureDarkFringe(source), { darkFringePixels: 0, semiTransparentPixels: 1 });
  });
});
