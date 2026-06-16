import assert from "node:assert/strict";
import { test } from "node:test";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { execYtDlp, parseVideoId, parseYtDlpVideo, ytDlpAvailable, ytDlpBin } from "./ytdlp";
import { parseYouTubeVideoId } from "./transcript";

const VIDEO_ID = "dQw4w9WgXcQ";

async function withEnv(value: string | undefined, run: () => Promise<void> | void): Promise<void> {
  const previous = process.env.RESSOURCES_YT_DLP;
  if (value === undefined) delete process.env.RESSOURCES_YT_DLP;
  else process.env.RESSOURCES_YT_DLP = value;
  try {
    await run();
  } finally {
    if (previous === undefined) delete process.env.RESSOURCES_YT_DLP;
    else process.env.RESSOURCES_YT_DLP = previous;
  }
}

test("parseVideoId extracts the id from every supported URL shape and bare ids", () => {
  assert.equal(parseVideoId(`https://www.youtube.com/watch?v=${VIDEO_ID}`), VIDEO_ID);
  assert.equal(parseVideoId(`https://www.youtube.com/watch?v=${VIDEO_ID}&t=42s`), VIDEO_ID);
  assert.equal(parseVideoId(`https://youtu.be/${VIDEO_ID}`), VIDEO_ID);
  assert.equal(parseVideoId(`https://www.youtube.com/shorts/${VIDEO_ID}`), VIDEO_ID);
  assert.equal(parseVideoId(`https://www.youtube.com/embed/${VIDEO_ID}`), VIDEO_ID);
  assert.equal(parseVideoId(VIDEO_ID), VIDEO_ID);
  assert.equal(parseVideoId(`  ${VIDEO_ID}  `), VIDEO_ID);
});

test("parseVideoId returns undefined for input with no parseable id", () => {
  assert.equal(parseVideoId("not a video url"), undefined);
  assert.equal(parseVideoId("https://example.com/some/path"), undefined);
  assert.equal(parseVideoId("tooShort"), undefined);
  assert.equal(parseVideoId(`${VIDEO_ID}xxxxxxxx`), undefined); // bare id must be exactly 11 chars
  assert.equal(parseVideoId(""), undefined);
});

test("parseYouTubeVideoId wraps parseVideoId and throws on unparseable input", () => {
  assert.equal(parseYouTubeVideoId(`https://youtu.be/${VIDEO_ID}`), VIDEO_ID);
  assert.equal(parseYouTubeVideoId(VIDEO_ID), VIDEO_ID);
  assert.throws(() => parseYouTubeVideoId("not a video url"), /could not parse a YouTube video id/);
});

test("parseYtDlpVideo maps a complete flat-playlist entry", () => {
  assert.deepEqual(
    parseYtDlpVideo({
      id: "abc12345678",
      title: "Hello World",
      url: "https://www.youtube.com/watch?v=abc12345678",
      duration: 120,
      upload_date: "20240101",
    }),
    {
      videoId: "abc12345678",
      title: "Hello World",
      url: "https://www.youtube.com/watch?v=abc12345678",
      durationSeconds: 120,
      uploadDate: "20240101",
    },
  );
});

test("parseYtDlpVideo preserves duration=0 as a real zero, not a missing value", () => {
  // A zero-length entry is a valid number, distinct from an absent duration.
  // The mapping must keep durationSeconds: 0 rather than dropping it to undefined.
  const mapped = parseYtDlpVideo({ id: "abc12345678", title: "Zero Length", duration: 0 });
  assert.equal(mapped?.durationSeconds, 0);
  assert.ok(mapped && "durationSeconds" in mapped);
});

test("parseYtDlpVideo synthesizes a watch URL when the entry url is missing or relative", () => {
  assert.equal(
    parseYtDlpVideo({ id: "abc12345678", title: "No URL" })?.url,
    "https://www.youtube.com/watch?v=abc12345678",
  );
  assert.equal(
    parseYtDlpVideo({ id: "abc12345678", title: "Relative", url: "/watch?v=abc12345678" })?.url,
    "https://www.youtube.com/watch?v=abc12345678",
  );
});

test("parseYtDlpVideo drops entries missing an id or title", () => {
  assert.equal(parseYtDlpVideo({ id: "abc12345678" }), undefined);
  assert.equal(parseYtDlpVideo({ title: "Orphan" }), undefined);
  assert.equal(parseYtDlpVideo({}), undefined);
  // Empty strings pass the typeof check but are still falsy — they must be
  // rejected the same as a missing field.
  assert.equal(parseYtDlpVideo({ id: "", title: "Valid" }), undefined);
  assert.equal(parseYtDlpVideo({ id: "abc12345678", title: "" }), undefined);
});

test("ytDlpBin honors RESSOURCES_YT_DLP and falls back to yt-dlp", async () => {
  await withEnv(undefined, () => assert.equal(ytDlpBin(), "yt-dlp"));
  await withEnv("/opt/custom/yt-dlp", () => assert.equal(ytDlpBin(), "/opt/custom/yt-dlp"));
});

test("execYtDlp + ytDlpAvailable run the RESSOURCES_YT_DLP binary end-to-end", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ressources-ytdlp-e2e-"));
  const fakeBin = join(dir, "fake-yt-dlp");
  // A stand-in yt-dlp: reports a version for `--version`, otherwise emits a
  // payload identical in shape to `--flat-playlist --dump-single-json`. This
  // exercises the exact subprocess path syncChannelVideos composes.
  const payload = {
    entries: [{ id: "abc12345678", title: "Fake Video", duration: 42, upload_date: "20240101" }],
  };
  const script = [
    "#!/usr/bin/env bash",
    'if [ "$1" = "--version" ]; then echo "9999.99.99"; exit 0; fi',
    // yt-dlp routes progress/diagnostics to stderr; emit some so the wrapper's
    // stderr capture is exercised, not just stdout.
    'echo "[fake-yt-dlp] dumping playlist" >&2',
    "cat <<'JSON'",
    JSON.stringify(payload),
    "JSON",
    "",
  ].join("\n");
  await writeFile(fakeBin, script, "utf8");
  await chmod(fakeBin, 0o755);

  try {
    await withEnv(fakeBin, async () => {
      assert.equal(await ytDlpAvailable(), true);
      const { stdout, stderr } = await execYtDlp([
        "--flat-playlist",
        "--dump-single-json",
        "https://www.youtube.com/@example/videos",
      ]);
      assert.match(stderr, /dumping playlist/);
      const parsed = JSON.parse(stdout) as { entries?: Record<string, unknown>[] };
      const videos = (parsed.entries ?? []).map(parseYtDlpVideo).filter(Boolean);
      assert.equal(videos.length, 1);
      assert.equal(videos[0]?.videoId, "abc12345678");
      assert.equal(videos[0]?.durationSeconds, 42);
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("ytDlpAvailable is false when the configured binary is missing", async () => {
  await withEnv("/nonexistent/definitely-not-a-real-yt-dlp", async () => {
    assert.equal(await ytDlpAvailable(), false);
  });
});
