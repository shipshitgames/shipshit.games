import { describe, expect, test } from "bun:test";

import { analyzePixels } from "./pixels.ts";

function solid(width: number, height: number, rgba: [number, number, number, number]): number[] {
  const out: number[] = [];
  for (let i = 0; i < width * height; i++) out.push(...rgba);
  return out;
}

describe("analyzePixels", () => {
  test("a fully transparent canvas is blank", () => {
    const stats = analyzePixels(solid(8, 8, [0, 0, 0, 0]), 8, 8);
    expect(stats.blank).toBe(true);
    expect(stats.uniqueColors).toBe(1);
    expect(stats.fillRatio).toBe(0);
  });

  test("a solid single color is blank", () => {
    const stats = analyzePixels(solid(8, 8, [20, 40, 60, 255]), 8, 8);
    expect(stats.blank).toBe(true);
    expect(stats.uniqueColors).toBe(1);
  });

  test("a multi-color frame is not blank", () => {
    const varied: number[] = [];
    for (let i = 0; i < 64; i++) varied.push((i * 3) % 256, (i * 7) % 256, (i * 11) % 256, 255);
    const stats = analyzePixels(varied, 8, 8);
    expect(stats.blank).toBe(false);
    expect(stats.uniqueColors).toBeGreaterThan(2);
    expect(stats.fillRatio).toBeGreaterThan(0.5);
    expect(stats.variance).toBeGreaterThan(0);
  });

  test("fillRatio threshold drives blankness independently of color count", () => {
    // 100 px: 96 background + 2 + 2 -> 3 colors, fillRatio 0.04.
    const buf: number[] = [];
    for (let i = 0; i < 96; i++) buf.push(10, 10, 10, 255);
    for (let i = 0; i < 2; i++) buf.push(200, 0, 0, 255);
    for (let i = 0; i < 2; i++) buf.push(0, 200, 0, 255);
    const thresholds = { fillRatio: 0.05, uniqueColors: 0 };
    expect(analyzePixels(buf, 10, 10, thresholds).blank).toBe(true);

    const half: number[] = [];
    for (let i = 0; i < 50; i++) half.push(10, 10, 10, 255);
    for (let i = 0; i < 50; i++) half.push(200, 0, 0, 255);
    const stats = analyzePixels(half, 10, 10, thresholds);
    expect(stats.fillRatio).toBeCloseTo(0.5, 5);
    expect(stats.blank).toBe(false);
  });

  test("a truncated buffer is treated as blank, not a crash", () => {
    const stats = analyzePixels([0, 0, 0], 8, 8);
    expect(stats.blank).toBe(true);
  });
});
