import {
  analyzeHorizontalSheet,
  formatAnalysisReport,
  type AnalyzeSheetOptions,
  type SheetAnchorMode,
  type SheetAnalysisReport,
} from "../sheet-normalize.ts";
import { flag, has, intFlag } from "./args.ts";

export interface CheckSheetsReport {
  ok: boolean;
  reports: SheetAnalysisReport[];
}

export async function runCheckSheetsCommand(argv: string[]): Promise<void> {
  const inputs = collectInputs(argv);
  const columns = intFlag(argv, "columns", 0);

  if (inputs.length === 0 || columns <= 0) {
    console.error(usage());
    process.exit(1);
  }

  const options = optionsFromFlags(argv, columns);
  const reports = await Promise.all(inputs.map((input) => analyzeHorizontalSheet(input, options)));
  const result: CheckSheetsReport = { ok: reports.every((report) => report.ok), reports };

  if (has(argv, "json")) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(reports.map((report) => formatAnalysisReport(report)).join("\n"));
  }

  if (!result.ok) process.exit(1);
}

function collectInputs(argv: string[]): string[] {
  const inputs: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token !== "--in") continue;
    index += 1;
    while (index < argv.length) {
      const value = argv[index];
      if (!value || value.startsWith("--")) {
        index -= 1;
        break;
      }
      inputs.push(value);
      index += 1;
    }
  }
  return inputs;
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

function anchorFromFlag(raw: string | undefined): SheetAnchorMode {
  if (!raw || raw === "center") return "center";
  throw new Error(`Unsupported --anchor ${raw}; v1 supports "center"`);
}

function numberFlag(argv: string[], name: string, fallback: number): number {
  const raw = flag(argv, name);
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new Error(`--${name} must be a non-negative number`);
  return n;
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
    "  assetgen check-sheets --in <sheet.png|webp> [...more sheets] --columns <n> [options]",
    "",
    "Options:",
    "  --cell-size <WxH>           Required canonical cell size; sheet must be columns*W by H",
    "  --cell-width <px>           Required canonical cell width, alternative to --cell-size",
    "  --cell-height <px>          Required canonical cell height, alternative to --cell-size",
    "  --padding <px>              Required transparent inset. Default: 0",
    "  --anchor center             Visual anchor mode. Default: center",
    "  --max-center-drift <px>     Allowed visual-center drift. Default: 1",
    "  --max-bounds-delta <px>     Allowed bounds width/height delta from sheet reference. Default: 2",
    "  --max-aspect-delta <n>      Allowed aspect delta from sheet reference. Default: 0.05",
    "  --alpha-threshold <0-254>   Alpha values <= threshold are treated as transparent. Default: 0",
    "  --json                      Print the machine-readable report",
  ].join("\n");
}
