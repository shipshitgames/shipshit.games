import { readFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";

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
import { decodeImageFile, encodeWebp, webpEncodingKind, writeFileAtomic } from "./io.ts";
import type {
  AlphaMargins,
  AssetQaAlphaCheck,
  AssetQaCheckReport,
  AssetQaChecks,
  AssetQaDiagnostic,
  AssetQaManifest,
  AssetQaMutationTargetReport,
  AssetQaRepair,
  AssetQaRepairReport,
  AssetQaRunOptions,
  AssetQaTarget,
  AssetQaTargetMetrics,
  AssetQaTargetReport,
  RgbaImage,
} from "./types.ts";

interface LoadedManifest {
  manifest: AssetQaManifest;
  manifestPath: string;
  root: string;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function assertKnownKeys(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(value).filter((key) => !allowedSet.has(key)).sort();
  if (unknown.length > 0) throw new Error(`${label} has unknown field(s): ${unknown.join(", ")}`);
}

function optionalFiniteNumber(value: unknown, label: string, options: { integer?: boolean; min?: number; max?: number } = {}): void {
  if (value === undefined) return;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${label} must be a finite number`);
  if (options.integer && !Number.isInteger(value)) throw new Error(`${label} must be an integer`);
  if (options.min !== undefined && value < options.min) throw new Error(`${label} must be >= ${options.min}`);
  if (options.max !== undefined && value > options.max) throw new Error(`${label} must be <= ${options.max}`);
}

function validateDimensions(value: unknown, label: string): void {
  if (value === undefined) return;
  const dimensions = record(value, label);
  assertKnownKeys(dimensions, ["width", "height"], label);
  optionalFiniteNumber(dimensions.width, `${label}.width`, { integer: true, min: 1 });
  optionalFiniteNumber(dimensions.height, `${label}.height`, { integer: true, min: 1 });
  if (dimensions.width === undefined && dimensions.height === undefined) throw new Error(`${label} must declare width and/or height`);
}

function validateMargins(value: unknown, label: string): void {
  if (typeof value === "number") {
    optionalFiniteNumber(value, label, { integer: true, min: 0 });
    return;
  }
  const margins = record(value, label);
  assertKnownKeys(margins, ["left", "top", "right", "bottom"], label);
  let declared = false;
  for (const edge of ["left", "top", "right", "bottom"] as const) {
    if (margins[edge] !== undefined) declared = true;
    optionalFiniteNumber(margins[edge], `${label}.${edge}`, { integer: true, min: 0 });
  }
  if (!declared) throw new Error(`${label} must declare at least one edge`);
}

function validateChecks(value: unknown, label: string): void {
  const checks = record(value, label);
  assertKnownKeys(checks, ["dimensions", "alpha", "webpEncoding"], label);
  validateDimensions(checks.dimensions, `${label}.dimensions`);
  if (checks.alpha !== undefined) {
    const alpha = record(checks.alpha, `${label}.alpha`);
    assertKnownKeys(
      alpha,
      ["threshold", "minMargins", "maxBorderPixels", "maxDarkFringePixels", "maxFringeLuma", "darkFringe", "edge"],
      `${label}.alpha`,
    );
    optionalFiniteNumber(alpha.threshold, `${label}.alpha.threshold`, { integer: true, min: 0, max: 255 });
    if (alpha.minMargins !== undefined) validateMargins(alpha.minMargins, `${label}.alpha.minMargins`);
    optionalFiniteNumber(alpha.maxBorderPixels, `${label}.alpha.maxBorderPixels`, { integer: true, min: 0 });
    optionalFiniteNumber(alpha.maxDarkFringePixels, `${label}.alpha.maxDarkFringePixels`, { integer: true, min: 0 });
    optionalFiniteNumber(alpha.maxFringeLuma, `${label}.alpha.maxFringeLuma`, { min: 0 });
    if (alpha.darkFringe !== undefined) validateDarkFringeOptions(alpha.darkFringe, `${label}.alpha.darkFringe`);
    if (alpha.edge !== undefined) validateEdgeOptions(alpha.edge, `${label}.alpha.edge`);
  }
  if (checks.webpEncoding !== undefined && checks.webpEncoding !== "lossless" && checks.webpEncoding !== "lossy") {
    throw new Error(`${label}.webpEncoding must be "lossless" or "lossy"`);
  }
  if (checks.dimensions === undefined && checks.alpha === undefined && checks.webpEncoding === undefined) {
    throw new Error(`${label} must declare at least one check`);
  }
}

function validateEdgeOptions(value: unknown, label: string): void {
  const options = record(value, label);
  assertKnownKeys(options, ["alphaThreshold", "includeOpaque", "maxRadius", "minAlpha", "minLuma", "minLumaDelta"], label);
  optionalFiniteNumber(options.alphaThreshold, `${label}.alphaThreshold`, { min: 0, max: 255 });
  if (options.includeOpaque !== undefined && typeof options.includeOpaque !== "boolean") {
    throw new Error(`${label}.includeOpaque must be a boolean`);
  }
  optionalFiniteNumber(options.maxRadius, `${label}.maxRadius`, { min: 1 });
  optionalFiniteNumber(options.minAlpha, `${label}.minAlpha`, { min: 0, max: 255 });
  optionalFiniteNumber(options.minLuma, `${label}.minLuma`, { min: 0, max: 255 });
  optionalFiniteNumber(options.minLumaDelta, `${label}.minLumaDelta`, { min: 0 });
}

function validateDarkFringeOptions(value: unknown, label: string): void {
  const options = record(value, label);
  assertKnownKeys(options, ["alphaMin", "alphaMax", "darkLumaMax", "subjectLumaMin", "maxRadius"], label);
  optionalFiniteNumber(options.alphaMin, `${label}.alphaMin`, { min: 0, max: 255 });
  optionalFiniteNumber(options.alphaMax, `${label}.alphaMax`, { min: 0, max: 255 });
  optionalFiniteNumber(options.darkLumaMax, `${label}.darkLumaMax`, { min: 0, max: 255 });
  optionalFiniteNumber(options.subjectLumaMin, `${label}.subjectLumaMin`, { min: 0, max: 255 });
  optionalFiniteNumber(options.maxRadius, `${label}.maxRadius`, { min: 1 });
  if (
    typeof options.alphaMin === "number" &&
    typeof options.alphaMax === "number" &&
    options.alphaMin > options.alphaMax
  ) {
    throw new Error(`${label}.alphaMin must be <= alphaMax`);
  }
}

function validateBounds(value: unknown, label: string): void {
  const bounds = record(value, label);
  assertKnownKeys(bounds, ["minX", "minY", "maxX", "maxY"], label);
  for (const key of ["minX", "minY", "maxX", "maxY"] as const) {
    optionalFiniteNumber(bounds[key], `${label}.${key}`, { integer: true, min: 0 });
    if (bounds[key] === undefined) throw new Error(`${label}.${key} is required`);
  }
}

function validateRepair(value: unknown, label: string): void {
  const repair = record(value, label);
  assertKnownKeys(repair, ["source", "expectedSource", "crop", "padHorizontalCells", "rematte", "output"], label);
  if (repair.source !== undefined && (typeof repair.source !== "string" || repair.source.length === 0)) {
    throw new Error(`${label}.source must be a non-empty relative path`);
  }
  validateDimensions(repair.expectedSource, `${label}.expectedSource`);
  if (repair.expectedSource !== undefined) {
    const expected = record(repair.expectedSource, `${label}.expectedSource`);
    if (expected.width === undefined || expected.height === undefined) throw new Error(`${label}.expectedSource requires width and height`);
  }
  if (repair.crop !== undefined) {
    const crop = record(repair.crop, `${label}.crop`);
    assertKnownKeys(crop, ["bounds", "alpha", "padding", "alphaThreshold"], `${label}.crop`);
    if ((crop.alpha === true) === (crop.bounds !== undefined)) {
      throw new Error(`${label}.crop must declare exactly one of alpha: true or bounds`);
    }
    if (crop.bounds !== undefined) validateBounds(crop.bounds, `${label}.crop.bounds`);
    optionalFiniteNumber(crop.padding, `${label}.crop.padding`, { integer: true, min: 0 });
    optionalFiniteNumber(crop.alphaThreshold, `${label}.crop.alphaThreshold`, { integer: true, min: 0, max: 255 });
  }
  if (repair.padHorizontalCells !== undefined) {
    const padding = record(repair.padHorizontalCells, `${label}.padHorizontalCells`);
    assertKnownKeys(padding, ["columns", "padding", "targetCellWidth", "targetHeight"], `${label}.padHorizontalCells`);
    optionalFiniteNumber(padding.columns, `${label}.padHorizontalCells.columns`, { integer: true, min: 1 });
    if (padding.columns === undefined) throw new Error(`${label}.padHorizontalCells.columns is required`);
    optionalFiniteNumber(padding.targetCellWidth, `${label}.padHorizontalCells.targetCellWidth`, { integer: true, min: 1 });
    optionalFiniteNumber(padding.targetHeight, `${label}.padHorizontalCells.targetHeight`, { integer: true, min: 1 });
    if (padding.padding !== undefined) {
      const edges = record(padding.padding, `${label}.padHorizontalCells.padding`);
      assertKnownKeys(edges, ["left", "top", "right", "bottom"], `${label}.padHorizontalCells.padding`);
      for (const edge of ["left", "top", "right", "bottom"] as const) {
        optionalFiniteNumber(edges[edge], `${label}.padHorizontalCells.padding.${edge}`, { integer: true, min: 0 });
      }
    }
  }
  if (repair.rematte !== undefined) {
    const rematte = record(repair.rematte, `${label}.rematte`);
    assertKnownKeys(rematte, ["mode", "maxPasses", "options"], `${label}.rematte`);
    if (rematte.mode !== "dark-edge" && rematte.mode !== "dark-fringe") {
      throw new Error(`${label}.rematte.mode must be "dark-edge" or "dark-fringe"`);
    }
    optionalFiniteNumber(rematte.maxPasses, `${label}.rematte.maxPasses`, { integer: true, min: 1 });
    if (rematte.options !== undefined) {
      if (rematte.mode === "dark-edge") validateEdgeOptions(rematte.options, `${label}.rematte.options`);
      else validateDarkFringeOptions(rematte.options, `${label}.rematte.options`);
    }
  }
  const output = record(repair.output, `${label}.output`);
  assertKnownKeys(output, ["format", "lossless", "quality", "method", "exact"], `${label}.output`);
  if (output.format !== "webp") throw new Error(`${label}.output.format must be "webp"`);
  if (typeof output.lossless !== "boolean") throw new Error(`${label}.output.lossless must be a boolean`);
  optionalFiniteNumber(output.quality, `${label}.output.quality`, { min: 0, max: 100 });
  optionalFiniteNumber(output.method, `${label}.output.method`, { integer: true, min: 0, max: 6 });
  if (output.exact !== undefined && typeof output.exact !== "boolean") throw new Error(`${label}.output.exact must be a boolean`);
}

export function parseAssetQaManifest(value: unknown): AssetQaManifest {
  const manifest = record(value, "asset QA manifest");
  assertKnownKeys(manifest, ["$schema", "schemaVersion", "root", "targets"], "asset QA manifest");
  if (manifest.schemaVersion !== 1) throw new Error(`asset QA manifest schemaVersion must be 1`);
  if (manifest.root !== undefined && (typeof manifest.root !== "string" || manifest.root.length === 0)) {
    throw new Error(`asset QA manifest root must be a non-empty string`);
  }
  if (!Array.isArray(manifest.targets) || manifest.targets.length === 0) {
    throw new Error(`asset QA manifest targets must be a non-empty array`);
  }
  const ids = new Set<string>();
  manifest.targets.forEach((targetValue, index) => {
    const label = `asset QA manifest targets[${index}]`;
    const target = record(targetValue, label);
    assertKnownKeys(target, ["id", "path", "checks", "repair"], label);
    if (typeof target.id !== "string" || !/^[A-Za-z0-9._-]+$/.test(target.id)) {
      throw new Error(`${label}.id must contain only letters, digits, dot, underscore, and hyphen`);
    }
    if (ids.has(target.id)) throw new Error(`${label}.id duplicates ${JSON.stringify(target.id)}`);
    ids.add(target.id);
    if (typeof target.path !== "string" || target.path.length === 0) throw new Error(`${label}.path must be a non-empty relative path`);
    validateChecks(target.checks, `${label}.checks`);
    if (target.repair !== undefined) validateRepair(target.repair, `${label}.repair`);
  });
  return value as AssetQaManifest;
}

async function loadManifest(options: AssetQaRunOptions): Promise<LoadedManifest> {
  const manifestPath = resolve(options.manifestPath);
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(manifestPath, "utf8")) as unknown;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`could not read asset QA manifest ${manifestPath}: ${detail}`);
  }
  const manifest = parseAssetQaManifest(parsed);
  const root = options.root ? resolve(options.root) : resolve(dirname(manifestPath), manifest.root ?? ".");
  // Resolve every declared path before any check or repair so an unsafe later
  // target cannot partially mutate earlier targets.
  for (const target of manifest.targets) {
    resolveWithinRoot(root, target.path);
    if (target.repair?.source) resolveWithinRoot(root, target.repair.source);
  }
  return { manifest, manifestPath, root };
}

export function resolveWithinRoot(root: string, declaredPath: string): string {
  if (isAbsolute(declaredPath)) throw new Error(`asset QA path must be relative to the manifest root: ${declaredPath}`);
  const resolved = resolve(root, declaredPath);
  const fromRoot = relative(root, resolved);
  if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
    throw new Error(`asset QA path escapes the manifest root: ${declaredPath}`);
  }
  return resolved;
}

function sortedTargets(manifest: AssetQaManifest, targetIds: readonly string[] | undefined): AssetQaTarget[] {
  const requested = targetIds && targetIds.length > 0 ? new Set(targetIds) : null;
  if (requested) {
    const known = new Set(manifest.targets.map((target) => target.id));
    const unknown = [...requested].filter((id) => !known.has(id)).sort();
    if (unknown.length > 0) throw new Error(`unknown asset QA target id(s): ${unknown.join(", ")}`);
  }
  return manifest.targets
    .filter((target) => !requested || requested.has(target.id))
    .sort((left, right) => left.id.localeCompare(right.id) || left.path.localeCompare(right.path));
}

function requiredMargins(check: AssetQaAlphaCheck): Partial<AlphaMargins> | null {
  if (check.minMargins === undefined) return null;
  if (typeof check.minMargins === "number") {
    return { left: check.minMargins, top: check.minMargins, right: check.minMargins, bottom: check.minMargins };
  }
  return check.minMargins;
}

async function metricsForTarget(path: string, checks: AssetQaChecks): Promise<AssetQaTargetMetrics> {
  const [raw, image] = await Promise.all([readFile(path), decodeImageFile(path)]);
  const alphaCheck = checks.alpha;
  const threshold = alphaCheck?.threshold ?? 0;
  const bounds = alphaBounds(image, threshold);
  const fringe = measureDarkFringe(image, alphaCheck?.darkFringe);
  return {
    width: image.width,
    height: image.height,
    bytes: raw.length,
    alpha: {
      bounds,
      margins: alphaMargins(bounds, image.width, image.height),
      borderPixels: countBorderAlphaPixels(image, threshold),
      semiTransparentPixels: fringe.semiTransparentPixels,
      darkFringePixels: fringe.darkFringePixels,
      edge: edgeQualityMetrics(image, alphaCheck?.edge),
    },
    webpEncoding: extname(path).toLowerCase() === ".webp" ? webpEncodingKind(raw) : "unknown",
  };
}

function diagnosticsFor(checks: AssetQaChecks, metrics: AssetQaTargetMetrics): AssetQaDiagnostic[] {
  const diagnostics: AssetQaDiagnostic[] = [];
  if (checks.dimensions?.width !== undefined && metrics.width !== checks.dimensions.width) {
    diagnostics.push({
      code: "width-mismatch",
      message: `width is ${metrics.width}px; expected ${checks.dimensions.width}px`,
      actual: metrics.width,
      expected: checks.dimensions.width,
    });
  }
  if (checks.dimensions?.height !== undefined && metrics.height !== checks.dimensions.height) {
    diagnostics.push({
      code: "height-mismatch",
      message: `height is ${metrics.height}px; expected ${checks.dimensions.height}px`,
      actual: metrics.height,
      expected: checks.dimensions.height,
    });
  }
  const alphaCheck = checks.alpha;
  if (alphaCheck) {
    const minimum = requiredMargins(alphaCheck);
    if (minimum) {
      if (!metrics.alpha.margins) {
        diagnostics.push({
          code: "alpha-empty",
          message: "image has no pixels above the configured alpha threshold; margins cannot be measured",
          actual: null,
          expected: minimum,
        });
      } else {
        for (const edge of ["left", "top", "right", "bottom"] as const) {
          const expected = minimum[edge];
          if (expected !== undefined && metrics.alpha.margins[edge] < expected) {
            diagnostics.push({
              code: `alpha-margin-${edge}`,
              message: `${edge} alpha margin is ${metrics.alpha.margins[edge]}px; expected at least ${expected}px`,
              actual: metrics.alpha.margins[edge],
              expected,
            });
          }
        }
      }
    }
    if (alphaCheck.maxBorderPixels !== undefined && metrics.alpha.borderPixels > alphaCheck.maxBorderPixels) {
      diagnostics.push({
        code: "alpha-border-pixels",
        message: `${metrics.alpha.borderPixels} visible pixel(s) touch the canvas border; maximum is ${alphaCheck.maxBorderPixels}`,
        actual: metrics.alpha.borderPixels,
        expected: alphaCheck.maxBorderPixels,
      });
    }
    if (alphaCheck.maxDarkFringePixels !== undefined && metrics.alpha.darkFringePixels > alphaCheck.maxDarkFringePixels) {
      diagnostics.push({
        code: "dark-alpha-fringe",
        message: `${metrics.alpha.darkFringePixels} dark fringe pixel(s) remain; maximum is ${alphaCheck.maxDarkFringePixels}`,
        actual: metrics.alpha.darkFringePixels,
        expected: alphaCheck.maxDarkFringePixels,
      });
    }
    if (alphaCheck.maxFringeLuma !== undefined && metrics.alpha.edge.fringeLuma > alphaCheck.maxFringeLuma) {
      diagnostics.push({
        code: "edge-luma-fringe",
        message: `inner/edge luma delta is ${metrics.alpha.edge.fringeLuma.toFixed(2)}; maximum is ${alphaCheck.maxFringeLuma}`,
        actual: Number(metrics.alpha.edge.fringeLuma.toFixed(4)),
        expected: alphaCheck.maxFringeLuma,
      });
    }
  }
  if (checks.webpEncoding !== undefined && metrics.webpEncoding !== checks.webpEncoding) {
    diagnostics.push({
      code: "webp-encoding",
      message: `WebP encoding is ${metrics.webpEncoding}; expected ${checks.webpEncoding}`,
      actual: metrics.webpEncoding,
      expected: checks.webpEncoding,
    });
  }
  return diagnostics;
}

async function inspectTarget(root: string, target: AssetQaTarget): Promise<AssetQaTargetReport> {
  const path = resolveWithinRoot(root, target.path);
  try {
    const metrics = await metricsForTarget(path, target.checks);
    const diagnostics = diagnosticsFor(target.checks, metrics);
    return { id: target.id, path: target.path, ok: diagnostics.length === 0, metrics, diagnostics };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      id: target.id,
      path: target.path,
      ok: false,
      metrics: null,
      diagnostics: [{ code: "target-unreadable", message: `could not inspect ${target.path}: ${detail}` }],
    };
  }
}

export async function runAssetQaCheck(options: AssetQaRunOptions): Promise<AssetQaCheckReport> {
  const loaded = await loadManifest(options);
  const targets: AssetQaTargetReport[] = [];
  for (const target of sortedTargets(loaded.manifest, options.targetIds)) {
    targets.push(await inspectTarget(loaded.root, target));
  }
  return {
    schemaVersion: 1,
    command: "check",
    ok: targets.every((target) => target.ok),
    manifest: loaded.manifestPath,
    root: loaded.root,
    targets,
  };
}

async function readExisting(path: string): Promise<Buffer | null> {
  try {
    return await readFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function assertExpectedSource(image: RgbaImage, repair: AssetQaRepair, source: string): void {
  if (!repair.expectedSource) return;
  if (image.width !== repair.expectedSource.width || image.height !== repair.expectedSource.height) {
    throw new Error(
      `${source}: source is ${image.width}x${image.height}; expected ${repair.expectedSource.width}x${repair.expectedSource.height}`,
    );
  }
}

async function repairTarget(root: string, target: AssetQaTarget): Promise<AssetQaMutationTargetReport> {
  const repair = target.repair;
  if (!repair) throw new Error(`asset QA target ${target.id} has checks but no repair declaration`);
  const source = repair.source ?? target.path;
  const sourcePath = resolveWithinRoot(root, source);
  const targetPath = resolveWithinRoot(root, target.path);
  let image = await decodeImageFile(sourcePath);
  assertExpectedSource(image, repair, source);
  const operations: string[] = [];

  if (repair.crop) {
    const detected = repair.crop.alpha ? alphaBounds(image, repair.crop.alphaThreshold ?? 0) : null;
    const declared = repair.crop.bounds ?? detected;
    const crop = cropForBounds(declared, image.width, image.height, repair.crop.padding ?? 0);
    image = copyRgbaCrop(image, crop);
    operations.push(`crop(${crop.x},${crop.y},${crop.width}x${crop.height})`);
  }
  if (repair.padHorizontalCells) {
    const padded = padHorizontalCells(image, repair.padHorizontalCells);
    image = { data: padded.data, width: padded.width, height: padded.height };
    operations.push(`pad-horizontal-cells(${repair.padHorizontalCells.columns})`);
  }

  let remattedPixels = 0;
  let clearedPixels = 0;
  let passes = 0;
  if (repair.rematte) {
    const maximum = repair.rematte.maxPasses ?? (repair.rematte.mode === "dark-edge" ? 12 : 2);
    let changed = 0;
    do {
      passes += 1;
      if (repair.rematte.mode === "dark-edge") {
        changed = rematteDarkEdgePixels(image, repair.rematte.options);
        remattedPixels += changed;
      } else {
        const result = rematteDarkFringe(image, repair.rematte.options);
        changed = result.changedPixels;
        remattedPixels += result.remattedPixels;
        clearedPixels += result.clearedPixels;
      }
    } while (changed > 0 && passes < maximum);
    if (changed > 0) throw new Error(`${target.id}: ${repair.rematte.mode} rematte did not converge after ${passes} passes`);
    operations.push(`rematte-${repair.rematte.mode}`);
  }

  const encoded = await encodeWebp(image, repair.output);
  operations.push(repair.output.lossless ? "encode-webp-lossless" : `encode-webp-lossy(q=${repair.output.quality ?? 92})`);
  const existing = await readExisting(targetPath);
  const changed = existing === null || !existing.equals(encoded);
  if (changed) await writeFileAtomic(targetPath, encoded);
  const validation = await inspectTarget(root, target);
  return {
    id: target.id,
    path: target.path,
    source,
    changed,
    operations,
    remattedPixels,
    clearedPixels,
    passes,
    validation,
  };
}

export async function runAssetQaRepair(options: AssetQaRunOptions): Promise<AssetQaRepairReport> {
  const loaded = await loadManifest(options);
  const selected = sortedTargets(loaded.manifest, options.targetIds);
  const targetsWithRepair = selected.filter((target) => target.repair !== undefined);
  if (options.targetIds && options.targetIds.length > 0 && targetsWithRepair.length !== selected.length) {
    const missing = selected.filter((target) => target.repair === undefined).map((target) => target.id);
    throw new Error(`selected asset QA target(s) have no repair declaration: ${missing.join(", ")}`);
  }
  if (targetsWithRepair.length === 0) throw new Error("asset QA manifest has no repair declarations");

  const targets: AssetQaMutationTargetReport[] = [];
  for (const target of targetsWithRepair) targets.push(await repairTarget(loaded.root, target));
  return {
    schemaVersion: 1,
    command: "repair",
    ok: targets.every((target) => target.validation.ok),
    manifest: loaded.manifestPath,
    root: loaded.root,
    targets,
  };
}
