import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";

import {
  analyzeHorizontalSheet,
  detectAlphaBounds,
  normalizeHorizontalSheet,
  splitHorizontalSheet,
  splitHorizontalSheetProportional,
  type SheetViolation,
} from "./sheet-normalize.ts";

const RED = { r: 220, g: 20, b: 20, alpha: 1 };
const BLUE = { r: 20, g: 70, b: 220, alpha: 1 };
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

function codes(violations: SheetViolation[]): string[] {
  return violations.map((violation) => violation.code);
}

async function rect(width: number, height: number, color = RED): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 4, background: color } }).png().toBuffer();
}

async function writeSheet(
  path: string,
  opts: {
    columns: number;
    cellWidth: number;
    cellHeight: number;
    cells: Array<{ index: number; left: number; top: number; width: number; height: number; color?: typeof RED }>;
  },
): Promise<void> {
  const overlays = await Promise.all(
    opts.cells.map(async (cell) => ({
      input: await rect(cell.width, cell.height, cell.color ?? RED),
      left: cell.index * opts.cellWidth + cell.left,
      top: cell.top,
    })),
  );
  await writeFile(
    path,
    await sharp({
      create: {
        width: opts.columns * opts.cellWidth,
        height: opts.cellHeight,
        channels: 4,
        background: TRANSPARENT,
      },
    })
      .composite(overlays)
      .png()
      .toBuffer(),
  );
}

async function rawRgba(path: string): Promise<Buffer> {
  return Buffer.from((await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true })).data);
}

describe("sheet alpha bounds and geometry", () => {
  test("detectAlphaBounds returns the visible alpha rectangle inside a cell", () => {
    const data = Buffer.alloc(10 * 10 * 4);
    for (let y = 3; y <= 5; y += 1) {
      for (let x = 2; x <= 4; x += 1) {
        data[(y * 10 + x) * 4 + 3] = 255;
      }
    }

    expect(detectAlphaBounds(data, 10, { left: 0, top: 0, width: 10, height: 10 })).toEqual({
      left: 2,
      top: 3,
      right: 4,
      bottom: 5,
      width: 3,
      height: 3,
    });
  });

  test("splitHorizontalSheet enforces equal-width 1 x N geometry", () => {
    expect(splitHorizontalSheet(96, 24, 3)).toEqual([
      { index: 0, left: 0, top: 0, width: 32, height: 24 },
      { index: 1, left: 32, top: 0, width: 32, height: 24 },
      { index: 2, left: 64, top: 0, width: 32, height: 24 },
    ]);
    expect(() => splitHorizontalSheet(95, 24, 3)).toThrow(/not divisible/);
  });

  test("splitHorizontalSheetProportional covers an invalid-width source for repair mode", () => {
    expect(splitHorizontalSheetProportional(95, 24, 3)).toEqual([
      { index: 0, left: 0, top: 0, width: 32, height: 24 },
      { index: 1, left: 32, top: 0, width: 31, height: 24 },
      { index: 2, left: 63, top: 0, width: 32, height: 24 },
    ]);
  });
});

describe("horizontal sheet analysis", () => {
  test("flags blank, clipped, drifting, and size-inconsistent cells", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assetgen-sheet-analysis-"));
    try {
      const input = join(dir, "mixed.png");
      await writeSheet(input, {
        columns: 4,
        cellWidth: 32,
        cellHeight: 24,
        cells: [
          { index: 0, left: 12, top: 8, width: 8, height: 8 },
          // cell 1 intentionally blank
          { index: 2, left: 0, top: 8, width: 8, height: 8, color: BLUE },
          { index: 3, left: 8, top: 8, width: 16, height: 8 },
        ],
      });

      const report = await analyzeHorizontalSheet(input, {
        columns: 4,
        maxCenterDrift: 1,
        maxBoundsDelta: 2,
        maxAspectDelta: 0.05,
      });

      expect(report.ok).toBe(false);
      expect(codes(report.violations)).toContain("blank-cell");
      expect(codes(report.violations)).toContain("clipped-cell");
      expect(codes(report.violations)).toContain("center-drift");
      expect(codes(report.violations)).toContain("bounds-delta");
      expect(codes(report.violations)).toContain("aspect-delta");
      expect(report.reference).toEqual({ width: 8, height: 8, aspect: 1 });
      expect(JSON.parse(JSON.stringify(report)).cells[0].bounds.centerDrift).toBe(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("normalizeHorizontalSheet", () => {
  test("recenters off-center cells while preserving sheet dimensions and columns", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assetgen-sheet-normalize-"));
    try {
      const input = join(dir, "offcenter.png");
      const output = join(dir, "normalized.png");
      await writeSheet(input, {
        columns: 3,
        cellWidth: 32,
        cellHeight: 24,
        cells: [
          { index: 0, left: 1, top: 2, width: 10, height: 8 },
          { index: 1, left: 11, top: 8, width: 10, height: 8, color: BLUE },
          { index: 2, left: 20, top: 14, width: 10, height: 8 },
        ],
      });

      const report = await normalizeHorizontalSheet(input, output, {
        columns: 3,
        maxCenterDrift: 1,
        maxBoundsDelta: 0,
        maxAspectDelta: 0,
      });
      expect(report.ok).toBe(true);
      expect(report.wrote).toBe(true);
      expect(report.before.width).toBe(96);
      expect(report.after?.width).toBe(96);
      expect(report.after?.height).toBe(24);
      expect(report.after?.cellWidth).toBe(32);
      expect(report.cells.every((cell) => cell.after?.bounds?.centerDrift !== undefined && cell.after.bounds.centerDrift <= 1)).toBe(true);
      expect(report.cells[0]!.changed).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("padding scales oversized visible content down to preserve transparent inset", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assetgen-sheet-padding-"));
    try {
      const input = join(dir, "large.png");
      const output = join(dir, "padded.png");
      await writeSheet(input, {
        columns: 1,
        cellWidth: 20,
        cellHeight: 20,
        cells: [{ index: 0, left: 1, top: 1, width: 18, height: 18 }],
      });

      const report = await normalizeHorizontalSheet(input, output, {
        columns: 1,
        padding: 4,
        maxCenterDrift: 0,
        maxBoundsDelta: 0,
        maxAspectDelta: 0,
      });
      expect(report.ok).toBe(true);
      expect(report.after?.cells[0]?.bounds).toMatchObject({ left: 4, top: 4, width: 12, height: 12 });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("already-normalized sheets are idempotent", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assetgen-sheet-idempotent-"));
    try {
      const input = join(dir, "centered.png");
      const output1 = join(dir, "normalized-1.png");
      const output2 = join(dir, "normalized-2.png");
      await writeSheet(input, {
        columns: 2,
        cellWidth: 32,
        cellHeight: 24,
        cells: [
          { index: 0, left: 12, top: 8, width: 8, height: 8 },
          { index: 1, left: 12, top: 8, width: 8, height: 8, color: BLUE },
        ],
      });

      const first = await normalizeHorizontalSheet(input, output1, { columns: 2, maxBoundsDelta: 0, maxAspectDelta: 0 });
      const second = await normalizeHorizontalSheet(output1, output2, { columns: 2, maxBoundsDelta: 0, maxAspectDelta: 0 });

      expect(first.ok).toBe(true);
      expect(second.ok).toBe(true);
      expect(await rawRgba(output1)).toEqual(await rawRgba(output2));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("canonical cell size repairs an invalid source width into fixed output dimensions", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assetgen-sheet-canonical-"));
    try {
      const input = join(dir, "invalid-width.png");
      const output = join(dir, "fixed.png");
      await writeSheet(input, {
        columns: 3,
        cellWidth: 32,
        cellHeight: 24,
        cells: [
          { index: 0, left: 12, top: 8, width: 8, height: 8 },
          { index: 1, left: 12, top: 8, width: 8, height: 8, color: BLUE },
          { index: 2, left: 12, top: 8, width: 8, height: 8 },
        ],
      });
      const invalidWidth = await sharp(input).extract({ left: 0, top: 0, width: 95, height: 24 }).png().toBuffer();
      await writeFile(input, invalidWidth);

      const before = await analyzeHorizontalSheet(input, { columns: 3, cellWidth: 32, cellHeight: 24 });
      expect(codes(before.violations)).toEqual(["invalid-geometry", "dimension-mismatch"]);

      const report = await normalizeHorizontalSheet(input, output, {
        columns: 3,
        cellWidth: 32,
        cellHeight: 24,
        maxBoundsDelta: 0,
        maxAspectDelta: 0,
      });
      expect(report.ok).toBe(true);
      expect(report.after?.width).toBe(96);
      expect(report.after?.height).toBe(24);
      expect(report.after?.expectedCellWidth).toBe(32);
      expect(report.after?.expectedCellHeight).toBe(24);
      expect(report.after?.violations).toEqual([]);

      const meta = await sharp(output).metadata();
      expect(meta.width).toBe(96);
      expect(meta.height).toBe(24);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
