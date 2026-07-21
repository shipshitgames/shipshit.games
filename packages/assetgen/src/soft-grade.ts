// soft-grade — non-destructive value/temperature correction + advisory gamut
// reporting (issue #56).
//
// The canonical ranges live in DESIGN.md and are compiled into GRADE_PARAMS.
// This pass interpolates toward those ranges; it never hard-remaps to a palette,
// changes alpha, or decides whether an asset can ship. The accompanying report
// is deliberately advisory input for human review.

import sharp from "sharp";

import { GRADE_PARAMS } from "./style.ts";

export interface SoftGradeConfig {
  /** Interpolation strength from the source toward the canonical range (0..1). */
  strength: number;
  /** Allowed Rec.709 luma range, normalized to 0..1. */
  valueRange: readonly [number, number];
  /** Allowed warm/cool balance `(red - blue) / 255`, in -1..1. */
  temperatureRange: readonly [number, number];
  /** Ignore pixels below this alpha when grading/reporting. */
  alphaThreshold: number;
  /** Minimum out-of-range visible-pixel share considered material. */
  materialPixelRatio: number;
  /** Maximum number of representative out-of-range source colors to report. */
  exampleLimit: number;
  /** Canonical shadow floor; pixels at/below it are preserved as intentional black. */
  blackPoint: string;
  /** Preserve highlights above the value ceiling while still reporting them. */
  preserveEmissive: boolean;
}

export type GamutFindingKind = "value-low" | "value-high" | "temperature-cool" | "temperature-warm";

export interface GamutFinding {
  kind: GamutFindingKind;
  pixels: number;
  ratio: number;
  message: string;
}

export interface GamutColorExample {
  hex: string;
  pixels: number;
  ratio: number;
  reasons: GamutFindingKind[];
}

export interface ColorGamutReport {
  schemaVersion: 1;
  advisory: true;
  blocking: false;
  canon: "assetgen.gradeParams.softGrade";
  dimensions: [number, number];
  config: SoftGradeConfig;
  summary: {
    visiblePixels: number;
    outOfGamutPixels: number;
    outOfGamutRatio: number;
    changedPixels: number;
    material: boolean;
  };
  findings: GamutFinding[];
  examples: GamutColorExample[];
}

export interface SoftGradeResult {
  report: ColorGamutReport;
}

export interface SoftGradeImageResult extends SoftGradeResult {
  data: Buffer;
}

type GeneratedSoftGrade = Partial<{
  strength: unknown;
  valueRange: unknown;
  temperatureRange: unknown;
  alphaThreshold: unknown;
  materialPixelRatio: unknown;
  exampleLimit: unknown;
}>;

type GeneratedGradeParams = {
  blackPoint?: unknown;
  preserveEmissive?: unknown;
  softGrade?: GeneratedSoftGrade;
};

function finite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function requiredFinite(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`invalid generated soft-grade token: ${label}`);
  }
  return value;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function byte(value: number): number {
  return Math.round(clamp(value, 0, 255));
}

function range(value: unknown, fallback: readonly [number, number], min: number, max: number): [number, number] {
  if (!Array.isArray(value) || value.length !== 2) return [fallback[0], fallback[1]];
  const lo = clamp(finite(value[0], fallback[0]), min, max);
  const hi = clamp(finite(value[1], fallback[1]), min, max);
  return lo <= hi ? [lo, hi] : [hi, lo];
}

function requiredRange(value: unknown, label: string, min: number, max: number): [number, number] {
  if (!Array.isArray(value) || value.length !== 2) throw new Error(`invalid generated soft-grade token: ${label}`);
  const lo = requiredFinite(value[0], `${label}[0]`);
  const hi = requiredFinite(value[1], `${label}[1]`);
  if (lo < min || hi > max || lo > hi) throw new Error(`invalid generated soft-grade token: ${label}`);
  return [lo, hi];
}

function hexRgb(value: string): [number, number, number] {
  const match = /^#([0-9a-f]{6})$/i.exec(value);
  if (!match) throw new Error("invalid generated soft-grade token: blackPoint");
  const parsed = Number.parseInt(match[1]!, 16);
  return [(parsed >> 16) & 255, (parsed >> 8) & 255, parsed & 255];
}

/** Resolve the checked-in DESIGN.md-derived grading contract. */
export function canonicalSoftGradeConfig(overrides: Partial<SoftGradeConfig> = {}): SoftGradeConfig {
  const gradeParams = GRADE_PARAMS as unknown as GeneratedGradeParams;
  const generated = gradeParams.softGrade;
  if (!generated) throw new Error("generated gradeParams.softGrade is missing; run `bun assetgen tokens`");
  const generatedValueRange = requiredRange(generated.valueRange, "valueRange", 0, 1);
  const generatedTemperatureRange = requiredRange(generated.temperatureRange, "temperatureRange", -1, 1);
  const valueRange = overrides.valueRange ?? generatedValueRange;
  const temperatureRange = overrides.temperatureRange ?? generatedTemperatureRange;
  const blackPoint =
    typeof overrides.blackPoint === "string"
      ? overrides.blackPoint
      : typeof gradeParams.blackPoint === "string"
        ? gradeParams.blackPoint
        : "";
  hexRgb(blackPoint);
  return {
    strength: clamp(finite(overrides.strength, requiredFinite(generated.strength, "strength")), 0, 1),
    valueRange: range(valueRange, generatedValueRange, 0, 1),
    temperatureRange: range(temperatureRange, generatedTemperatureRange, -1, 1),
    alphaThreshold: Math.round(
      clamp(finite(overrides.alphaThreshold, requiredFinite(generated.alphaThreshold, "alphaThreshold")), 0, 255),
    ),
    materialPixelRatio: clamp(
      finite(overrides.materialPixelRatio, requiredFinite(generated.materialPixelRatio, "materialPixelRatio")),
      0,
      1,
    ),
    exampleLimit: Math.max(
      0,
      Math.floor(finite(overrides.exampleLimit, requiredFinite(generated.exampleLimit, "exampleLimit"))),
    ),
    blackPoint,
    preserveEmissive:
      typeof overrides.preserveEmissive === "boolean"
        ? overrides.preserveEmissive
        : gradeParams.preserveEmissive === true,
  };
}

function luma(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function temperature(r: number, b: number): number {
  return (r - b) / 255;
}

function hex(r: number, g: number, b: number): string {
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

const FINDING_MESSAGES: Record<GamutFindingKind, (count: number) => string> = {
  "value-low": (count) => `${count} visible pixel(s) fall below the canonical value floor.`,
  "value-high": (count) => `${count} visible pixel(s) exceed the canonical value ceiling.`,
  "temperature-cool": (count) => `${count} visible pixel(s) are cooler than the canonical temperature range.`,
  "temperature-warm": (count) => `${count} visible pixel(s) are warmer than the canonical temperature range.`,
};

/**
 * Grade an RGBA buffer in place and return a non-blocking report of the source
 * colors that were outside the canonical value/temperature range. Alpha is read
 * for visibility only and is never modified.
 */
export function softGradeRgba(
  data: Uint8Array | Buffer,
  width: number,
  height: number,
  overrides: Partial<SoftGradeConfig> = {},
): SoftGradeResult {
  const config = canonicalSoftGradeConfig(overrides);
  const [blackR, blackG, blackB] = hexRgb(config.blackPoint);
  const blackPointValue = luma(blackR, blackG, blackB);
  const findingCounts = new Map<GamutFindingKind, number>();
  // Four-bit/channel bins cap report-analysis memory at 4096 colors even for a
  // noisy multi-megapixel provider image. Preserve the first exact color in a
  // bin for a human-readable example while counting the whole bin.
  const examples = new Map<number, { hex: string; pixels: number; reasons: Set<GamutFindingKind> }>();
  let visiblePixels = 0;
  let outOfGamutPixels = 0;
  let changedPixels = 0;

  for (let i = 0; i < width * height; i++) {
    const offset = i * 4;
    if (data[offset + 3]! < config.alphaThreshold) continue;
    visiblePixels++;

    const r = data[offset]!;
    const g = data[offset + 1]!;
    const b = data[offset + 2]!;
    const value = luma(r, g, b);
    const heat = temperature(r, b);
    const preserveShadow = value <= blackPointValue;
    const reasons: GamutFindingKind[] = [];
    if (!preserveShadow && value < config.valueRange[0]) reasons.push("value-low");
    if (value > config.valueRange[1]) reasons.push("value-high");
    if (heat < config.temperatureRange[0]) reasons.push("temperature-cool");
    if (heat > config.temperatureRange[1]) reasons.push("temperature-warm");

    if (reasons.length > 0) {
      outOfGamutPixels++;
      for (const reason of reasons) findingCounts.set(reason, (findingCounts.get(reason) ?? 0) + 1);
      const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      const example = examples.get(key) ?? {
        hex: hex(r, g, b),
        pixels: 0,
        reasons: new Set<GamutFindingKind>(),
      };
      example.pixels++;
      for (const reason of reasons) example.reasons.add(reason);
      examples.set(key, example);
    }

    if (config.strength === 0 || preserveShadow) continue;
    const targetValue =
      config.preserveEmissive && value > config.valueRange[1]
        ? value
        : clamp(value, config.valueRange[0], config.valueRange[1]);
    const valueShift = (targetValue - value) * 255 * config.strength;
    const targetHeat = clamp(heat, config.temperatureRange[0], config.temperatureRange[1]);
    const heatShift = (targetHeat - heat) * 255 * config.strength * 0.5;
    const greenCompensation = -heatShift * ((0.2126 - 0.0722) / 0.7152);
    const nextR = byte(r + valueShift + heatShift);
    const nextG = byte(g + valueShift + greenCompensation);
    const nextB = byte(b + valueShift - heatShift);
    if (nextR !== r || nextG !== g || nextB !== b) changedPixels++;
    data[offset] = nextR;
    data[offset + 1] = nextG;
    data[offset + 2] = nextB;
  }

  const outOfGamutRatio = visiblePixels === 0 ? 0 : outOfGamutPixels / visiblePixels;
  const findings = [...findingCounts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([kind, pixels]) => ({
      kind,
      pixels,
      ratio: round(pixels / Math.max(1, visiblePixels)),
      message: FINDING_MESSAGES[kind](pixels),
    }));
  const colorExamples = [...examples.entries()]
    .sort(([, a], [, b]) => b.pixels - a.pixels)
    .slice(0, config.exampleLimit)
    .map(([, example]) => ({
      hex: example.hex,
      pixels: example.pixels,
      ratio: round(example.pixels / Math.max(1, visiblePixels)),
      reasons: [...example.reasons].sort(),
    }));

  return {
    report: {
      schemaVersion: 1,
      advisory: true,
      blocking: false,
      canon: "assetgen.gradeParams.softGrade",
      dimensions: [width, height],
      config,
      summary: {
        visiblePixels,
        outOfGamutPixels,
        outOfGamutRatio: round(outOfGamutRatio),
        changedPixels,
        material: outOfGamutPixels > 0 && outOfGamutRatio >= config.materialPixelRatio,
      },
      findings,
      examples: colorExamples,
    },
  };
}

/** Decode, softly grade, and losslessly re-encode without trimming or resizing. */
export async function softGradeImage(
  input: Buffer,
  overrides: Partial<SoftGradeConfig> = {},
): Promise<SoftGradeImageResult> {
  const decoded = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const data = Buffer.from(decoded.data);
  const result = softGradeRgba(data, decoded.info.width, decoded.info.height, overrides);
  const output = await sharp(data, {
    raw: {
      width: decoded.info.width,
      height: decoded.info.height,
      channels: 4,
    },
  })
    .webp({ lossless: true, effort: 5 })
    .toBuffer();
  return { data: output, report: result.report };
}

export function serializeColorGamutReport(report: ColorGamutReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}
