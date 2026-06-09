// Pull a YouTube transcript. yt-dlp is the primary (and now effectively
// required) path: it fetches manual + auto English captions as json3 and we
// flatten them to prose. The legacy dependency-free watch-page scrape stays as
// a last-ditch fallback, but YouTube now returns an EMPTY timedtext body
// without a player-generated `pot` token, so it rarely works — install yt-dlp.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const pexec = promisify(execFile);

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export interface TranscriptResult {
  videoId: string;
  title: string;
  transcript: string;
  source: "watch-page" | "yt-dlp";
}

export function parseYouTubeVideoId(input: string): string {
  const match = input.match(/(?:v=|youtu\.be\/|\/embed\/|\/shorts\/)([A-Za-z0-9_-]{11})/);
  if (match?.[1]) return match[1];
  const trimmed = input.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed;
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

function flattenJson3(json: any): string {
  const events: any[] = json?.events ?? [];
  const parts: string[] = [];
  for (const event of events) {
    const segments: any[] = event?.segs ?? [];
    const line = segments
      .map((segment) => segment?.utf8 ?? "")
      .join("")
      .replace(/\s+/g, " ")
      .trim();
    if (line) parts.push(line);
  }
  const out: string[] = [];
  for (const part of parts) {
    if (out[out.length - 1] !== part) out.push(part);
  }
  return out.join(" ").replace(/\s+/g, " ").trim();
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
  const transcript = flattenJson3(await capRes.json());
  if (!transcript) throw new Error("caption track was empty");
  return { videoId, title, transcript, source: "watch-page" };
}

const ytDlpBin = () => process.env.RESSOURCES_YT_DLP || "yt-dlp";

async function ytDlpAvailable(): Promise<boolean> {
  try {
    await pexec(ytDlpBin(), ["--version"], { timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

function rankCaptionFile(file: string): number {
  if (file.includes(".en-orig.json3")) return 0;
  if (/\.en\.json3$/.test(file)) return 1;
  if (file.includes(".en")) return 2;
  return 3;
}

async function viaYtDlp(videoId: string): Promise<TranscriptResult> {
  const bin = ytDlpBin();
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  let title = videoId;
  try {
    const { stdout } = await pexec(bin, ["--skip-download", "--print", "%(title)s", url], {
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
  await pexec(
    bin,
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
  const transcript = flattenJson3(json);
  if (!transcript) throw new Error("yt-dlp caption file was empty");
  return { videoId, title, transcript, source: "yt-dlp" };
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
