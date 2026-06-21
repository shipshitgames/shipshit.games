import {
  formatNormalizeReport,
  normalizeHorizontalSheet,
  type AnalyzeSheetOptions,
  type SheetAnchorMode,
} from "../sheet-normalize.ts";
import { flag, has, intFlag } from "./args.ts";

export async function runNormalizeSheetCommand(argv: string[]): Promise<void> {
  const input = flag(argv, "in");
  const output = flag(argv, "out");
  const dryRun = has(argv, "dry-run");
  const columns = intFlag(argv, "columns", 0);

  if (!input || (!output && !dryRun) || columns <= 0) {
    console.error(usage());
    process.exit(1);
  }

  const options = optionsFromFlags(argv, columns);
  const report = await normalizeHorizontalSheet(input, output ?? input, { ...options, dryRun });

  if (has(argv, "json")) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatNormalizeReport(report));
  }

  if (!report.ok) process.exit(1);
}

function optionsFromFlags(argv: string[], columns: number): AnalyzeSheetOptions {
  const cellSize = parseCellSize(flag(argv, "cell-size"));
  return {
    columns,
    anchor: anchorFromFlag(flag(argv, "anchor")),
    padding: numberFlag(argv, "padding", 0),
    alphaThreshold: numberFlag(argv, "alpha-threshold", 0),
    maxCenterDrift: numberFlag(argv, "max-center-drift", 1),
    maxBoundsDelta: numberFlag(argv, "max-bounds-delta", 2),
    maxAspectDelta: numberFlag(argv, "max-aspect-delta", 0.05),
    cellWidth: intFlag(argv, "cell-width", cellSize?.[0] ?? 0) || undefined,
    cellHeight: intFlag(argv, "cell-height", cellSize?.[1] ?? 0) || undefined,
  };
}

function numberFlag(argv: string[], name: string, fallback: number): number {
  const raw = flag(argv, name);
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new Error(`--${name} must be a non-negative number`);
  return n;
}

function anchorFromFlag(raw: string | undefined): SheetAnchorMode {
  if (!raw || raw === "center") return "center";
  throw new Error(`Unsupported --anchor ${raw}; v1 supports "center"`);
}

function parseCellSize(raw: string | undefined): [number, number] | undefined {
  if (!raw) return undefined;
  const [widthRaw, heightRaw] = raw.toLowerCase().split("x");
  const width = Number(widthRaw);
  const height = Number(heightRaw);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error(`--cell-size must be formatted as <width>x<height>, got ${raw}`);
  }
  return [width, height];
}

function usage(): string {
  return [
    "Usage:",
    "  assetgen normalize-sheet --in <sheet.png|webp> --out <sheet.png|webp> --columns <n> [options]",
    "",
    "Options:",
    "  --cell-size <WxH>           Canonical output cell size; output becomes columns*W by H",
    "  --cell-width <px>           Canonical output cell width, alternative to --cell-size",
    "  --cell-height <px>          Canonical output cell height, alternative to --cell-size",
    "  --padding <px>              Keep this transparent inset; oversized cells are scaled down to fit. Default: 0",
    "  --anchor center             Visual anchor mode. Default: center",
    "  --max-center-drift <px>     Output drift tolerance for the report. Default: 1",
    "  --max-bounds-delta <px>     Output bounds-size tolerance. Default: 2",
    "  --max-aspect-delta <n>      Output aspect tolerance. Default: 0.05",
    "  --alpha-threshold <0-254>   Alpha values <= threshold are treated as transparent. Default: 0",
    "  --dry-run                   Build and report the normalized sheet without writing --out",
    "  --json                      Print the machine-readable before/after report",
  ].join("\n");
}
