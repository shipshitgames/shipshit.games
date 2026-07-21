import { describe, expect, test } from "bun:test";
import sharp from "sharp";

import { canonicalSoftGradeConfig, softGradeImage, softGradeRgba } from "./soft-grade.ts";

function rgba(
  width: number,
  height: number,
  paint: (x: number, y: number) => [number, number, number, number],
): Uint8Array {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      data.set(paint(x, y), offset);
    }
  }
  return data;
}

describe("softGradeRgba", () => {
  test("interpolates toward canonical value/temperature ranges without hard snapping", () => {
    const data = rgba(1, 1, () => [0, 0, 220, 255]);
    const result = softGradeRgba(data, 1, 1, {
      strength: 0.25,
      valueRange: [0.2, 0.8],
      temperatureRange: [0, 0.4],
    });

    expect(data[0]).toBeGreaterThan(0);
    expect(data[2]).toBeLessThan(220);
    expect(data[2]).toBeGreaterThan(data[0]!);
    expect(data[3]).toBe(255);
    expect(result.report.blocking).toBe(false);
    expect(result.report.advisory).toBe(true);
    expect(result.report.findings.map((finding) => finding.kind)).toContain("temperature-cool");
    expect(result.report.examples[0]?.hex).toBe("#0000dc");
  });

  test("reports material out-of-range colors while strength zero leaves bytes untouched", () => {
    const data = rgba(4, 1, (x) => (x < 3 ? [0, 0, 255, 255] : [80, 80, 80, 255]));
    const before = Uint8Array.from(data);
    const result = softGradeRgba(data, 4, 1, {
      strength: 0,
      temperatureRange: [0, 0.45],
      materialPixelRatio: 0.5,
    });

    expect(data).toEqual(before);
    expect(result.report.summary.outOfGamutPixels).toBe(3);
    expect(result.report.summary.outOfGamutRatio).toBe(0.75);
    expect(result.report.summary.material).toBe(true);
    expect(result.report.summary.changedPixels).toBe(0);
  });

  test("reads the default contract from generated DESIGN.md tokens", () => {
    expect(canonicalSoftGradeConfig()).toEqual({
      strength: 0.18,
      valueRange: [0.04, 0.9],
      temperatureRange: [0, 0.45],
      alphaThreshold: 8,
      materialPixelRatio: 0.05,
      exampleLimit: 8,
      blackPoint: "#0a0a0a",
      preserveEmissive: true,
    });
  });

  test("preserves canonical black-point shadows and emissive highlights", () => {
    const data = rgba(2, 1, (x) => (x === 0 ? [0, 0, 0, 255] : [255, 255, 255, 255]));
    const before = Uint8Array.from(data);
    const result = softGradeRgba(data, 2, 1);

    expect(data).toEqual(before);
    expect(result.report.findings.map((finding) => finding.kind)).not.toContain("value-low");
    expect(result.report.findings.map((finding) => finding.kind)).toContain("value-high");
  });

  test("rejects non-finite runtime overrides instead of dropping examples", () => {
    const data = rgba(1, 1, () => [0, 0, 255, 255]);
    const result = softGradeRgba(data, 1, 1, { exampleLimit: Number.NaN });
    expect(result.report.config.exampleLimit).toBe(8);
    expect(result.report.examples).toHaveLength(1);
  });
});

test("softGradeImage preserves sprite-sheet dimensions and alpha geometry", async () => {
  const width = 12;
  const height = 6;
  const source = rgba(width, height, (x, y) => {
    const visible = (x >= 1 && x <= 4 && y >= 1 && y <= 4) || (x >= 7 && x <= 10 && y >= 1 && y <= 4);
    return visible ? [20, 40, 220, 255] : [0, 0, 0, 0];
  });
  const input = await sharp(source, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer();
  const graded = await softGradeImage(input);
  const [before, after] = await Promise.all([
    sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(graded.data).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
  ]);

  expect([after.info.width, after.info.height]).toEqual([width, height]);
  for (let i = 0; i < width * height; i++) expect(after.data[i * 4 + 3]).toBe(before.data[i * 4 + 3]);
  expect(Buffer.compare(after.data, before.data)).not.toBe(0);
  expect(graded.report.dimensions).toEqual([width, height]);
});
