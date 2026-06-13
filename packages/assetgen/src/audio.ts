/**
 * Dependency-light audio helpers (issue #21): prompt shaping, ffmpeg argv,
 * loudness/bitrate clamps, and a .webm/opus encode orchestration that can run
 * the real ffmpeg binary OR an injected fake runner (so the unit suite never
 * needs ffmpeg). No sharp/electron — only node builtins, so the desktop main
 * process can import this without dragging native modules into its bundle.
 */
import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const AUDIO_CATEGORIES = ["music", "sfx", "voice"] as const;
export type AudioCategory = (typeof AUDIO_CATEGORIES)[number];

export const DEFAULT_AUDIO_BITRATE = 128;

export function isAudioKind(kind: string): boolean {
  return (AUDIO_CATEGORIES as readonly string[]).includes(kind);
}

/** Integer kbps clamped to [32,320]; falls back to the default for junk input. */
export function clampBitrate(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_AUDIO_BITRATE;
  return Math.max(32, Math.min(320, Math.round(n)));
}

/** Volume clamped to [0,1], rounded to 2 decimals; defaults to 1 for junk input. */
export function clampVolume(n: number): number {
  if (!Number.isFinite(n)) return 1;
  const clamped = Math.max(0, Math.min(1, n));
  return Math.round(clamped * 100) / 100;
}

/** Loop only music by default; SFX/voice are one-shots. */
export function defaultLoopForCategory(cat: string): boolean {
  return cat === "music";
}

export interface AudioMetadata {
  category: string;
  volume: number;
  loop: boolean;
  duration?: number;
}

export function audioMetadata(opts: {
  category: string;
  volume?: number;
  loop?: boolean;
  duration?: number;
}): AudioMetadata {
  return {
    category: opts.category,
    volume: clampVolume(opts.volume ?? 1),
    loop: opts.loop ?? defaultLoopForCategory(opts.category),
    ...(opts.duration != null && Number.isFinite(opts.duration) ? { duration: opts.duration } : {}),
  };
}

/**
 * Audio direction with NO visual/pixel-art vocabulary — the styled image prompt
 * (buildPrompt) would poison an audio model, so audio kinds bypass it entirely.
 */
export function buildAudioPrompt(opts: { prompt: string; kind: string }): string {
  const prompt = opts.prompt.trim();
  if (opts.kind === "music") return `${prompt}. Seamless looping game music track, clean mix.`;
  if (opts.kind === "sfx") return `${prompt}. Short punchy game sound effect, dry, mono-friendly.`;
  if (opts.kind === "voice") return `${prompt}. Game character voice line, clear diction.`;
  return prompt;
}

export interface AudioEncodeOptions {
  bitrateKbps?: number;
  normalize?: boolean;
}

/**
 * Exact ffmpeg argv mirroring the desktop transcode (apps/desktop studio:transcodeAudio):
 * decode -> map audio -> libopus at the clamped bitrate, optional loudnorm, write output.
 */
export function buildFfmpegAudioArgs(input: string, output: string, opts: AudioEncodeOptions): string[] {
  const bitrate = clampBitrate(opts.bitrateKbps ?? DEFAULT_AUDIO_BITRATE);
  const args = ["-hide_banner", "-loglevel", "error", "-y", "-i", input, "-map", "0:a", "-c:a", "libopus", "-b:a", `${bitrate}k`];
  if (opts.normalize) args.push("-af", "loudnorm");
  args.push(output);
  return args;
}

/** Parse the first "Duration: HH:MM:SS.ss" out of ffmpeg stderr → total seconds (2dp). */
export function parseFfmpegDuration(stderr: string): number | undefined {
  const m = stderr.match(/Duration:\s*(\d+):(\d{2}):(\d{2})(?:\.(\d+))?/);
  if (!m) return undefined;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  const seconds = Number(m[3]);
  const frac = m[4] ? Number(`0.${m[4]}`) : 0;
  const total = hours * 3600 + minutes * 60 + seconds + frac;
  return Math.round(total * 100) / 100;
}

/** Resolve ffmpeg the desktop way: env, common installs, `command -v`, else "ffmpeg". */
export function resolveFfmpeg(): string {
  const cands = [process.env.FFMPEG, "/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/usr/bin/ffmpeg"];
  for (const c of cands) {
    if (c && existsSync(c)) return c;
  }
  try {
    const w = execFileSync("/bin/sh", ["-lc", "command -v ffmpeg"]).toString().trim();
    if (w) return w;
  } catch {
    /* not on PATH */
  }
  return "ffmpeg";
}

export function ffmpegAvailable(): boolean {
  try {
    execFileSync(resolveFfmpeg(), ["-version"], { stdio: ["ignore", "ignore", "ignore"] });
    return true;
  } catch {
    return false;
  }
}

export interface FfmpegRunResult {
  code: number;
  stderr: string;
}

/** The runner is responsible for actually producing the output file at args[last]. */
export type FfmpegRunner = (cmd: string, args: string[]) => Promise<FfmpegRunResult>;

export interface EncodeAudioResult {
  data: Buffer;
  mediaType: "audio/webm";
  extension: "webm";
  duration?: number;
}

function defaultFfmpegRunner(cmd: string, args: string[]): Promise<FfmpegRunResult> {
  return new Promise((resolve) => {
    let stderr = "";
    let child;
    try {
      child = spawn(cmd, args);
    } catch (err) {
      resolve({ code: -1, stderr: String((err as Error)?.message ?? err) });
      return;
    }
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", (err) => {
      stderr += `\nffmpeg error: ${String((err as Error)?.message ?? err)}`;
    });
    child.on("close", (code) => resolve({ code: code ?? -1, stderr }));
  });
}

/**
 * Encode a source audio buffer to .webm/opus. The runner abstraction means the
 * full orchestration (temp dir, argv, error path, duration parse) is covered by
 * a unit test that injects a fake runner — no ffmpeg binary required.
 */
export async function encodeAudioWebm(
  input: Buffer,
  opts: AudioEncodeOptions = {},
  deps: { runner?: FfmpegRunner; ffmpegPath?: string; inputExt?: string } = {},
): Promise<EncodeAudioResult> {
  const dir = await mkdtemp(join(tmpdir(), "assetgen-audio-"));
  const inPath = join(dir, `in.${deps.inputExt || "wav"}`);
  const outPath = join(dir, "out.webm");
  try {
    await writeFile(inPath, input);
    const args = buildFfmpegAudioArgs(inPath, outPath, opts);
    const runner = deps.runner ?? ((cmd, a) => defaultFfmpegRunner(cmd, a));
    const result = await runner(deps.ffmpegPath ?? resolveFfmpeg(), args);
    if (result.code !== 0) {
      throw new Error(`ffmpeg exited ${result.code}: ${result.stderr.slice(-500)}`);
    }
    const data = await readFile(outPath);
    const duration = parseFfmpegDuration(result.stderr);
    return {
      data,
      mediaType: "audio/webm",
      extension: "webm",
      ...(duration != null ? { duration } : {}),
    };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
