// Canonical yt-dlp orchestration for @shipshitgames/ressources.
//
// Both `transcript.ts` (fetchTranscript) and `library.ts` (sync-channel) shell
// out to yt-dlp. They previously each carried their own binary resolver,
// availability probe, video-id parser, and execFile wrapper — and the copies had
// drifted: transcript.ts honored the RESSOURCES_YT_DLP override while library.ts
// hardcoded "yt-dlp", so `sync-channel` silently ignored the documented env var.
// Keeping that orchestration here gives one source of truth that honors the
// override everywhere. No heavy deps (only node:child_process), so this module is
// safe for any consumer to import.
import { execFile, type ExecFileOptions } from "node:child_process";
import { promisify } from "node:util";
import type { SyncedVideo } from "./types";

const pexec = promisify(execFile);

/** Single canonical YouTube video-id pattern shared by every parser. */
const VIDEO_ID_PATTERN = /(?:v=|youtu\.be\/|\/embed\/|\/shorts\/)([A-Za-z0-9_-]{11})/;

/**
 * Resolve the yt-dlp binary, honoring the documented `RESSOURCES_YT_DLP`
 * override and falling back to `yt-dlp` on `PATH`.
 */
export function ytDlpBin(): string {
  return process.env.RESSOURCES_YT_DLP || "yt-dlp";
}

/**
 * Run yt-dlp with the resolved binary. Output is normalized to strings; we never
 * request `encoding: "buffer"`, so `toString()` is a no-op on the already-string
 * stdout/stderr and just satisfies the union the typings return.
 */
export async function execYtDlp(
  args: string[],
  options: ExecFileOptions = {},
): Promise<{ stdout: string; stderr: string }> {
  const { stdout, stderr } = await pexec(ytDlpBin(), args, options);
  return { stdout: stdout.toString(), stderr: stderr.toString() };
}

/** Whether the resolved yt-dlp binary is installed and runnable. */
export async function ytDlpAvailable(): Promise<boolean> {
  try {
    await execYtDlp(["--version"], { timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Parse a YouTube video id from a watch/share/embed/shorts URL or a bare id.
 * Returns `undefined` when no 11-char id can be found.
 */
export function parseVideoId(input: string): string | undefined {
  const match = input.match(VIDEO_ID_PATTERN);
  if (match?.[1]) return match[1];
  const trimmed = input.trim();
  return /^[A-Za-z0-9_-]{11}$/.test(trimmed) ? trimmed : undefined;
}

/** Map one `yt-dlp --flat-playlist --dump-single-json` entry into a SyncedVideo. */
export function parseYtDlpVideo(entry: Record<string, unknown>): SyncedVideo | undefined {
  const id = typeof entry.id === "string" ? entry.id : undefined;
  const title = typeof entry.title === "string" ? entry.title : undefined;
  const rawUrl = typeof entry.url === "string" ? entry.url : undefined;
  if (!id || !title) return undefined;
  const url = rawUrl?.startsWith("http") ? rawUrl : `https://www.youtube.com/watch?v=${id}`;
  const durationSeconds = typeof entry.duration === "number" ? entry.duration : undefined;
  const uploadDate = typeof entry.upload_date === "string" ? entry.upload_date : undefined;
  return { videoId: id, title, url, durationSeconds, uploadDate };
}
