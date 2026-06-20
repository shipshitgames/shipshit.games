// Sprite frame-set geometry contract (issue #166). Before atlas packing, a
// generated/imported `sprite-anim` sheet (`<id>.anim.json`) must satisfy a
// structural contract so the slicer/atlas and the runtime can trust it:
//
//   1. Canonical direction SET — sheet.directions is exactly a 1/4/8 facing set
//      in the load-bearing order, and every clip covers exactly those facings
//      (no missing, no extra).
//   2. Frame-count integrity — clip.frames matches every facing's frame array
//      length, so a clip never has a short/long direction.
//   3. Deterministic rects — every frame rect is non-degenerate and lies fully
//      inside its declared atlas page (an out-of-bounds rect is a clipped frame).
//   4. (optional, pixel pass) no blank frames — each frame region carries
//      visible pixels, catching dead cells the packer would otherwise ship.
//
// A per-game CONTRACT (`sprite-contract.json` or CLI flags) can additionally
// demand a direction COUNT, required STATE coverage (idle/walk/attack…), uniform
// frame dimensions, a max frame size, and an aspect band. Contract checks only
// run when declared, so the gate is additive and never fails a sheet for a rule
// the game never opted into.
//
// The checker reports a per-asset diff and is consumed both by the standalone
// `assetgen check-sprites` command and by `assetgen atlas` as a pre-pack gate.

import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import sharp from "sharp";

import type { AnimClip, AnimFrame, SpriteAnimSheet } from "./expand.ts";
import { directionCountOf } from "./sprite-frames.ts";

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", ".turbo", "sources"]);
/** Above this many frames in one sheet we skip the per-frame pixel scan to stay fast. */
export const MAX_PIXEL_SCAN_FRAMES = 1024;

export type GeometryViolationCode =
  | "malformed-sheet"
  | "invalid-direction-set"
  | "direction-coverage"
  | "frame-count-mismatch"
  | "empty-frame-rect"
  | "clipped-bounds"
  | "blank-frame"
  | "direction-count"
  | "missing-state"
  | "non-uniform-frames"
  | "frame-too-large"
  | "bad-aspect";

export interface GeometryViolation {
  code: GeometryViolationCode;
  message: string;
  /** Clip (action) the violation belongs to, when scoped to one. */
  clip?: string;
  /** Facing the violation belongs to, when scoped to one. */
  direction?: string;
  /** Frame index within the clip/facing, when scoped to one. */
  frameIndex?: number;
}

/** A game's declared expectation for its sprite-anim frame-sets. All optional. */
export interface SpriteContract {
  /** Required facing count: sheet.directions.length must equal this (1|4|8). */
  directions?: number;
  /** Clip names every sheet must provide, e.g. ["idle","walk","attack"]. */
  states?: string[];
  /** Require every frame in a clip to share identical inner w×h (grid sheets). */
  uniformFrames?: boolean;
  /** Max allowed inner frame dimensions [w,h]. */
  maxFrameDims?: [number, number];
  /** Allowed per-frame aspect ratio (w/h) band [min,max]. */
  aspectRange?: [number, number];
}

export interface SpriteGeometryReport {
  assetId: string;
  /** Path to the `.anim.json` the report is for (as supplied to the checker). */
  source: string;
  ok: boolean;
  violations: GeometryViolation[];
}

export interface ValidateOptions {
  contract?: SpriteContract;
  /** Directory holding the sheet's atlas page images; required for the pixel pass. */
  pageDir?: string;
  /**
   * Run the per-frame pixel scan (needs pageDir). Default false at this layer.
   * The `check-sprites` CLI defaults it ON (opt out with `--no-pixels`); the
   * `atlas` pre-pack gate leaves it OFF for speed.
   */
  readPixels?: boolean;
  /** Cap the per-frame pixel scan (perf guard). Default `MAX_PIXEL_SCAN_FRAMES`. */
  maxPixelScanFrames?: number;
}

// ── structural checks (anim.json only, no I/O) ───────────────────────────────

function isFiniteNonNeg(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function eachFrame(sheet: SpriteAnimSheet, fn: (clip: string, facing: string, index: number, frame: AnimFrame) => void): void {
  for (const [clipName, clip] of Object.entries(sheet.clips)) {
    for (const [facing, frames] of Object.entries(clip.directions)) {
      frames.forEach((frame, index) => fn(clipName, facing, index, frame));
    }
  }
}

/** Validate sheet shape, direction set/coverage, frame counts, and rect bounds. */
export function validateStructure(sheet: SpriteAnimSheet): GeometryViolation[] {
  const out: GeometryViolation[] = [];

  if (!Array.isArray(sheet.directions) || sheet.directions.length === 0) {
    out.push({ code: "malformed-sheet", message: "sheet has no directions[]" });
    return out;
  }
  if (!sheet.clips || typeof sheet.clips !== "object" || Object.keys(sheet.clips).length === 0) {
    out.push({ code: "malformed-sheet", message: "sheet has no clips" });
    return out;
  }
  if (!Array.isArray(sheet.pages) || sheet.pages.length === 0) {
    out.push({ code: "malformed-sheet", message: "sheet has no pages[]" });
    return out;
  }

  const declared = sheet.directions;
  if (directionCountOf(declared) === null) {
    out.push({
      code: "invalid-direction-set",
      message: `directions [${declared.join(", ")}] is not a canonical 1/4/8 facing set in order`,
    });
  }
  const declaredSet = new Set(declared);

  for (const [clipName, clip] of Object.entries(sheet.clips)) {
    out.push(...validateClip(sheet, clipName, clip, declared, declaredSet));
  }
  return out;
}

function validateClip(
  sheet: SpriteAnimSheet,
  clipName: string,
  clip: AnimClip,
  declared: string[],
  declaredSet: Set<string>,
): GeometryViolation[] {
  const out: GeometryViolation[] = [];
  const at = (extra: Partial<GeometryViolation>): GeometryViolation =>
    ({ clip: clipName, message: "", code: "frame-count-mismatch", ...extra }) as GeometryViolation;

  if (!isFiniteNonNeg(clip.frames) || clip.frames < 1) {
    out.push(at({ code: "frame-count-mismatch", message: `clip "${clipName}" declares frames=${String(clip.frames)} (must be ≥1)` }));
  }
  if (!clip.directions || typeof clip.directions !== "object") {
    out.push(at({ code: "direction-coverage", message: `clip "${clipName}" has no directions map` }));
    return out;
  }

  // Missing facings the declared set requires.
  for (const facing of declared) {
    const frames = clip.directions[facing];
    if (!Array.isArray(frames)) {
      out.push(at({ code: "direction-coverage", direction: facing, message: `clip "${clipName}" is missing facing "${facing}"` }));
      continue;
    }
    if (isFiniteNonNeg(clip.frames) && frames.length !== clip.frames) {
      out.push(
        at({
          code: "frame-count-mismatch",
          direction: facing,
          message: `clip "${clipName}" facing "${facing}" has ${frames.length} frame(s), expected ${clip.frames}`,
        }),
      );
    }
  }
  // Extra facings outside the declared set.
  for (const facing of Object.keys(clip.directions)) {
    if (!declaredSet.has(facing)) {
      out.push(at({ code: "direction-coverage", direction: facing, message: `clip "${clipName}" has undeclared facing "${facing}"` }));
    }
  }

  // Rect integrity: non-degenerate + within the declared atlas page.
  for (const [facing, frames] of Object.entries(clip.directions)) {
    if (!Array.isArray(frames)) continue;
    frames.forEach((frame, index) => {
      const where: Partial<GeometryViolation> = { clip: clipName, direction: facing, frameIndex: index };
      if (!isFiniteNonNeg(frame?.w) || !isFiniteNonNeg(frame?.h) || frame.w <= 0 || frame.h <= 0) {
        out.push(at({ ...where, code: "empty-frame-rect", message: `clip "${clipName}" ${facing}#${index} has a degenerate rect ${frame?.w}×${frame?.h}` }));
        return;
      }
      const page = sheet.pages[frame.page];
      if (!page) {
        out.push(at({ ...where, code: "clipped-bounds", message: `clip "${clipName}" ${facing}#${index} references missing page ${frame.page}` }));
        return;
      }
      if (
        !isFiniteNonNeg(frame.x) ||
        !isFiniteNonNeg(frame.y) ||
        frame.x < 0 ||
        frame.y < 0 ||
        frame.x + frame.w > page.width ||
        frame.y + frame.h > page.height
      ) {
        out.push(
          at({
            ...where,
            code: "clipped-bounds",
            message: `clip "${clipName}" ${facing}#${index} rect (${frame.x},${frame.y},${frame.w},${frame.h}) overflows page ${frame.page} (${page.width}×${page.height})`,
          }),
        );
      }
    });
  }
  return out;
}

// ── contract checks (only when the game declares them) ───────────────────────

export function validateContract(sheet: SpriteAnimSheet, contract: SpriteContract): GeometryViolation[] {
  const out: GeometryViolation[] = [];

  if (contract.directions !== undefined && sheet.directions.length !== contract.directions) {
    out.push({
      code: "direction-count",
      message: `sheet declares ${sheet.directions.length} direction(s), contract requires ${contract.directions}`,
    });
  }

  if (contract.states?.length) {
    for (const state of contract.states) {
      if (!(state in sheet.clips)) {
        out.push({ code: "missing-state", clip: state, message: `contract requires state "${state}" but the sheet has no such clip` });
      }
    }
  }

  if (contract.uniformFrames) {
    for (const [clipName, clip] of Object.entries(sheet.clips)) {
      if (!clip.directions || typeof clip.directions !== "object") continue; // structural pass owns a missing directions map
      const dims = new Set<string>();
      for (const frames of Object.values(clip.directions)) {
        if (!Array.isArray(frames)) continue; // a non-array facing is a structural-pass concern, not a size mismatch
        for (const f of frames) {
          if (!isFiniteNonNeg(f?.w) || !isFiniteNonNeg(f?.h)) continue; // structural pass owns degenerate rects
          dims.add(`${f.w}×${f.h}`);
        }
      }
      if (dims.size > 1) {
        out.push({ code: "non-uniform-frames", clip: clipName, message: `clip "${clipName}" mixes frame sizes {${[...dims].join(", ")}}; contract requires uniform frames` });
      }
    }
  }

  // Per-frame size/aspect rules are additive — each runs ONLY when the contract
  // declares it. `expand` emits trimmed, variable-size frames (a wide slash, a
  // tall lunge), so neither a max-dimension nor an aspect band may be assumed by
  // default; doing so would false-fail legitimate output the game never opted in.
  if (contract.maxFrameDims || contract.aspectRange) {
    const [maxW, maxH] = contract.maxFrameDims ?? [Infinity, Infinity];
    const [minAspect, maxAspect] = contract.aspectRange ?? [0, Infinity];
    eachFrame(sheet, (clip, direction, frameIndex, frame) => {
      if (!isFiniteNonNeg(frame.w) || !isFiniteNonNeg(frame.h) || frame.w <= 0 || frame.h <= 0) return; // structural pass owns degenerate rects
      if (contract.maxFrameDims && (frame.w > maxW || frame.h > maxH)) {
        out.push({ code: "frame-too-large", clip, direction, frameIndex, message: `clip "${clip}" ${direction}#${frameIndex} is ${frame.w}×${frame.h}, exceeds max ${maxW}×${maxH}` });
      }
      if (contract.aspectRange) {
        const aspect = frame.w / frame.h;
        if (aspect < minAspect || aspect > maxAspect) {
          out.push({ code: "bad-aspect", clip, direction, frameIndex, message: `clip "${clip}" ${direction}#${frameIndex} aspect ${aspect.toFixed(2)} outside [${minAspect}, ${maxAspect}]` });
        }
      }
    });
  }

  return out;
}

// ── pixel pass (reads the atlas page images) ─────────────────────────────────

/** Flag any frame whose region on its atlas page carries no visible (opaque) pixels. */
export async function validatePixels(
  sheet: SpriteAnimSheet,
  pageDir: string,
  maxScanFrames: number = MAX_PIXEL_SCAN_FRAMES,
): Promise<GeometryViolation[]> {
  const out: GeometryViolation[] = [];
  let scanned = 0;
  let truncated = false;

  const pageCache = new Map<number, Buffer | null>();
  const loadPage = async (page: number): Promise<Buffer | null> => {
    if (pageCache.has(page)) return pageCache.get(page) ?? null;
    const meta = sheet.pages[page];
    const buf = meta && existsSync(join(pageDir, meta.image)) ? await readFile(join(pageDir, meta.image)) : null;
    pageCache.set(page, buf);
    return buf;
  };

  outer: for (const [clipName, clip] of Object.entries(sheet.clips)) {
    for (const [facing, frames] of Object.entries(clip.directions)) {
      for (let index = 0; index < frames.length; index++) {
        const frame = frames[index]!;
        const page = sheet.pages[frame.page];
        // Skip rects the structural pass already rejected (degenerate / out of bounds).
        if (!page || frame.w <= 0 || frame.h <= 0 || frame.x < 0 || frame.y < 0 || frame.x + frame.w > page.width || frame.y + frame.h > page.height) {
          continue;
        }
        const buf = await loadPage(frame.page);
        if (!buf) {
          out.push({ code: "blank-frame", clip: clipName, direction: facing, frameIndex: index, message: `clip "${clipName}" ${facing}#${index}: atlas page "${page.image}" not found` });
          continue;
        }
        // Cap detection sits here — past every skip/missing-page `continue` — so it
        // only fires when a real, scannable frame is about to be read. A trailing
        // skippable/degenerate frame can no longer trip a false "truncated" warning.
        if (scanned >= maxScanFrames) {
          truncated = true;
          break outer;
        }
        scanned++;
        try {
          // NB: sharp's `.stats()` ignores the `.extract()` in its pipeline and
          // reports on the whole input, so we read the cropped region's raw RGBA
          // bytes and scan the alpha channel ourselves (bailing on the first
          // visible pixel).
          const { data, info } = await sharp(buf)
            .extract({ left: Math.round(frame.x), top: Math.round(frame.y), width: Math.round(frame.w), height: Math.round(frame.h) })
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });
          let visible = false;
          for (let i = info.channels - 1; i < data.length; i += info.channels) {
            if (data[i]! > 0) {
              visible = true;
              break;
            }
          }
          if (!visible) {
            out.push({ code: "blank-frame", clip: clipName, direction: facing, frameIndex: index, message: `clip "${clipName}" ${facing}#${index} is fully transparent (no visible pixels)` });
          }
        } catch {
          // A region that fails to extract is a bounds problem the structural pass covers.
        }
      }
    }
  }
  if (truncated) {
    // Don't silently pass the un-scanned tail: tell the caller coverage was capped.
    console.warn(`[check-sprites] ${sheet.id}: pixel scan truncated at ${maxScanFrames} frame(s); later frames were not checked for blanks`);
  }
  return out;
}

// ── orchestration ────────────────────────────────────────────────────────────

export async function validateSpriteAnimSheet(sheet: SpriteAnimSheet, opts: ValidateOptions = {}): Promise<GeometryViolation[]> {
  const out = validateStructure(sheet);
  if (opts.contract) out.push(...validateContract(sheet, opts.contract));
  if (opts.readPixels && opts.pageDir) out.push(...(await validatePixels(sheet, opts.pageDir, opts.maxPixelScanFrames)));
  return out;
}

// ── filesystem: discovery, contract loading, gate ─────────────────────────────

const ANIM_SUFFIX = ".anim.json";

function toPosix(p: string): string {
  return p.split(sep).join("/");
}

async function walkAnimJson(dir: string, out: string[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkAnimJson(full, out);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(ANIM_SUFFIX)) {
      out.push(full);
    }
  }
}

export interface DiscoveredSheet {
  /** Absolute path to the `.anim.json`. */
  path: string;
  /** Posix path relative to assetsDir, for stable reporting. */
  rel: string;
  /** Parsed sheet, or null when the file is not valid JSON. */
  sheet: SpriteAnimSheet | null;
  /** JSON parse error message, when the file failed to parse. */
  error?: string;
}

/** Find every `<id>.anim.json` under `assetsDir`, optionally filtered to one game. */
export async function discoverAnimSheets(assetsDir: string, game?: string): Promise<DiscoveredSheet[]> {
  const files: string[] = [];
  await walkAnimJson(assetsDir, files);
  files.sort();
  const out: DiscoveredSheet[] = [];
  for (const path of files) {
    const rel = toPosix(relative(assetsDir, path));
    let sheet: SpriteAnimSheet | null = null;
    let error: string | undefined;
    try {
      sheet = JSON.parse(await readFile(path, "utf8")) as SpriteAnimSheet;
    } catch (e) {
      sheet = null;
      error = (e as Error).message;
    }
    // Unparseable files can't be game-filtered (we never learn their game), so
    // they always surface — better a stray report than a silently skipped corrupt sheet.
    if (game && sheet && sheet.game !== game) continue;
    out.push({ path, rel, sheet, error });
  }
  return out;
}

const CONTRACT_FILE = "sprite-contract.json";

/** Shallow-merge two contracts; `override` wins field-by-field. */
export function mergeContract(base: SpriteContract, override: SpriteContract): SpriteContract {
  return { ...base, ...override };
}

async function readContractFile(path: string): Promise<SpriteContract> {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(await readFile(path, "utf8")) as SpriteContract;
  } catch {
    return {};
  }
}

/**
 * Resolve the sprite contract for a game: the repo-wide
 * `<assetsDir>/sprite-contract.json` overlaid by the per-game
 * `<assetsDir>/<game>/sprite-contract.json` (per-game wins). Missing/malformed
 * files are treated as an empty contract.
 */
export async function loadSpriteContract(assetsDir: string, game?: string): Promise<SpriteContract> {
  const global = await readContractFile(join(assetsDir, CONTRACT_FILE));
  if (!game) return global;
  const perGame = await readContractFile(join(assetsDir, game, CONTRACT_FILE));
  return mergeContract(global, perGame);
}

export interface GateOptions {
  assetsDir: string;
  game?: string;
  contract?: SpriteContract;
  /** Run the per-frame pixel scan. Default false (structural + contract only). */
  readPixels?: boolean;
}

export interface GateResult {
  ok: boolean;
  reports: SpriteGeometryReport[];
}

/** Discover and validate every sprite-anim sheet; the shared core of the command + atlas gate. */
export async function gateSpriteGeometry(opts: GateOptions): Promise<GateResult> {
  const sheets = await discoverAnimSheets(opts.assetsDir, opts.game);
  const reports: SpriteGeometryReport[] = [];
  for (const { path, rel, sheet, error } of sheets) {
    if (!sheet) {
      reports.push({
        assetId: rel,
        source: rel,
        ok: false,
        violations: [{ code: "malformed-sheet", message: `${rel} is not valid JSON${error ? `: ${error}` : ""}` }],
      });
      continue;
    }
    const violations = await validateSpriteAnimSheet(sheet, {
      contract: opts.contract,
      pageDir: dirname(path),
      readPixels: opts.readPixels,
    });
    reports.push({ assetId: sheet.id ?? rel, source: rel, ok: violations.length === 0, violations });
  }
  return { ok: reports.every((r) => r.ok), reports };
}

/** Human-readable per-asset diff for the CLI. */
export function formatReports(reports: SpriteGeometryReport[]): string {
  const lines: string[] = [];
  for (const report of reports) {
    if (report.ok) {
      lines.push(`[check-sprites] ok ${report.source} (${report.assetId})`);
      continue;
    }
    lines.push(`[check-sprites] FAIL ${report.source} (${report.assetId}) — ${report.violations.length} violation(s)`);
    for (const v of report.violations) {
      lines.push(`  • ${v.code}: ${v.message}`);
    }
  }
  return lines.join("\n");
}
