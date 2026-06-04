// Pull a YouTube transcript with zero native deps: scrape the watch page for the
// player response, find an English caption track, fetch its json3 timed-text, and
// flatten it to plain prose. Falls back to a local `yt-dlp` if one is on PATH.
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
  /** how the transcript was obtained: "watch-page" | "yt-dlp" */
  source: string;
}

/** Accept a full URL, a youtu.be/shorts/embed link, or a bare 11-char id. */
export function parseVideoId(input: string): string {
  const m = input.match(/(?:v=|youtu\.be\/|\/embed\/|\/shorts\/)([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]{11}$/.test(input.trim())) return input.trim();
  throw new Error(`Could not parse a YouTube video id from: ${input}`);
}

/** Extract the first balanced `{...}` object that follows `marker` in `src`. */
function extractJsonAfter(src: string, marker: string): any | null {
  const at = src.indexOf(marker);
  if (at < 0) return null;
  let i = src.indexOf("{", at);
  if (i < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(src.slice(i, j + 1));
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
  // Prefer a human/original English track, then any English (incl. auto), then anything.
  return (
    tracks.find((t) => t.languageCode?.startsWith("en") && t.kind !== "asr") ||
    tracks.find((t) => t.languageCode?.startsWith("en")) ||
    tracks[0]
  );
}

function flattenJson3(json: any): string {
  const events: any[] = json?.events ?? [];
  const parts: string[] = [];
  for (const ev of events) {
    const segs: any[] = ev?.segs ?? [];
    const line = segs
      .map((s) => s?.utf8 ?? "")
      .join("")
      .replace(/\s+/g, " ")
      .trim();
    if (line) parts.push(line);
  }
  // Auto-captions roll, so consecutive lines often duplicate — drop exact repeats.
  const out: string[] = [];
  for (const p of parts) if (out[out.length - 1] !== p) out.push(p);
  return out.join(" ").replace(/\s+/g, " ").trim();
}

async function viaWatchPage(videoId: string): Promise<TranscriptResult> {
  const res = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en`, {
    headers: { "user-agent": UA, "accept-language": "en-US,en;q=0.9", cookie: "CONSENT=YES+1" },
  });
  if (!res.ok) throw new Error(`watch page HTTP ${res.status}`);
  const html = await res.text();
  const player = extractJsonAfter(html, "ytInitialPlayerResponse");
  if (!player) throw new Error("could not locate ytInitialPlayerResponse in the watch page");

  const title: string = player?.videoDetails?.title ?? videoId;
  const tracks: any[] = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  const track = pickEnglishTrack(tracks);
  if (!track?.baseUrl) {
    throw new Error(
      "no caption tracks on this video (captions may be disabled). " +
        "Pass --transcript-file, or install yt-dlp.",
    );
  }
  const url = track.baseUrl + (track.baseUrl.includes("fmt=") ? "" : "&fmt=json3");
  const capRes = await fetch(url, { headers: { "user-agent": UA } });
  if (!capRes.ok) throw new Error(`timedtext HTTP ${capRes.status}`);
  const transcript = flattenJson3(await capRes.json());
  if (!transcript) throw new Error("caption track was empty");
  return { videoId, title, transcript, source: "watch-page" };
}

/** yt-dlp binary: RESEARCH_YT_DLP env override (the desktop app sets this), else PATH. */
const ytDlpBin = () => process.env.RESEARCH_YT_DLP || "yt-dlp";

async function ytDlpAvailable(): Promise<boolean> {
  try {
    await pexec(ytDlpBin(), ["--version"], { timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

// Prefer the original English track, then plain `en`, then any en-* — never an
// auto-translated `en-xx`/`xx-en` track if a real one exists.
function rankCaptionFile(f: string): number {
  if (f.includes(".en-orig.json3")) return 0;
  if (/\.en\.json3$/.test(f)) return 1;
  if (f.includes(".en")) return 2;
  return 3;
}

async function viaYtDlp(videoId: string): Promise<TranscriptResult> {
  const bin = ytDlpBin();
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  let title = videoId;
  // Title via a cheap simulate pass (best-effort — never fail the run over it).
  try {
    const { stdout } = await pexec(bin, ["--skip-download", "--print", "%(title)s", url], {
      timeout: 60_000,
    });
    const t = stdout.trim().split("\n").pop();
    if (t) title = t;
  } catch {
    /* keep videoId */
  }
  const dir = await mkdtemp(join(tmpdir(), "research-yt-"));
  // NOTE: do NOT pass --print here; it implies --simulate and skips writing the subs.
  await pexec(
    bin,
    [
      "--skip-download",
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
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json3")).sort((a, b) => rankCaptionFile(a) - rankCaptionFile(b));
  if (!files.length) throw new Error("yt-dlp wrote no caption file");
  const json = JSON.parse(await readFile(join(dir, files[0]), "utf8"));
  const transcript = flattenJson3(json);
  if (!transcript) throw new Error("yt-dlp caption file was empty");
  return { videoId, title, transcript, source: "yt-dlp" };
}

/**
 * Fetch a transcript. yt-dlp is the primary engine when available — it handles the
 * visitor/PoToken handshake YouTube now requires for timed-text. The dependency-free
 * watch-page scrape is the fallback (works on some videos, empty on PoToken-gated ones).
 */
export async function fetchTranscript(
  input: string,
  log: (m: string) => void = () => {},
): Promise<TranscriptResult> {
  const videoId = parseVideoId(input);
  const errors: string[] = [];

  if (await ytDlpAvailable()) {
    log(`[transcript] video=${videoId} — via yt-dlp…`);
    try {
      const r = await viaYtDlp(videoId);
      log(`[transcript] ok via yt-dlp — "${r.title}" (${r.transcript.split(/\s+/).length} words)`);
      return r;
    } catch (e) {
      errors.push(`yt-dlp: ${(e as Error).message}`);
      log(`[transcript] yt-dlp failed: ${(e as Error).message}`);
    }
  } else {
    log(`[transcript] yt-dlp not found (set RESEARCH_YT_DLP or add it to PATH for reliable captions)`);
  }

  log(`[transcript] trying dependency-free watch-page scrape…`);
  try {
    const r = await viaWatchPage(videoId);
    log(`[transcript] ok via watch page — "${r.title}" (${r.transcript.split(/\s+/).length} words)`);
    return r;
  } catch (e) {
    errors.push(`watch-page: ${(e as Error).message}`);
  }

  throw new Error(
    `could not fetch a transcript for ${videoId}.\n  ${errors.join("\n  ")}\n` +
      `Install yt-dlp (recommended) or pass --transcript-file <path>.`,
  );
}
