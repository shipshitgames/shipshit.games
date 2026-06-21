import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

import {
  countVisibleKeyPixels,
  dominantMatteColor,
  extractWithKey,
  floodKeyFromEdges,
  DEFAULT_HALO,
  DEFAULT_TOLERANCE,
} from "../chroma-key.ts";
import {
  hexToRgb,
  KEY_CANDIDATES,
  KEY_SAFE_MIN_DISTANCE,
  rgbToHex,
  validateKeyColor,
  type KeySelection,
} from "../key-color.ts";
import { DOOM_RAMP, resolvePaletteByName } from "../pixelize.ts";
import { flag, has, intFlag } from "./args.ts";

/**
 * `assetgen palette-extract` (issue #115) — palette-aware sprite extraction.
 *
 * The matte a sprite is keyed on must sit OUTSIDE the subject palette, or
 * extraction leaves key residue and bleeds the key colour back into the art (the
 * winged-host violet-on-magenta failure). This command makes that a first-class,
 * checkable step:
 *
 *   --check : detect the matte (or the given --key), validate it is out of the
 *             subject palette, and flag residual key pixels / subject collisions.
 *             Exits non-zero on any violation. (acceptance: fails on an unsafe
 *             magenta matte under a violet palette; passes on a green one.)
 *   extract : pick a safe out-of-palette key, key the matte out with the full
 *             guardrail chain, write the WebP plus an `<out>.key.json` sidecar
 *             recording the selected key colour AND why it was selected.
 */
export async function runPaletteExtractCommand(argv: string[]): Promise<void> {
  const inPath = flag(argv, "in");
  const check = has(argv, "check");
  const json = has(argv, "json");

  if (!inPath) {
    printUsage();
    process.exit(1);
  }
  if (!existsSync(inPath)) {
    console.error(`[palette-extract] input not found: ${inPath}`);
    process.exit(1);
  }

  const palette = resolvePalette(argv);
  const minDistance = intFlag(argv, "min-distance", KEY_SAFE_MIN_DISTANCE);
  const tolerance = intFlag(argv, "tolerance", DEFAULT_TOLERANCE);
  const halo = intFlag(argv, "halo", DEFAULT_HALO);
  const keyArg = flag(argv, "key"); // hex / candidate name / "auto" / undefined
  const explicitKeyHex = resolveKeyArg(keyArg);

  if (check) {
    await runCheck({ inPath, palette, minDistance, tolerance, explicitKeyHex, json });
    return;
  }

  const outPath = flag(argv, "out");
  if (!outPath) {
    console.error("[palette-extract] --out <file> is required when not running --check");
    process.exit(1);
  }
  await runExtract({
    inPath,
    outPath,
    palette,
    minDistance,
    tolerance,
    halo,
    explicitKeyHex,
    size: flag(argv, "size") !== undefined ? intFlag(argv, "size", 0) : undefined,
    hardAlpha: has(argv, "hard-alpha"),
    force: has(argv, "force"),
    json,
  });
}

interface CheckViolation {
  code: "unsafe-key" | "residual-key";
  message: string;
}

async function runCheck(opts: {
  inPath: string;
  palette: string[];
  minDistance: number;
  tolerance: number;
  explicitKeyHex?: string;
  json: boolean;
}): Promise<void> {
  const { data, info } = await sharp(opts.inPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const buf = new Uint8Array(data);
  const { width, height } = info;

  const matte = dominantMatteColor(buf, width, height);
  const keyHex = opts.explicitKeyHex ?? matte.hex;
  const keyRgb = hexToRgb(keyHex);

  const safety = validateKeyColor({ keyHex, palette: opts.palette, minDistance: opts.minDistance });

  // Separate the edge-connected matte from the subject, then count any key-
  // coloured pixels left INSIDE the silhouette — true residue/holes, excluding
  // the matte we just removed (so a clean out-of-palette matte reports zero).
  floodKeyFromEdges(buf, width, height, keyRgb, { tolerance: opts.tolerance });
  const residual = countVisibleKeyPixels(buf, width, height, keyRgb, { tolerance: opts.tolerance });

  const violations: CheckViolation[] = [];
  // No matte to validate when the border is overwhelmingly transparent and the
  // key was auto-detected (already-extracted image) — safety is then vacuous.
  const hasMatte = opts.explicitKeyHex !== undefined || matte.transparentShare < 0.9;
  if (hasMatte && !safety.ok) {
    violations.push({ code: "unsafe-key", message: safety.reason });
  }
  if (residual > 0) {
    violations.push({
      code: "residual-key",
      message: `${residual} key-coloured pixel(s) survive inside the subject after edge keying ${keyHex} (within ${opts.tolerance}) — residue/holes would ship`,
    });
  }

  const ok = violations.length === 0;
  const report = {
    ok,
    input: opts.inPath,
    matte: { hex: matte.hex, share: round(matte.share), transparentShare: round(matte.transparentShare) },
    key: keyHex,
    keySource: opts.explicitKeyHex ? "explicit" : "detected",
    safety: { ok: safety.ok, nearestHex: safety.nearestHex, distance: round(safety.distance), minDistance: safety.minDistance },
    residual,
    violations,
  };

  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
  } else if (ok) {
    console.log(`[palette-extract] OK ${opts.inPath}: key ${keyHex} is out of palette (${safety.reason})`);
  } else {
    console.log(`[palette-extract] FAIL ${opts.inPath}`);
    for (const v of violations) console.log(`  - ${v.code}: ${v.message}`);
  }

  if (!ok) {
    if (!opts.json) console.error(`[palette-extract] ${violations.length} violation(s) — matte is not palette-safe`);
    process.exit(1);
  }
}

async function runExtract(opts: {
  inPath: string;
  outPath: string;
  palette: string[];
  minDistance: number;
  tolerance: number;
  halo: number;
  explicitKeyHex?: string;
  size?: number;
  hardAlpha: boolean;
  force: boolean;
  json: boolean;
}): Promise<void> {
  const input = await sharp(opts.inPath).toBuffer();
  const result = await extractWithKey(input, {
    palette: opts.palette,
    key: opts.explicitKeyHex,
    minDistance: opts.minDistance,
    tolerance: opts.tolerance,
    halo: opts.halo,
    size: opts.size,
    hardAlpha: opts.hardAlpha,
  });

  if (!result.key.safe && !opts.force) {
    console.error(
      `[palette-extract] refusing to extract with an in-palette key: ${result.key.reason}\n` +
        `  pass --force to override, or choose a different --key / --palette.`,
    );
    process.exit(1);
  }

  await mkdir(path.dirname(path.resolve(opts.outPath)), { recursive: true });
  await writeFile(opts.outPath, result.data);

  const sidecarPath = `${opts.outPath}.key.json`;
  const sidecar = buildSidecar(opts, result.key, result);
  await writeFile(sidecarPath, JSON.stringify(sidecar, null, 2) + "\n");

  if (opts.json) {
    console.log(JSON.stringify({ output: opts.outPath, sidecar: sidecarPath, ...sidecar }, null, 2));
  } else {
    const warn = result.key.safe ? "" : "  ⚠ UNSAFE (forced)";
    console.log(
      `[palette-extract] ${opts.inPath} -> ${opts.outPath} ` +
        `(${result.dimensions[0]}x${result.dimensions[1]}, key=${result.key.name} ${result.key.hex})${warn}`,
    );
    console.log(`  reason: ${result.key.reason}`);
    console.log(`  residual key pixels: ${result.residual.before} -> ${result.residual.after}; sidecar: ${sidecarPath}`);
  }
}

function buildSidecar(
  opts: { palette: string[]; tolerance: number; halo: number; size?: number },
  key: KeySelection,
  result: { dimensions: [number, number]; residual: { before: number; after: number } },
) {
  return {
    keyColor: key.hex,
    keyName: key.name,
    keyReason: key.reason,
    keySafe: key.safe,
    nearestSubjectHex: key.nearestHex,
    nearestSubjectDistance: round(key.distance),
    minDistance: key.minDistance,
    tolerance: opts.tolerance,
    halo: opts.halo,
    size: opts.size ?? null,
    dimensions: result.dimensions,
    residualKeyPixels: result.residual,
    paletteSize: opts.palette.length,
    candidates: key.candidates,
    generatedAt: new Date().toISOString(),
  };
}

/** Resolve the subject palette from --palette-hex (CSV) or --palette <name>, defaulting to the DOOM ramp. */
function resolvePalette(argv: string[]): string[] {
  const hexCsv = flag(argv, "palette-hex");
  if (hexCsv) {
    const list = hexCsv
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        try {
          return rgbToHex(hexToRgb(s));
        } catch {
          throw new Error(`[palette-extract] invalid --palette-hex colour: ${s}`);
        }
      });
    if (!list.length) throw new Error("[palette-extract] --palette-hex listed no valid colours");
    return list;
  }
  const name = flag(argv, "palette");
  if (name) {
    const resolved = resolvePaletteByName(name);
    if (!resolved) throw new Error(`[palette-extract] unknown --palette ${name}`);
    return resolved;
  }
  return DOOM_RAMP;
}

/** Map a --key value (candidate name, hex, "auto", or undefined) to a hex string or undefined (= auto-select). */
function resolveKeyArg(keyArg: string | undefined): string | undefined {
  if (!keyArg || keyArg === "auto") return undefined;
  const named = KEY_CANDIDATES.find((c) => c.name === keyArg.toLowerCase());
  if (named) return named.hex;
  try {
    return rgbToHex(hexToRgb(keyArg));
  } catch {
    throw new Error(`[palette-extract] --key must be auto, ${KEY_CANDIDATES.map((c) => c.name).join("/")}, or a hex colour; got ${keyArg}`);
  }
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function printUsage(): void {
  console.error(
    [
      "Usage:",
      "  assetgen palette-extract --in <file> --out <file.webp> [options]   # key out the matte + record metadata",
      "  assetgen palette-extract --check --in <file> [options]             # validate the matte is palette-safe",
      "",
      "Options:",
      `  --palette <name>          Subject palette by name (default: doom)`,
      `  --palette-hex "#a,#b"     Subject palette as a hex CSV (overrides --palette)`,
      `  --key auto|green|magenta|blue|cyan|#rrggbb   Key colour (default: auto = safest out-of-palette)`,
      `  --min-distance <n>        Out-of-palette safety distance (default: ${KEY_SAFE_MIN_DISTANCE})`,
      `  --tolerance <n>           Key match tolerance (default: ${DEFAULT_TOLERANCE})`,
      `  --halo <n>                Alpha-fade halo upper distance (default: ${DEFAULT_HALO})`,
      "  --size <px>               Square plate size (centre-pads, never tight-crops)",
      "  --hard-alpha              Snap to hard pixel alpha after keying",
      "  --force                   Extract even with an in-palette (unsafe) key",
      "  --json                    Machine-readable output",
    ].join("\n"),
  );
}
