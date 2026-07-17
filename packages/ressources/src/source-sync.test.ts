import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { syncChannelVideos } from "./library";

const cliPath = resolve(dirname(fileURLToPath(import.meta.url)), "cli.ts");

async function writeYouTubeSource(root: string): Promise<void> {
  const directory = join(root, "sources", "fixture-channel");
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, "source.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        slug: "fixture-channel",
        kind: "youtube-channel",
        title: "Fixture Channel",
        url: "https://www.youtube.com/@fixture",
        priority: "reference",
        status: "active",
        topics: ["testing"],
        rights: {
          transcriptPolicy: "public-captions",
          storeRawTranscript: false,
          notes: "Fixture metadata only.",
        },
        desiredOutputs: ["rule"],
        notes: [],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

async function writeFakeYtDlp(root: string): Promise<string> {
  const binary = join(root, "fake-yt-dlp");
  const payload = {
    entries: [
      {
        id: "newest00001",
        title: "Newest",
        url: "https://www.youtube.com/watch?v=newest00001",
        duration: 30,
        upload_date: "20260202",
      },
      {
        id: "oldest00001",
        title: "Oldest",
        duration: 10,
        upload_date: "20240101",
      },
      {
        id: "newest00001",
        title: "Duplicate should be ignored",
        upload_date: "20200101",
      },
    ],
  };
  const script = [
    "#!/usr/bin/env bash",
    'if [ "$1" = "--version" ]; then echo "9999.99.99"; exit 0; fi',
    "cat <<'JSON'",
    JSON.stringify(payload),
    "JSON",
    "",
  ].join("\n");
  await writeFile(binary, script, "utf8");
  await chmod(binary, 0o755);
  return binary;
}

test("syncChannelVideos writes deduplicated, deterministic metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "ressources-source-sync-"));
  const previousBinary = process.env.RESSOURCES_YT_DLP;
  try {
    await writeYouTubeSource(root);
    process.env.RESSOURCES_YT_DLP = await writeFakeYtDlp(root);

    const result = await syncChannelVideos("fixture-channel", 25, {
      sourcesDir: join(root, "sources"),
      now: () => new Date("2026-07-17T20:00:00.000Z"),
    });

    assert.equal(result.syncedAt, "2026-07-17T20:00:00.000Z");
    assert.deepEqual(
      result.videos.map((video) => video.videoId),
      ["newest00001", "oldest00001"],
    );
    assert.equal(result.videos[0]?.title, "Newest");
    assert.equal(
      result.videos[1]?.url,
      "https://www.youtube.com/watch?v=oldest00001",
    );

    const written = JSON.parse(
      await readFile(join(root, "sources", "fixture-channel", "videos.json"), "utf8"),
    ) as typeof result;
    assert.deepEqual(written, result);
  } finally {
    if (previousBinary === undefined) delete process.env.RESSOURCES_YT_DLP;
    else process.env.RESSOURCES_YT_DLP = previousBinary;
    await rm(root, { recursive: true, force: true });
  }
});

test("source-sync CLI supports --root and reports the synced count", async () => {
  const root = await mkdtemp(join(tmpdir(), "ressources-source-sync-cli-"));
  try {
    await writeYouTubeSource(root);
    const binary = await writeFakeYtDlp(root);
    const result = spawnSync(
      process.execPath,
      [
        cliPath,
        "source-sync",
        "--source",
        "fixture-channel",
        "--limit",
        "2",
        "--root",
        root,
      ],
      {
        encoding: "utf8",
        env: { ...process.env, RESSOURCES_YT_DLP: binary },
        timeout: 60_000,
      },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /\[sync\] fixture-channel videos=2/);
    const output = await readFile(
      join(root, "sources", "fixture-channel", "videos.json"),
      "utf8",
    );
    assert.match(output, /"sourceSlug": "fixture-channel"/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("source-sync rejects invalid limits before invoking yt-dlp", async () => {
  await assert.rejects(
    () => syncChannelVideos("fixture-channel", Number.NaN),
    /limit must be a positive integer/,
  );
  await assert.rejects(
    () => syncChannelVideos("fixture-channel", 0),
    /limit must be a positive integer/,
  );
});

test("source-sync explains how to resolve a missing yt-dlp binary", async () => {
  const root = await mkdtemp(join(tmpdir(), "ressources-source-sync-missing-"));
  const previousBinary = process.env.RESSOURCES_YT_DLP;
  try {
    await writeYouTubeSource(root);
    process.env.RESSOURCES_YT_DLP = join(root, "missing-yt-dlp");
    await assert.rejects(
      () =>
        syncChannelVideos("fixture-channel", 5, {
          sourcesDir: join(root, "sources"),
        }),
      /install it or set RESSOURCES_YT_DLP/,
    );
  } finally {
    if (previousBinary === undefined) delete process.env.RESSOURCES_YT_DLP;
    else process.env.RESSOURCES_YT_DLP = previousBinary;
    await rm(root, { recursive: true, force: true });
  }
});
