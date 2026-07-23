import { expect, test } from "bun:test";

import type { SpriteEditorAsset } from "../../shared/ipc";
import {
  offPalettePixelCount,
  pointerToPixel,
  spriteFrameCells,
} from "./sprite-editor-model";

const asset: SpriteEditorAsset = {
  id: "husk",
  kind: "sprite-anim",
  game: "deadrot",
  path: "sprites/husk.webp",
  origin: "draft",
  prompt: null,
  provider: "mock",
  dimensions: [64, 64],
  frameSize: [32, 32],
  frames: 2,
  fps: 8,
  views: ["front", "back"],
  sheet: { columns: 2, rows: 2, usedColumns: 2, usedRows: 2 },
  provenance: null,
  human: null,
  license: {},
};

test("maps sprite-sheet cells to view and frame labels", () => {
  expect(spriteFrameCells(asset, 64, 64).map((cell) => cell.label)).toEqual([
    "front · 1/2",
    "front · 2/2",
    "back · 1/2",
    "back · 2/2",
  ]);
});

test("maps scaled pointer coordinates into the selected sheet cell", () => {
  expect(
    pointerToPixel(
      150,
      75,
      { left: 100, top: 50, width: 100, height: 100 },
      { x: 32, y: 32, width: 32, height: 32 },
    ),
  ).toEqual({ x: 48, y: 40 });
});

test("counts opaque off-palette pixels but ignores transparent RGB", () => {
  const pixels = new Uint8ClampedArray([
    10, 10, 10, 255, 1, 2, 3, 255, 255, 255, 255, 0,
  ]);
  expect(offPalettePixelCount(pixels, ["#0a0a0a"])).toBe(1);
});
