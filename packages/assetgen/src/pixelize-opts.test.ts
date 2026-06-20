import { expect, test } from "bun:test";
import {
  clampBgThreshold,
  clampHeight,
  CUTOUT_MODES,
  DEFAULT_BG_THRESHOLD,
  DEFAULT_CUTOUT_MODE,
  DEFAULT_PIXELIZE_HEIGHT,
  DEFAULT_PIXELIZE_PALETTE,
  isKnownPalette,
  normalizeCutoutMode,
  normalizePaletteName,
  PIXELIZE_HEIGHT_MAX,
  PIXELIZE_HEIGHT_MIN,
  PIXELIZE_PALETTE_NAMES,
} from "./pixelize-opts.ts";

test("clampHeight pins to [16,512], rounds, and falls back to the default on NaN", () => {
  expect(clampHeight(15)).toBe(PIXELIZE_HEIGHT_MIN);
  expect(clampHeight(16)).toBe(16);
  expect(clampHeight(110)).toBe(110);
  expect(clampHeight(512)).toBe(PIXELIZE_HEIGHT_MAX);
  expect(clampHeight(513)).toBe(512);
  expect(clampHeight(110.4)).toBe(110);
  expect(clampHeight("abc")).toBe(DEFAULT_PIXELIZE_HEIGHT);
  expect(clampHeight(undefined)).toBe(DEFAULT_PIXELIZE_HEIGHT);
});

test("clampBgThreshold pins to [0,255] and falls back to the default on NaN", () => {
  expect(clampBgThreshold(-1)).toBe(0);
  expect(clampBgThreshold(0)).toBe(0);
  expect(clampBgThreshold(42)).toBe(42);
  expect(clampBgThreshold(255)).toBe(255);
  expect(clampBgThreshold(256)).toBe(255);
  expect(clampBgThreshold("nope")).toBe(DEFAULT_BG_THRESHOLD);
});

test("normalizeCutoutMode accepts every mode (case-insensitive) and defaults unknown to auto", () => {
  for (const mode of CUTOUT_MODES) expect(normalizeCutoutMode(mode)).toBe(mode);
  expect(normalizeCutoutMode("AUTO")).toBe("auto");
  expect(normalizeCutoutMode("Rembg")).toBe("rembg");
  expect(normalizeCutoutMode("magic")).toBe(DEFAULT_CUTOUT_MODE);
  expect(normalizeCutoutMode("")).toBe(DEFAULT_CUTOUT_MODE);
  expect(normalizeCutoutMode(undefined)).toBe(DEFAULT_CUTOUT_MODE);
  expect(DEFAULT_CUTOUT_MODE).toBe("auto");
});

test("palette name validation/normalization is case-insensitive and defaults to doom", () => {
  for (const name of PIXELIZE_PALETTE_NAMES) {
    expect(isKnownPalette(name)).toBe(true);
    expect(normalizePaletteName(name)).toBe(name);
  }
  expect(normalizePaletteName("DOOM")).toBe("doom");
  expect(isKnownPalette("DOOM")).toBe(true);
  expect(isKnownPalette("nebula")).toBe(false);
  expect(normalizePaletteName("nebula")).toBe(DEFAULT_PIXELIZE_PALETTE);
  expect(normalizePaletteName(undefined)).toBe(DEFAULT_PIXELIZE_PALETTE);
  expect(DEFAULT_PIXELIZE_PALETTE).toBe("doom");
});
