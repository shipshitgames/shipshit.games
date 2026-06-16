// upscale.ts — optional Real-ESRGAN restoration/upscale PRE-PASS run on the raw
// provider image BEFORE pixelize box-downscales it (issue #73). Soft, sub-grid AI
// output (esp. the codex/fal paths) shows up as muddy edges + colour bleed once
// pixelize snaps it to the grid; a clean ×2/×4 restore gives pixelize high-frequency
// input. OFF by default (heavy, model download). Mirrors audio.ts: env -> common
// paths -> `command -v` resolution, an injectable runner so the unit suite needs no
// binary, and a strict NEVER-THROWS contract: a missing/failed binary is a silent
// no-op that returns the input unchanged, never failing a generation.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const REALESRGAN_DEFAULT_BIN = "realesrgan-ncnn-vulkan";
export const REALESRGAN_DEFAULT_MODEL = "realesrgan-x4plus";

/** Real-ESRGAN upscale ratio. The PRD scopes the flag to ×2/×4. */
export type UpscaleFactor = 2 | 4;

/** Coerce arbitrary flag input to a supported ratio; anything but 2 snaps to 4. */
export function normalizeScale(raw: unknown): UpscaleFactor {
  return raw === 2 || raw === "2" ? 2 : 4;
}

/** Resolve the realesrgan-ncnn-vulkan binary the audio.ts way: env, common installs, PATH, else the bare name. */
export function resolveRealesrgan(): string {
  const cands = [
    process.env.REALESRGAN_BIN,
    "/opt/homebrew/bin/realesrgan-ncnn-vulkan",
    "/usr/local/bin/realesrgan-ncnn-vulkan",
    "/usr/bin/realesrgan-ncnn-vulkan",
  ];
  for (const c of cands) {
    if (c && existsSync(c)) return c;
  }
  try {
    const w = execFileSync("/bin/sh", ["-lc", "command -v realesrgan-ncnn-vulkan"], {
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
    })
      .toString()
      .trim();
    if (w) return w;
  } catch {
    /* not on PATH */
  }
  return REALESRGAN_DEFAULT_BIN;
}

/** True when the binary looks spawnable. Never throws; an ENOENT means "not installed". */
export function realesrganAvailable(bin: string = resolveRealesrgan()): boolean {
  // The portable ncnn build has no `--version`. An explicit path just has to exist;
  // a bare name is probed by spawning it (no args prints usage and exits at once).
  if (bin.includes("/")) return existsSync(bin);
  try {
    const res = spawnSync(bin, [], { stdio: "ignore", timeout: 5000 });
    return !(res.error && (res.error as NodeJS.ErrnoException).code === "ENOENT");
  } catch {
    return false;
  }
}

export interface UpscaleRunResult {
  status: number | null;
  stderr: string;
}

/** Injectable subprocess runner so the unit suite needs no real binary. */
export type UpscaleRunner = (bin: string, args: string[]) => UpscaleRunResult;

const defaultRunner: UpscaleRunner = (bin, args) => {
  const res = spawnSync(bin, args, {
    stdio: ["ignore", "ignore", "pipe"],
    encoding: "utf8",
    timeout: 1000 * 60 * 5,
    // Cap captured stderr so a chatty/looping binary can't balloon memory; we only
    // ever surface the last line of it in a no-op reason anyway.
    maxBuffer: 1024 * 1024,
  });
  if (res.error) return { status: null, stderr: String((res.error as Error).message ?? res.error) };
  return { status: res.status, stderr: res.stderr ?? "" };
};

export interface UpscaleOptions {
  /** Upscale ratio (×2/×4). Default ×4. */
  scale?: UpscaleFactor;
  /** Real-ESRGAN model name. Default realesrgan-x4plus. */
  model?: string;
  /** Override the resolved binary path. */
  binPath?: string;
  /** Injectable runner (tests). */
  runner?: UpscaleRunner;
  /** Injectable availability probe (tests). */
  available?: (bin: string) => boolean;
  log?: (chunk: string) => void;
}

export interface UpscaleResult {
  /** Upscaled bytes, OR the untouched input on any no-op. */
  data: Buffer;
  /** True only when the pre-pass actually produced output. */
  upscaled: boolean;
  /** The ratio used (or requested, on a no-op). */
  scale: UpscaleFactor;
  /** Why the pass no-op'd. Set only when upscaled === false. */
  reason?: string;
}

const SAFE_MODEL = /^[A-Za-z0-9._-]+$/;

/**
 * Run the Real-ESRGAN pre-pass when the binary is installed; otherwise (or on any
 * failure) silently return the input unchanged. NEVER throws — a missing or broken
 * upscaler must not fail a generation (issue #73 acceptance criterion).
 */
export async function maybeUpscale(input: Buffer, opts: UpscaleOptions = {}): Promise<UpscaleResult> {
  const scale = normalizeScale(opts.scale);
  const noop = (reason: string): UpscaleResult => {
    opts.log?.(`[upscale] skipped: ${reason}\n`);
    return { data: input, upscaled: false, scale, reason };
  };
  try {
    const model = opts.model && SAFE_MODEL.test(opts.model) ? opts.model : REALESRGAN_DEFAULT_MODEL;
    const bin = opts.binPath ?? resolveRealesrgan();
    const available = opts.available ?? ((b: string) => realesrganAvailable(b));
    if (!available(bin)) return noop("realesrgan-ncnn-vulkan not installed");

    const dir = mkdtempSync(join(tmpdir(), "assetgen-upscale-"));
    const inPath = join(dir, "in.png");
    const outPath = join(dir, "out.png");
    try {
      writeFileSync(inPath, input);
      const run = (opts.runner ?? defaultRunner)(bin, ["-i", inPath, "-o", outPath, "-s", String(scale), "-n", model]);
      if (run.status !== 0) {
        const tail = run.stderr ? `: ${run.stderr.trim().split("\n").pop()}` : "";
        return noop(`realesrgan exited ${run.status}${tail}`);
      }
      if (!existsSync(outPath) || statSync(outPath).size === 0) return noop("realesrgan produced no output");
      const data = readFileSync(outPath);
      opts.log?.(`[upscale] ×${scale} via ${model} (${(input.length / 1024).toFixed(1)}kb -> ${(data.length / 1024).toFixed(1)}kb)\n`);
      return { data, upscaled: true, scale };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  } catch (err) {
    return noop(`upscale error: ${String((err as Error)?.message ?? err)}`);
  }
}
