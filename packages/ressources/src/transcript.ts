// Pull a YouTube transcript. yt-dlp is the primary (and now effectively
// required) path: it fetches manual + auto English captions as json3 and we
// flatten them to prose. The legacy dependency-free watch-page scrape stays as
// a last-ditch fallback, but YouTube now returns an EMPTY timedtext body
// without a player-generated `pot` token, so it rarely works — install yt-dlp.
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TimedTranscriptSegment } from "./types";
import { execYtDlp, parseVideoId, ytDlpAvailable } from "./ytdlp";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export interface TranscriptResult {
  videoId: string;
  title: string;
  transcript: string;
  segments: TimedTranscriptSegment[];
  source: "watch-page" | "yt-dlp";
}

export function parseYouTubeVideoId(input: string): string {
  const id = parseVideoId(input);
  if (id) return id;
  throw new Error(`could not parse a YouTube video id from: ${input}`);
}

function extractJsonAfter(src: string, marker: string): unknown | null {
  const at = src.indexOf(marker);
  if (at < 0) return null;
  const start = src.indexOf("{", at);
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < src.length; index++) {
    const char = src[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
    } else if (char === '"') inString = true;
    else if (char === "{") depth++;
    else if (char === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(src.slice(start, index + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function pickEnglishTrack(tracks: any[]): any | undefined {
  if (!Array.isArray(tracks) || tracks.length === 0) return undefined;
  return (
    tracks.find((track) => track.languageCode?.startsWith("en") && track.kind !== "asr") ||
    tracks.find((track) => track.languageCode?.startsWith("en")) ||
    tracks[0]
  );
}

export function parseJson3Transcript(json: unknown): {
  transcript: string;
  segments: TimedTranscriptSegment[];
} {
  const object =
    typeof json === "object" && json !== null
      ? (json as Record<string, unknown>)
      : {};
  const events = Array.isArray(object.events) ? object.events : [];
  const segments: TimedTranscriptSegment[] = [];
  for (const event of events) {
    if (typeof event !== "object" || event === null || Array.isArray(event))
      continue;
    const record = event as Record<string, unknown>;
    const eventSegments = Array.isArray(record.segs) ? record.segs : [];
    const line = eventSegments
      .map((segment) =>
        typeof segment === "object" &&
        segment !== null &&
        !Array.isArray(segment)
          ? String((segment as Record<string, unknown>).utf8 ?? "")
          : "",
      )
      .join("")
      .replace(/\s+/g, " ")
      .trim();
    if (!line) continue;
    const startSeconds =
      typeof record.tStartMs === "number" && Number.isFinite(record.tStartMs)
        ? Math.max(0, record.tStartMs / 1000)
        : 0;
    const durationSeconds =
      typeof record.dDurationMs === "number" &&
      Number.isFinite(record.dDurationMs)
        ? Math.max(0, record.dDurationMs / 1000)
        : 0;
    const previous = segments.at(-1);
    if (previous?.text === line) {
      previous.durationSeconds = Math.max(
        previous.durationSeconds,
        startSeconds + durationSeconds - previous.startSeconds,
      );
      continue;
    }
    segments.push({ startSeconds, durationSeconds, text: line });
  }
  return {
    transcript: segments
      .map((segment) => segment.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim(),
    segments,
  };
}

async function viaWatchPage(videoId: string): Promise<TranscriptResult> {
  const res = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en`, {
    headers: { "user-agent": UA, "accept-language": "en-US,en;q=0.9", cookie: "CONSENT=YES+1" },
  });
  if (!res.ok) throw new Error(`watch page HTTP ${res.status}`);
  const html = await res.text();
  const player = extractJsonAfter(html, "ytInitialPlayerResponse") as any;
  if (!player) throw new Error("could not locate ytInitialPlayerResponse in the watch page");

  const title: string = player?.videoDetails?.title ?? videoId;
  const tracks: any[] = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  const track = pickEnglishTrack(tracks);
  if (!track?.baseUrl) {
    throw new Error("no caption tracks on this video. Pass --transcript-file, or install yt-dlp.");
  }
  const url = track.baseUrl + (track.baseUrl.includes("fmt=") ? "" : "&fmt=json3");
  const capRes = await fetch(url, { headers: { "user-agent": UA } });
  if (!capRes.ok) throw new Error(`timedtext HTTP ${capRes.status}`);
  const { transcript, segments } = parseJson3Transcript(await capRes.json());
  if (!transcript) throw new Error("caption track was empty");
  return { videoId, title, transcript, segments, source: "watch-page" };
}

function rankCaptionFile(file: string): number {
  if (file.includes(".en-orig.json3")) return 0;
  if (/\.en\.json3$/.test(file)) return 1;
  if (file.includes(".en")) return 2;
  return 3;
}

async function viaYtDlp(videoId: string): Promise<TranscriptResult> {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  let title = videoId;
  try {
    const { stdout } = await execYtDlp(["--skip-download", "--print", "%(title)s", url], {
      timeout: 60_000,
    });
    const candidate = stdout.trim().split("\n").pop();
    if (candidate) title = candidate;
  } catch {
    /* title is best effort */
  }

  const dir = await mkdtemp(join(tmpdir(), "ressources-yt-"));
  // Request BOTH manual (--write-subs) and auto (--write-auto-subs) captions.
  // Manual subs are higher quality and live on a different endpoint, so a video
  // that has creator-uploaded EN subs still works even when the auto-caption
  // endpoint is rate-limited (HTTP 429). yt-dlp prefers the manual track when
  // both exist, which also bumps transcript quality on translated videos.
  await execYtDlp(
    [
      "--skip-download",
      "--write-subs",
      "--write-auto-subs",
      "--sub-langs",
      "en-orig,en,en.*",
      "--sub-format",
      "json3",
      "-o",
      join(dir, "cap.%(ext)s"),
      url,
    ],
    { timeout: 120_000, maxBuffer: 32 * 1024 * 1024 },
  );

  const files = (await readdir(dir))
    .filter((file) => file.endsWith(".json3"))
    .sort((a, b) => rankCaptionFile(a) - rankCaptionFile(b));
  if (!files.length) throw new Error("yt-dlp wrote no caption file");
  const json = JSON.parse(await readFile(join(dir, files[0]!), "utf8"));
  const { transcript, segments } = parseJson3Transcript(json);
  if (!transcript) throw new Error("yt-dlp caption file was empty");
  return { videoId, title, transcript, segments, source: "yt-dlp" };
}

export async function fetchTranscript(
  input: string,
  log: (message: string) => void = () => {},
): Promise<TranscriptResult> {
  const videoId = parseYouTubeVideoId(input);
  const errors: string[] = [];

  if (await ytDlpAvailable()) {
    log(`[transcript] video=${videoId} - via yt-dlp...`);
    try {
      const result = await viaYtDlp(videoId);
      log(`[transcript] ok via yt-dlp - "${result.title}" (${result.transcript.split(/\s+/).length} words)`);
      return result;
    } catch (error) {
      errors.push(`yt-dlp: ${(error as Error).message}`);
      log(`[transcript] yt-dlp failed: ${(error as Error).message}`);
    }
  } else {
    log("[transcript] yt-dlp not found (set RESSOURCES_YT_DLP or add it to PATH for reliable captions)");
  }

  log("[transcript] trying dependency-free watch-page scrape...");
  try {
    const result = await viaWatchPage(videoId);
    log(`[transcript] ok via watch page - "${result.title}" (${result.transcript.split(/\s+/).length} words)`);
    return result;
  } catch (error) {
    errors.push(`watch-page: ${(error as Error).message}`);
  }

  throw new Error(
    `could not fetch a transcript for ${videoId}.\n  ${errors.join("\n  ")}\n` +
      "Install yt-dlp (recommended) or pass --transcript-file <path>.",
  );
}
