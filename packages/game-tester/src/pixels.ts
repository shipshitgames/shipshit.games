// Pure pixel analysis used for blank-canvas detection. The browser-side sampling
// (see runner.ts) downscales the canvas and hands a flat RGBA array here, which
// keeps this logic fully unit-testable without a browser.

import { DEFAULT_BLANK_THRESHOLDS, type BlankThresholds, type PixelStats } from "./types.ts";

const EMPTY_BUCKET = -1;
const ALPHA_FLOOR = 8;

/** Pack a pixel into a 15-bit quantized color key, or EMPTY_BUCKET when transparent. */
function bucket(r: number, g: number, b: number, a: number): number {
  if (a < ALPHA_FLOOR) return EMPTY_BUCKET;
  return ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
}

/**
 * Analyze a flat RGBA buffer (length === width * height * 4).
 *
 * "Blank" means the canvas is effectively a single flat color or transparent —
 * the dominant bucket covers nearly everything, or there are too few distinct
 * colors. A genuine rendered frame has many colors and a meaningful fill ratio.
 */
export function analyzePixels(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
  thresholds: BlankThresholds = DEFAULT_BLANK_THRESHOLDS,
): PixelStats {
  const pixels = Math.max(0, Math.floor(width) * Math.floor(height));
  const expected = pixels * 4;
  if (pixels === 0 || rgba.length < expected) {
    return {
      sampleWidth: Math.max(0, Math.floor(width)),
      sampleHeight: Math.max(0, Math.floor(height)),
      fillRatio: 0,
      uniqueColors: 0,
      meanLuma: 0,
      variance: 0,
      blank: true,
    };
  }

  const counts = new Map<number, number>();
  const lumas = new Float64Array(pixels);
  let lumaSum = 0;

  for (let i = 0; i < pixels; i++) {
    const o = i * 4;
    const r = rgba[o] ?? 0;
    const g = rgba[o + 1] ?? 0;
    const b = rgba[o + 2] ?? 0;
    const a = rgba[o + 3] ?? 0;
    const key = bucket(r, g, b, a);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) * (a / 255);
    lumas[i] = luma;
    lumaSum += luma;
  }

  let dominant = 0;
  for (const count of counts.values()) {
    if (count > dominant) dominant = count;
  }

  const fillRatio = (pixels - dominant) / pixels;
  const uniqueColors = counts.size;
  const meanLuma = lumaSum / pixels;

  let varianceAcc = 0;
  for (let i = 0; i < pixels; i++) {
    const d = (lumas[i] ?? 0) - meanLuma;
    varianceAcc += d * d;
  }
  const variance = varianceAcc / pixels;

  const blank = uniqueColors <= thresholds.uniqueColors || fillRatio < thresholds.fillRatio;

  return {
    sampleWidth: Math.floor(width),
    sampleHeight: Math.floor(height),
    fillRatio,
    uniqueColors,
    meanLuma,
    variance,
    blank,
  };
}
