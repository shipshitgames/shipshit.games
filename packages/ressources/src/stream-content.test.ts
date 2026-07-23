import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
  buildStreamContent,
  formatTimestamp,
  parseTimedTranscript,
  validateGeneratedStreamContent,
} from "./stream-content";
import { parseJson3Transcript } from "./transcript";
import type { TimedTranscriptSegment } from "./types";

const cliPath = resolve(dirname(fileURLToPath(import.meta.url)), "cli.ts");

async function seedSource(root: string): Promise<void> {
  const directory = join(root, "sources", "shipshitshow");
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, "source.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        slug: "shipshitshow",
        kind: "youtube-channel",
        title: "Ship Shit Show",
        url: "https://www.youtube.com/@shipshitshow",
        priority: "primary",
        status: "active",
        topics: ["build-in-public"],
        rights: {
          transcriptPolicy: "public-captions",
          storeRawTranscript: false,
          notes: "Derivative fixture content only.",
        },
        desiredOutputs: ["tool"],
        notes: [],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

function fixtureSegments(): TimedTranscriptSegment[] {
  return [
    "Set the goal for the build.",
    "Inspect the existing implementation.",
    "Implement the first milestone.",
    "Verify the generated output.",
    "Repair the edge case.",
    "Summarize the next release step.",
  ].map((text, index) => ({
    startSeconds: index * 30,
    durationSeconds: 30,
    text,
  }));
}

test("parseJson3Transcript preserves timestamps while flattening caption prose", () => {
  const parsed = parseJson3Transcript({
    events: [
      { tStartMs: 0, dDurationMs: 1500, segs: [{ utf8: "Opening goal" }] },
      {
        tStartMs: 1500,
        dDurationMs: 2000,
        segs: [{ utf8: "Build " }, { utf8: "step" }],
      },
    ],
  });

  assert.equal(parsed.transcript, "Opening goal Build step");
  assert.deepEqual(parsed.segments, [
    { startSeconds: 0, durationSeconds: 1.5, text: "Opening goal" },
    { startSeconds: 1.5, durationSeconds: 2, text: "Build step" },
  ]);
});

test("parseTimedTranscript accepts minute and hour timestamps", () => {
  const segments = parseTimedTranscript(
    "[00:00] Open\n[01:15] Build\n[1:02:03.500] Ship\n",
  );
  assert.deepEqual(
    segments.map((segment) => segment.startSeconds),
    [0, 75, 3723.5],
  );
  assert.equal(segments[0]?.durationSeconds, 75);
  assert.equal(formatTimestamp(3723.5), "1:02:03");
  assert.throws(
    () => parseTimedTranscript("untimed prose only"),
    /must start with/,
  );
});

test("buildStreamContent writes four reviewable outputs without storing the raw transcript", async () => {
  const root = await mkdtemp(join(tmpdir(), "ressources-stream-content-"));
  const transcript = "UNIQUE_RAW_TRANSCRIPT_SENTINEL";
  try {
    await seedSource(root);
    const result = await buildStreamContent({
      sourceSlug: "shipshitshow",
      title: "Building the studio pipeline",
      url: "https://www.youtube.com/watch?v=abc12345678",
      transcript,
      segments: fixtureSegments(),
      rightsStatus: "user-provided",
      provider: "mock",
      root,
      now: () => new Date("2026-07-21T18:00:00.000Z"),
    });

    assert.equal(result.status, "created");
    assert.equal(result.manifest.provider, "mock");
    assert.equal(result.manifest.transcript.segmentCount, 6);
    assert.equal(result.manifest.transcript.durationSeconds, 180);
    assert.equal(result.manifest.transcript.sha256.length, 64);
    assert.equal(result.manifest.chapterCount, 3);
    assert.equal(result.manifest.clipCount, 2);

    const written = await Promise.all(
      Object.values(result.manifest.outputs).map((path) =>
        readFile(join(root, path), "utf8"),
      ),
    );
    assert.match(written[0]!, /^# Chapters/m);
    assert.match(written[1]!, /^# Clip candidates/m);
    assert.match(written[2]!, /^Subject:/);
    assert.match(written[3]!, /build notes/i);
    assert.doesNotMatch(written.join("\n"), new RegExp(transcript));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("buildStreamContent handles skip and versioned duplicates deterministically", async () => {
  const root = await mkdtemp(join(tmpdir(), "ressources-stream-duplicate-"));
  const input = {
    sourceSlug: "shipshitshow",
    title: "Duplicate stream",
    url: "https://www.youtube.com/watch?v=abc12345678",
    transcript: "Reviewed fixture transcript.",
    segments: fixtureSegments(),
    rightsStatus: "user-provided" as const,
    provider: "mock" as const,
    root,
  };
  try {
    await seedSource(root);
    const created = await buildStreamContent(input);
    const skipped = await buildStreamContent(input);
    const versioned = await buildStreamContent({
      ...input,
      duplicatePolicy: "versioned",
    });

    assert.equal(created.status, "created");
    assert.equal(skipped.status, "skipped");
    assert.equal(skipped.manifest.slug, "duplicate-stream");
    assert.equal(versioned.status, "versioned");
    assert.equal(versioned.manifest.slug, "duplicate-stream-v2");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("generated content validation rejects unsorted chapters and invalid clip ranges", () => {
  const valid = {
    chapters: [
      { startSeconds: 30, title: "Later" },
      { startSeconds: 10, title: "Earlier" },
    ],
    clips: [
      {
        startSeconds: 10,
        endSeconds: 20,
        title: "Clip",
        hook: "Hook",
        rationale: "Reason",
      },
    ],
    newsletter: {
      subject: "Subject",
      previewText: "Preview",
      markdown: "# Newsletter",
    },
    devlog: { title: "Devlog", summary: "Summary", markdown: "# Devlog" },
  };
  assert.throws(
    () => validateGeneratedStreamContent(valid, 60),
    /strictly increasing/,
  );
  assert.throws(
    () =>
      validateGeneratedStreamContent(
        {
          ...valid,
          chapters: [{ startSeconds: 0, title: "Opening" }],
          clips: [{ ...valid.clips[0]!, startSeconds: 20, endSeconds: 10 }],
        },
        60,
      ),
    /invalid transcript range/,
  );
});

test("vod-content CLI supports an offline timestamped transcript", async () => {
  const root = await mkdtemp(join(tmpdir(), "ressources-stream-cli-"));
  const transcriptPath = join(root, "fixture-timed.txt");
  try {
    await seedSource(root);
    await writeFile(
      transcriptPath,
      fixtureSegments()
        .map(
          (segment) =>
            `[${formatTimestamp(segment.startSeconds)}] ${segment.text}`,
        )
        .join("\n"),
      "utf8",
    );
    const result = spawnSync(
      process.execPath,
      [
        cliPath,
        "vod-content",
        "--root",
        root,
        "--transcript-file",
        transcriptPath,
        "--title",
        "Offline stream",
        "--url",
        "https://www.youtube.com/watch?v=abc12345678",
        "--rights",
        "user-provided",
        "--provider",
        "mock",
      ],
      { encoding: "utf8", timeout: 60_000 },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /\[vod-content-created\]/);
    const manifest = await readFile(
      join(
        root,
        "derivatives",
        "content",
        "shipshitshow",
        "offline-stream",
        "stream-content.json",
      ),
      "utf8",
    );
    assert.match(manifest, /"chapterCount": 3/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
