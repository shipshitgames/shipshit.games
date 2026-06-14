import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { ffmpegAvailable } from "../src/audio.ts";

const pkgDir = fileURLToPath(new URL("..", import.meta.url));
const hasFfmpeg = ffmpegAvailable();
// Skip cleanly (reported as skipped, not failed) where ffmpeg is unavailable (CI).
const skip = hasFfmpeg ? undefined : "ffmpeg not available";

async function runCli(
  args: string[],
  env: Record<string, string> = {},
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(["bun", "src/cli.ts", "generate", ...args], {
    cwd: pkgDir,
    env: { ...process.env, ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { exitCode, stdout, stderr };
}

function assertWebmMagic(data: Buffer, label: string): void {
  assert.deepEqual(
    Array.from(data.subarray(0, 4)),
    [0x1a, 0x45, 0xdf, 0xa3],
    `${label} missing EBML/WebM magic`,
  );
}

test("e2e: sfx generation encodes a webm and registers audio metadata", { skip }, async () => {
  const repo = await mkdtemp(join(tmpdir(), "assetgen-audio-e2e-sfx-"));
  try {
    const result = await runCli([
      "--id", "e2e-stinger",
      "--prompt", "metallic impact",
      "--kind", "sfx",
      "--provider", "mock",
      "--game", "shared",
      "--repo", repo,
      "--usage-log", "off",
      "--bitrate", "96",
      "--normalize",
    ]);
    assert.equal(result.exitCode, 0, `cli failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);

    const assetPath = join(repo, "src/assets/audio/sfx/e2e-stinger.webm");
    assert.equal(existsSync(assetPath), true);
    assertWebmMagic(await readFile(assetPath), "sfx output");

    const manifest = JSON.parse(await readFile(join(repo, "src/assets/assets.json"), "utf8"));
    assert.equal(manifest.assets.length, 1);
    const entry = manifest.assets[0];
    assert.equal(entry.kind, "sfx");
    assert.equal(entry.category, "sfx");
    assert.equal(entry.loop, false);
    assert.equal(entry.volume, 1);
    assert.equal(entry.provider, "mock");
    assert.equal(entry.license.tool, "mock");
    assert.equal(entry.license.kind, "sfx");
    assert.equal(entry.license.type, "ai-generated");
    // Regression guard: duration must be populated from a REAL ffmpeg encode + ffprobe
    // probe (the `-loglevel error` encode emits no "Duration:" banner). The mock
    // provider yields a ~1s silent WAV, so the encoded webm clocks in around 1.0s.
    assert.equal(typeof entry.duration, "number", "audio entry should record a duration");
    assert.equal(Number.isFinite(entry.duration), true);
    assert.equal(entry.duration > 0, true, `expected positive duration, got ${entry.duration}`);
    assert.equal(Math.abs(entry.duration - 1) < 0.25, true, `expected ~1s, got ${entry.duration}`);
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test("e2e: --volume 0 is preserved (muted), not coerced to 1", { skip }, async () => {
  const repo = await mkdtemp(join(tmpdir(), "assetgen-audio-e2e-vol0-"));
  try {
    const result = await runCli([
      "--id", "e2e-muted",
      "--prompt", "ambient pad",
      "--kind", "sfx",
      "--provider", "mock",
      "--game", "shared",
      "--repo", repo,
      "--usage-log", "off",
      "--volume", "0",
    ]);
    assert.equal(result.exitCode, 0, `cli failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);

    const manifest = JSON.parse(await readFile(join(repo, "src/assets/assets.json"), "utf8"));
    const entry = manifest.assets[0];
    assert.equal(entry.volume, 0);
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test("e2e: music generation defaults loop to true", { skip }, async () => {
  const repo = await mkdtemp(join(tmpdir(), "assetgen-audio-e2e-music-"));
  try {
    const result = await runCli([
      "--id", "e2e-theme",
      "--prompt", "tense dungeon theme",
      "--kind", "music",
      "--provider", "mock",
      "--game", "shared",
      "--repo", repo,
      "--usage-log", "off",
    ]);
    assert.equal(result.exitCode, 0, `cli failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);

    const assetPath = join(repo, "src/assets/audio/music/e2e-theme.webm");
    assert.equal(existsSync(assetPath), true);
    assertWebmMagic(await readFile(assetPath), "music output");

    const manifest = JSON.parse(await readFile(join(repo, "src/assets/assets.json"), "utf8"));
    const entry = manifest.assets[0];
    assert.equal(entry.kind, "music");
    assert.equal(entry.category, "music");
    assert.equal(entry.loop, true);
    // Duration is recorded for the default (no-normalize) encode path too.
    assert.equal(typeof entry.duration, "number", "music entry should record a duration");
    assert.equal(entry.duration > 0, true, `expected positive duration, got ${entry.duration}`);
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});
