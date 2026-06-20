// cutout.ts — optional rembg subject-segmentation cutout, run on the raw provider
// image BEFORE pixelize box-downscales it (issue #66). DESIGN.md's gradeParams
// already DECLARE rembg as the cutout tool (after-generate-before-downscale); this
// implements it. pixelize's border flood-fill keeps interior darks but struggles
// when a dark body blends into the void — rembg segments the subject regardless of
// background. OFF-by-graceful-degradation: when rembg is not installed (or fails),
// pixelize falls back to its flood-fill, never failing a generation.
//
// Mirrors upscale.ts exactly: env → common installs → `command -v` resolution, an
// injectable runner so the unit suite needs no binary, and a strict NEVER-THROWS
// contract — a missing/failed binary is a silent no-op that returns the input
// unchanged so the caller can fall back.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const REMBG_DEFAULT_BIN = "rembg";

/** Resolve the rembg binary the audio/upscale way: env, common installs, PATH, else the bare name. */
export function resolveRembg(): string {
  const cands = [
    process.env.REMBG_BIN,
    "/opt/homebrew/bin/rembg",
    "/usr/local/bin/rembg",
    "/usr/bin/rembg",
  ];
  for (const c of cands) {
    if (c && existsSync(c)) return c;
  }
  try {
    const w = execFileSync("/bin/sh", ["-lc", "command -v rembg"], {
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
    })
      .toString()
      .trim();
    if (w) return w;
  } catch {
    /* not on PATH */
  }
  return REMBG_DEFAULT_BIN;
}

/**
 * True when rembg looks runnable. Resolution-based on purpose — rembg's CLI reads
 * stdin when given no path args, so spawning it to probe could block; instead an
 * explicit resolved path just has to exist, and a bare default name means "not found".
 */
export function rembgAvailable(bin: string = resolveRembg()): boolean {
  return bin.includes("/") ? existsSync(bin) : false;
}

export interface CutoutRunResult {
  status: number | null;
  stderr: string;
}

/** Injectable subprocess runner so the unit suite needs no real binary. */
export type CutoutRunner = (bin: string, args: string[]) => CutoutRunResult;

const defaultRunner: CutoutRunner = (bin, args) => {
  const res = spawnSync(bin, args, {
    stdio: ["ignore", "ignore", "pipe"],
    encoding: "utf8",
    timeout: 1000 * 60 * 5,
    // Cap captured stderr so a chatty/looping binary can't balloon memory; we only
    // ever surface its last line in a no-op reason anyway.
    maxBuffer: 1024 * 1024,
  });
  if (res.error) return { status: null, stderr: String((res.error as Error).message ?? res.error) };
  return { status: res.status, stderr: res.stderr ?? "" };
};

export interface CutoutOptions {
  /** Override the resolved binary path. */
  binPath?: string;
  /** Injectable runner (tests). */
  runner?: CutoutRunner;
  /** Injectable availability probe (tests). */
  available?: (bin: string) => boolean;
  log?: (chunk: string) => void;
}

export interface CutoutResult {
  /** Cut-out bytes (RGBA PNG), OR the untouched input on any no-op. */
  data: Buffer;
  /** True only when rembg actually produced a cutout. */
  applied: boolean;
  /** The tool this module drives. */
  tool: "rembg";
  /** Why the pass no-op'd. Set only when applied === false. */
  reason?: string;
}

/**
 * Run the rembg cutout when installed; otherwise (or on any failure) silently
 * return the input unchanged so pixelize can fall back to its flood-fill. NEVER
 * throws — a missing or broken rembg must not fail a generation (issue #66).
 */
export async function maybeCutout(input: Buffer, opts: CutoutOptions = {}): Promise<CutoutResult> {
  const noop = (reason: string): CutoutResult => {
    opts.log?.(`[cutout] skipped: ${reason}\n`);
    return { data: input, applied: false, tool: "rembg", reason };
  };
  try {
    const bin = opts.binPath ?? resolveRembg();
    const available = opts.available ?? ((b: string) => rembgAvailable(b));
    if (!available(bin)) return noop("rembg not installed");

    const dir = mkdtempSync(join(tmpdir(), "assetgen-cutout-"));
    const inPath = join(dir, "in.png");
    const outPath = join(dir, "out.png");
    try {
      writeFileSync(inPath, input);
      // rembg CLI: `rembg i <input> <output>` → background-removed RGBA PNG.
      const run = (opts.runner ?? defaultRunner)(bin, ["i", inPath, outPath]);
      if (run.status !== 0) {
        const tail = run.stderr ? `: ${run.stderr.trim().split("\n").pop()}` : "";
        return noop(`rembg exited ${run.status}${tail}`);
      }
      if (!existsSync(outPath) || statSync(outPath).size === 0) return noop("rembg produced no output");
      const data = readFileSync(outPath);
      opts.log?.(
        `[cutout] rembg (${(input.length / 1024).toFixed(1)}kb -> ${(data.length / 1024).toFixed(1)}kb)\n`,
      );
      return { data, applied: true, tool: "rembg" };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  } catch (err) {
    return noop(`cutout error: ${String((err as Error)?.message ?? err)}`);
  }
}
