import { mkdir } from "node:fs/promises";
import { dirname, extname } from "node:path";
import sharp from "sharp";

const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

export type SheetAnchorMode = "center";

export type SheetViolationCode =
  | "invalid-geometry"
  | "dimension-mismatch"
  | "invalid-padding"
  | "missing-alpha"
  | "blank-cell"
  | "clipped-cell"
  | "padding-underflow"
  | "center-drift"
  | "bounds-delta"
  | "aspect-delta";

export interface SheetViolation {
  code: SheetViolationCode;
  message: string;
  cell?: number;
  value?: number;
  limit?: number;
}

export interface SheetCellRect {
  index: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface VisibleBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface BoundsMetrics extends VisibleBounds {
  centerX: number;
  centerY: number;
  centerDx: number;
  centerDy: number;
  centerDrift: number;
  aspect: number;
}

export interface SheetReference {
  width: number;
  height: number;
  aspect: number;
}

export interface SheetCellAnalysis {
  index: number;
  rect: SheetCellRect;
  bounds: BoundsMetrics | null;
  boundsDelta: number | null;
  aspectDelta: number | null;
  violations: SheetViolation[];
}

export interface SheetAnalysisReport {
  ok: boolean;
  source: string;
  width: number;
  height: number;
  columns: number;
  cellWidth: number;
  cellHeight: number;
  anchor: SheetAnchorMode;
  padding: number;
  alphaThreshold: number;
  maxCenterDrift: number;
  maxBoundsDelta: number;
  maxAspectDelta: number;
  expectedCellWidth?: number;
  expectedCellHeight?: number;
  expectedWidth?: number;
  expectedHeight?: number;
  hasAlpha: boolean;
  reference: SheetReference | null;
  cells: SheetCellAnalysis[];
  violations: SheetViolation[];
}

export interface AnalyzeSheetOptions {
  columns: number;
  anchor?: SheetAnchorMode;
  padding?: number;
  alphaThreshold?: number;
  maxCenterDrift?: number;
  maxBoundsDelta?: number;
  maxAspectDelta?: number;
  cellWidth?: number;
  cellHeight?: number;
}

export interface NormalizeSheetOptions extends AnalyzeSheetOptions {
  dryRun?: boolean;
}

export interface NormalizeCellReport {
  index: number;
  before: SheetCellAnalysis | null;
  after: SheetCellAnalysis | null;
  changed: boolean;
  warnings: SheetViolation[];
}

export interface NormalizeSheetReport {
  ok: boolean;
  input: string;
  output: string;
  dryRun: boolean;
  wrote: boolean;
  before: SheetAnalysisReport;
  after: SheetAnalysisReport | null;
  cells: NormalizeCellReport[];
  violations: SheetViolation[];
}

interface LoadedSheet {
  source: string;
  data: Buffer;
  width: number;
  height: number;
  channels: number;
  hasAlpha: boolean;
}

interface ResolvedAnalyzeOptions {
  columns: number;
  anchor: SheetAnchorMode;
  padding: number;
  alphaThreshold: number;
  maxCenterDrift: number;
  maxBoundsDelta: number;
  maxAspectDelta: number;
  cellWidth?: number;
  cellHeight?: number;
}

export function resolveSheetOptions(options: AnalyzeSheetOptions): ResolvedAnalyzeOptions {
  const resolved: ResolvedAnalyzeOptions = {
    columns: Math.floor(options.columns),
    anchor: options.anchor ?? "center",
    padding: clampNumber(options.padding ?? 0, 0, Number.POSITIVE_INFINITY),
    alphaThreshold: clampNumber(options.alphaThreshold ?? 0, 0, 254),
    maxCenterDrift: clampNumber(options.maxCenterDrift ?? 1, 0, Number.POSITIVE_INFINITY),
    maxBoundsDelta: clampNumber(options.maxBoundsDelta ?? 2, 0, Number.POSITIVE_INFINITY),
    maxAspectDelta: clampNumber(options.maxAspectDelta ?? 0.05, 0, Number.POSITIVE_INFINITY),
  };
  if (options.cellWidth !== undefined) resolved.cellWidth = Math.floor(options.cellWidth);
  if (options.cellHeight !== undefined) resolved.cellHeight = Math.floor(options.cellHeight);
  return resolved;
}

export function validateHorizontalSheetGeometry(width: number, height: number, columns: number): SheetViolation | null {
  if (!Number.isInteger(columns) || columns <= 0) {
    return { code: "invalid-geometry", message: `--columns must be a positive integer, got ${columns}` };
  }
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    return { code: "invalid-geometry", message: `sheet dimensions must be positive integers, got ${width}x${height}` };
  }
  if (width % columns !== 0) {
    return {
      code: "invalid-geometry",
      message: `sheet width ${width}px is not divisible by ${columns} column(s)`,
    };
  }
  return null;
}

export function splitHorizontalSheet(width: number, height: number, columns: number): SheetCellRect[] {
  const violation = validateHorizontalSheetGeometry(width, height, columns);
  if (violation) throw new Error(violation.message);
  const cellWidth = width / columns;
  return Array.from({ length: columns }, (_unused, index) => ({
    index,
    left: index * cellWidth,
    top: 0,
    width: cellWidth,
    height,
  }));
}

export function splitHorizontalSheetProportional(width: number, height: number, columns: number): SheetCellRect[] {
  if (!Number.isInteger(columns) || columns <= 0) throw new Error(`--columns must be a positive integer, got ${columns}`);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error(`sheet dimensions must be positive integers, got ${width}x${height}`);
  }
  return Array.from({ length: columns }, (_unused, index) => {
    const left = Math.round((index * width) / columns);
    const right = Math.round(((index + 1) * width) / columns);
    return {
      index,
      left,
      top: 0,
      width: Math.max(1, right - left),
      height,
    };
  });
}

export function detectAlphaBounds(
  data: Uint8Array,
  imageWidth: number,
  rect: Omit<SheetCellRect, "index">,
  channels = 4,
  alphaThreshold = 0,
): VisibleBounds | null {
  let left = rect.width;
  let top = rect.height;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < rect.height; y += 1) {
    const sourceY = rect.top + y;
    for (let x = 0; x < rect.width; x += 1) {
      const sourceX = rect.left + x;
      const offset = (sourceY * imageWidth + sourceX) * channels + channels - 1;
      const alpha = data[offset] ?? 0;
      if (alpha <= alphaThreshold) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }

  if (right < left || bottom < top) return null;
  return {
    left,
    top,
    right,
    bottom,
    width: right - left + 1,
    height: bottom - top + 1,
  };
}

export async function analyzeHorizontalSheet(inputPath: string, options: AnalyzeSheetOptions): Promise<SheetAnalysisReport> {
  const loaded = await loadSheet(inputPath);
  return buildAnalysisReport(loaded, resolveSheetOptions(options));
}

export async function normalizeHorizontalSheet(
  inputPath: string,
  outputPath: string,
  options: NormalizeSheetOptions,
): Promise<NormalizeSheetReport> {
  const resolved = resolveSheetOptions(options);
  const loaded = await loadSheet(inputPath);
  const hasCanonicalSize = resolved.cellWidth !== undefined && resolved.cellHeight !== undefined;
  const before = buildAnalysisReport(loaded, resolved, hasCanonicalSize ? "proportional" : "strict");
  const fatal = before.violations.filter((violation) => isNormalizeFatal(violation, hasCanonicalSize, before.cells.length === resolved.columns));

  if (fatal.length > 0) {
    return {
      ok: false,
      input: inputPath,
      output: outputPath,
      dryRun: Boolean(options.dryRun),
      wrote: false,
      before,
      after: null,
      cells: before.cells.map((cell) => ({
        index: cell.index,
        before: cell,
        after: null,
        changed: false,
        warnings: cell.violations,
      })),
      violations: fatal,
    };
  }

  const outputBuffer = await buildNormalizedSheetBuffer(inputPath, before, resolved);
  const outputRaw = await sharp(outputBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const after = buildAnalysisReport(
    {
      source: outputPath,
      data: Buffer.from(outputRaw.data),
      width: outputRaw.info.width,
      height: outputRaw.info.height,
      channels: outputRaw.info.channels,
      hasAlpha: true,
    },
    resolved,
  );

  if (!options.dryRun) {
    await writeEncodedSheet(outputBuffer, outputPath);
  }

  const cells = before.cells.map((beforeCell) => {
    const afterCell = after.cells[beforeCell.index] ?? null;
    return {
      index: beforeCell.index,
      before: beforeCell,
      after: afterCell,
      changed: !sameBounds(beforeCell.bounds, afterCell?.bounds ?? null),
      warnings: beforeCell.violations.filter((violation) => violation.code !== "center-drift" && violation.code !== "bounds-delta" && violation.code !== "aspect-delta"),
    };
  });

  return {
    ok: after.ok,
    input: inputPath,
    output: outputPath,
    dryRun: Boolean(options.dryRun),
    wrote: !options.dryRun,
    before,
    after,
    cells,
    violations: after.violations,
  };
}

export function formatAnalysisReport(report: SheetAnalysisReport, prefix = "check-sheets"): string {
  const lines: string[] = [];
  const id = `${report.source} (${report.width}x${report.height}, ${report.columns} column${report.columns === 1 ? "" : "s"})`;

  if (report.ok) {
    lines.push(`[${prefix}] ok ${id}`);
  } else {
    lines.push(`[${prefix}] FAIL ${id} — ${report.violations.length} violation(s)`);
  }

  const sheetViolations = report.violations.filter((violation) => violation.cell === undefined);
  for (const violation of sheetViolations) {
    lines.push(`  - ${violation.code}: ${violation.message}`);
  }

  for (const cell of report.cells) {
    if (cell.bounds) {
      const drift = cell.bounds.centerDrift.toFixed(2);
      const bounds = `${cell.bounds.width}x${cell.bounds.height}`;
      const status = cell.violations.length ? "FAIL" : "ok";
      lines.push(`  - ${status} cell ${cell.index}: bounds ${bounds}, center drift ${drift}px`);
    } else {
      lines.push(`  - FAIL cell ${cell.index}: blank`);
    }
    for (const violation of cell.violations) {
      lines.push(`    - ${violation.code}: ${violation.message}`);
    }
  }
  return lines.join("\n");
}

export function formatNormalizeReport(report: NormalizeSheetReport): string {
  const lines: string[] = [];
  const action = report.dryRun ? "dry-run" : report.wrote ? "wrote" : "did not write";
  lines.push(
    `[normalize-sheet] ${report.ok ? "ok" : "FAIL"} ${action} ${report.output} (${report.before.width}x${report.before.height}, ${report.before.columns} column${report.before.columns === 1 ? "" : "s"})`,
  );
  if (report.after === null) {
    for (const violation of report.violations) {
      lines.push(`  - ${violation.code}: ${violation.message}`);
    }
    return lines.join("\n");
  }

  for (const cell of report.cells) {
    const before = cell.before?.bounds;
    const after = cell.after?.bounds;
    const beforeDrift = before ? `${before.centerDrift.toFixed(2)}px` : "blank";
    const afterDrift = after ? `${after.centerDrift.toFixed(2)}px` : "blank";
    const beforeSize = before ? `${before.width}x${before.height}` : "blank";
    const afterSize = after ? `${after.width}x${after.height}` : "blank";
    lines.push(`  - cell ${cell.index}: bounds ${beforeSize} -> ${afterSize}, center drift ${beforeDrift} -> ${afterDrift}`);
    for (const warning of cell.warnings) {
      lines.push(`    - input ${warning.code}: ${warning.message}`);
    }
    for (const violation of cell.after?.violations ?? []) {
      lines.push(`    - output ${violation.code}: ${violation.message}`);
    }
  }
  return lines.join("\n");
}

function buildAnalysisReport(loaded: LoadedSheet, options: ResolvedAnalyzeOptions, mode: "strict" | "proportional" = "strict"): SheetAnalysisReport {
  const violations: SheetViolation[] = [];
  const geometryViolation = validateHorizontalSheetGeometry(loaded.width, loaded.height, options.columns);
  if (geometryViolation) violations.push(geometryViolation);
  const expectedWidth = options.cellWidth === undefined ? undefined : options.cellWidth * options.columns;
  const expectedHeight = options.cellHeight;
  if (
    (expectedWidth !== undefined && loaded.width !== expectedWidth) ||
    (expectedHeight !== undefined && loaded.height !== expectedHeight)
  ) {
    violations.push({
      code: "dimension-mismatch",
      message: `sheet is ${loaded.width}x${loaded.height}; expected ${expectedWidth ?? loaded.width}x${expectedHeight ?? loaded.height} from the canonical cell size`,
    });
  }
  if (options.anchor !== "center") {
    violations.push({ code: "invalid-geometry", message: `unsupported anchor mode "${options.anchor}"` });
  }
  if (!loaded.hasAlpha) {
    violations.push({ code: "missing-alpha", message: "sheet has no alpha channel; transparent bounds cannot be trusted" });
  }

  let cellWidth = 0;
  let cellHeight = loaded.height;
  let cells: SheetCellAnalysis[] = [];

  if (!geometryViolation || mode === "proportional") {
    const rects = geometryViolation ? splitHorizontalSheetProportional(loaded.width, loaded.height, options.columns) : splitHorizontalSheet(loaded.width, loaded.height, options.columns);
    cellWidth = geometryViolation ? 0 : rects[0]?.width ?? 0;
    cellHeight = loaded.height;
    if (rects.some((rect) => rect.width - options.padding * 2 < 1 || rect.height - options.padding * 2 < 1)) {
      violations.push({
        code: "invalid-padding",
        message: `padding ${options.padding}px leaves no drawable area in one or more cells`,
      });
    }

    cells = rects.map((rect) => {
      const bounds = detectAlphaBounds(loaded.data, loaded.width, rect, loaded.channels, options.alphaThreshold);
      const metrics = bounds ? boundsMetrics(bounds, rect) : null;
      const cellViolations: SheetViolation[] = [];
      if (!metrics) {
        cellViolations.push({ code: "blank-cell", cell: rect.index, message: `cell ${rect.index} is fully transparent` });
      } else {
        cellViolations.push(...edgeViolations(metrics, rect, options.padding, rect.index));
      }
      return {
        index: rect.index,
        rect,
        bounds: metrics,
        boundsDelta: null,
        aspectDelta: null,
        violations: cellViolations,
      };
    });

    const reference = referenceFromCells(cells);
    if (reference) {
      cells = cells.map((cell) => {
        if (!cell.bounds) return cell;
        const boundsDelta = Math.max(Math.abs(cell.bounds.width - reference.width), Math.abs(cell.bounds.height - reference.height));
        const aspectDelta = Math.abs(cell.bounds.aspect - reference.aspect);
        const cellViolations = [...cell.violations];

        if (cell.bounds.centerDrift > options.maxCenterDrift) {
          cellViolations.push({
            code: "center-drift",
            cell: cell.index,
            value: cell.bounds.centerDrift,
            limit: options.maxCenterDrift,
            message: `cell ${cell.index} visual center drifts ${cell.bounds.centerDrift.toFixed(2)}px from cell center (max ${options.maxCenterDrift}px)`,
          });
        }
        if (boundsDelta > options.maxBoundsDelta) {
          cellViolations.push({
            code: "bounds-delta",
            cell: cell.index,
            value: boundsDelta,
            limit: options.maxBoundsDelta,
            message: `cell ${cell.index} bounds differ by ${boundsDelta.toFixed(2)}px from sheet reference ${reference.width}x${reference.height} (max ${options.maxBoundsDelta}px)`,
          });
        }
        if (aspectDelta > options.maxAspectDelta) {
          cellViolations.push({
            code: "aspect-delta",
            cell: cell.index,
            value: aspectDelta,
            limit: options.maxAspectDelta,
            message: `cell ${cell.index} aspect differs by ${aspectDelta.toFixed(3)} from sheet reference ${reference.aspect.toFixed(3)} (max ${options.maxAspectDelta})`,
          });
        }

        return { ...cell, boundsDelta, aspectDelta, violations: cellViolations };
      });
    }
  }

  const reference = referenceFromCells(cells);
  const allViolations = [...violations, ...cells.flatMap((cell) => cell.violations)];
  return {
    ok: allViolations.length === 0,
    source: loaded.source,
    width: loaded.width,
    height: loaded.height,
    columns: options.columns,
    cellWidth,
    cellHeight,
    anchor: options.anchor,
    padding: options.padding,
    alphaThreshold: options.alphaThreshold,
    maxCenterDrift: options.maxCenterDrift,
    maxBoundsDelta: options.maxBoundsDelta,
    maxAspectDelta: options.maxAspectDelta,
    expectedCellWidth: options.cellWidth,
    expectedCellHeight: options.cellHeight,
    expectedWidth,
    expectedHeight,
    hasAlpha: loaded.hasAlpha,
    reference,
    cells,
    violations: allViolations,
  };
}

async function loadSheet(inputPath: string): Promise<LoadedSheet> {
  const metadata = await sharp(inputPath).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  const raw = await sharp(inputPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return {
    source: inputPath,
    data: Buffer.from(raw.data),
    width,
    height,
    channels: raw.info.channels,
    hasAlpha: metadata.hasAlpha !== false,
  };
}

async function buildNormalizedSheetBuffer(inputPath: string, before: SheetAnalysisReport, options: ResolvedAnalyzeOptions): Promise<Buffer> {
  const overlays: sharp.OverlayOptions[] = [];
  const outputCellWidth = options.cellWidth ?? before.cellWidth;
  const outputCellHeight = options.cellHeight ?? before.cellHeight;
  const outputWidth = outputCellWidth * before.columns;
  const outputHeight = outputCellHeight;
  const maxWidth = outputCellWidth - options.padding * 2;
  const maxHeight = outputCellHeight - options.padding * 2;

  for (const cell of before.cells) {
    const bounds = cell.bounds;
    if (!bounds) continue;

    const sourceCrop = await sharp(inputPath)
      .ensureAlpha()
      .extract({
        left: cell.rect.left + bounds.left,
        top: cell.rect.top + bounds.top,
        width: bounds.width,
        height: bounds.height,
      })
      .png()
      .toBuffer();

    const fit = fitWithin(bounds.width, bounds.height, maxWidth, maxHeight);
    const content =
      fit.width === bounds.width && fit.height === bounds.height
        ? sourceCrop
        : await sharp(sourceCrop)
            .resize(fit.width, fit.height, { fit: "fill", kernel: "nearest" })
            .png()
            .toBuffer();

    const left = Math.max(0, Math.min(outputCellWidth - fit.width, Math.round((outputCellWidth - fit.width) / 2)));
    const top = Math.max(0, Math.min(outputCellHeight - fit.height, Math.round((outputCellHeight - fit.height) / 2)));
    const normalizedCell = await sharp({
      create: {
        width: outputCellWidth,
        height: outputCellHeight,
        channels: 4,
        background: TRANSPARENT,
      },
    })
      .composite([{ input: content, left, top }])
      .png()
      .toBuffer();

    overlays.push({ input: normalizedCell, left: cell.index * outputCellWidth, top: 0 });
  }

  return sharp({
    create: {
      width: outputWidth,
      height: outputHeight,
      channels: 4,
      background: TRANSPARENT,
    },
  })
    .composite(overlays)
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function writeEncodedSheet(buffer: Buffer, outputPath: string): Promise<void> {
  await mkdir(dirname(outputPath), { recursive: true });
  const ext = extname(outputPath).toLowerCase();
  if (ext === ".png") {
    await sharp(buffer).png({ compressionLevel: 9 }).toFile(outputPath);
    return;
  }
  if (ext === ".webp") {
    await sharp(buffer).webp({ lossless: true, effort: 5 }).toFile(outputPath);
    return;
  }
  throw new Error(`unsupported output extension "${ext || "(none)"}"; use .png or .webp`);
}

function boundsMetrics(bounds: VisibleBounds, rect: SheetCellRect): BoundsMetrics {
  const centerX = bounds.left + bounds.width / 2;
  const centerY = bounds.top + bounds.height / 2;
  const centerDx = centerX - rect.width / 2;
  const centerDy = centerY - rect.height / 2;
  return {
    ...bounds,
    centerX,
    centerY,
    centerDx,
    centerDy,
    centerDrift: Math.hypot(centerDx, centerDy),
    aspect: bounds.width / bounds.height,
  };
}

function edgeViolations(bounds: BoundsMetrics, rect: SheetCellRect, padding: number, index: number): SheetViolation[] {
  const violations: SheetViolation[] = [];
  if (bounds.left <= 0 || bounds.top <= 0 || bounds.right >= rect.width - 1 || bounds.bottom >= rect.height - 1) {
    violations.push({
      code: "clipped-cell",
      cell: index,
      message: `cell ${index} visible bounds touch the cell edge; source may already be clipped`,
    });
    return violations;
  }
  if (
    padding > 0 &&
    (bounds.left < padding || bounds.top < padding || rect.width - 1 - bounds.right < padding || rect.height - 1 - bounds.bottom < padding)
  ) {
    violations.push({
      code: "padding-underflow",
      cell: index,
      message: `cell ${index} visible bounds do not preserve ${padding}px transparent padding`,
    });
  }
  return violations;
}

function referenceFromCells(cells: SheetCellAnalysis[]): SheetReference | null {
  const visible = cells.map((cell) => cell.bounds).filter((bounds): bounds is BoundsMetrics => bounds !== null);
  if (visible.length === 0) return null;
  return {
    width: median(visible.map((bounds) => bounds.width)),
    height: median(visible.map((bounds) => bounds.height)),
    aspect: median(visible.map((bounds) => bounds.aspect)),
  };
}

function fitWithin(width: number, height: number, maxWidth: number, maxHeight: number): { width: number; height: number } {
  if (width <= maxWidth && height <= maxHeight) return { width, height };
  const scale = Math.min(maxWidth / width, maxHeight / height);
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
  };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
  const lower = sorted[middle - 1] ?? 0;
  const upper = sorted[middle] ?? lower;
  return (lower + upper) / 2;
}

function sameBounds(a: BoundsMetrics | null, b: BoundsMetrics | null): boolean {
  if (a === null || b === null) return a === b;
  return a.left === b.left && a.top === b.top && a.right === b.right && a.bottom === b.bottom && a.width === b.width && a.height === b.height;
}

function isNormalizeFatal(violation: SheetViolation, hasCanonicalSize: boolean, hasCells: boolean): boolean {
  if (violation.code === "invalid-geometry" || violation.code === "dimension-mismatch") {
    return !hasCanonicalSize || !hasCells;
  }
  return violation.code === "invalid-padding" || violation.code === "blank-cell" || violation.code === "missing-alpha";
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}
