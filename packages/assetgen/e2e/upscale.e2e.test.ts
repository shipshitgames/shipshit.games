import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync } from "node:fs";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const pkgDir = fileURLToPath(new URL("..", import.meta.url));

/** Generic CLI driver: spawns the real assetgen CLI for any verb, capturing pipes. */
async function runCli(
  verb: string,
  args: string[],
  extraEnv: Record<string, string> = {},
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(["bun", "src/cli.ts", verb, ...args], {
    cwd: pkgDir,
    env: { ...process.env, ...extraEnv },
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

function assertWebp(data: Buffer, label: string): void {
  assert.equal(data.subarray(0, 4).toString("ascii"), "RIFF", `${label} missing RIFF magic`);
  assert.equal(data.subarray(8, 12).toString("ascii"), "WEBP", `${label} missing WEBP magic`);
}

/**
 * Write a fake POSIX realesrgan-ncnn-vulkan that parses `-i <in>`/`-o <out>` and
 * copies the input to the output (a no-op "restore"). The CLI's upscale pre-pass
 * resolves it via REALESRGAN_BIN and treats a non-empty output as a real upscale,
 * so this lets us drive the binary-present path without the heavy real model.
 */
async function writeFakeRealesrgan(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "assetgen-upscale-e2e-bin-"));
  const path = join(dir, "realesrgan-ncnn-vulkan");
  const body = [
    "#!/bin/sh",
    'inp=""; out=""',
    'while [ $# -gt 0 ]; do case "$1" in -i) inp="$2"; shift 2;; -o) out="$2"; shift 2;; *) shift;; esac; done',
    'cp "$inp" "$out"',
    "",
  ].join("\n");
  await writeFile(path, body);
  await chmod(path, 0o755);
  return path;
}

/** Solid 64x64 PNG (luma ~95) so pixelize keeps it as subject, not background. */
async function writeRawFixture(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "assetgen-upscale-e2e-raw-"));
  const path = join(dir, "raw.png");
  await writeFile(
    path,
    await sharp({ create: { width: 64, height: 64, channels: 4, background: { r: 120, g: 90, b: 70, alpha: 1 } } })
      .png()
      .toBuffer(),
  );
  return path;
}

/** Solid 48x48 origin PNG for the expand pipeline (mirrors expand.e2e.test.ts). */
async function writeOriginFixture(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "assetgen-upscale-e2e-origin-"));
  const path = join(dir, "warden.png");
  await writeFile(
    path,
    await sharp({ create: { width: 48, height: 48, channels: 4, background: { r: 120, g: 90, b: 70, alpha: 1 } } })
      .png()
      .toBuffer(),
  );
  return path;
}

test("e2e: pixelize --upscale uses the binary when present (fake realesrgan)", async () => {
  const fakeBin = await writeFakeRealesrgan();
  const raw = await writeRawFixture();
  const workDir = await mkdtemp(join(tmpdir(), "assetgen-upscale-e2e-A-"));
  const out = join(workDir, "sprite.webp");
  try {
    const result = await runCli(
      "pixelize",
      ["--in", raw, "--out", out, "--height", "32", "--upscale"],
      { REALESRGAN_BIN: fakeBin },
    );
    assert.equal(result.exitCode, 0, `cli failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
    assert.equal(existsSync(out), true, "pixelize output sprite must exist");
    assertWebp(await readFile(out), "pixelize sprite");
    // The fake binary produced output, so the pre-pass reports an actual upscale.
    assert.match(result.stdout, /upscaled/, `expected an upscaled pre-pass\nstdout:\n${result.stdout}`);
  } finally {
    await rm(workDir, { recursive: true, force: true });
    await rm(join(raw, ".."), { recursive: true, force: true });
    await rm(join(fakeBin, ".."), { recursive: true, force: true });
  }
});

test("e2e: pixelize --upscale never hard-fails when the upscaler is absent (graceful no-op)", async () => {
  const raw = await writeRawFixture();
  const workDir = await mkdtemp(join(tmpdir(), "assetgen-upscale-e2e-B-"));
  const out2 = join(workDir, "sprite.webp");
  try {
    const result = await runCli(
      "pixelize",
      ["--in", raw, "--out", out2, "--height", "32", "--upscale"],
      { REALESRGAN_BIN: "/nonexistent/realesrgan-ncnn-vulkan" },
    );
    // The acceptance criterion is that a missing upscaler is a silent no-op, never a
    // hard failure. Don't assert on skipped-vs-upscaled wording: a real binary might
    // happen to be installed on PATH, which would flip the message — still exit 0.
    assert.equal(result.exitCode, 0, `cli must not hard-fail\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
    assert.equal(existsSync(out2), true, "pixelize output sprite must exist even without an upscaler");
    assertWebp(await readFile(out2), "pixelize sprite (no upscaler)");
  } finally {
    await rm(workDir, { recursive: true, force: true });
    await rm(join(raw, ".."), { recursive: true, force: true });
  }
});

test("e2e: expand --upscale completes end-to-end on the keyless mock provider (fake realesrgan)", async () => {
  const fakeBin = await writeFakeRealesrgan();
  const origin = await writeOriginFixture();
  const repo = await mkdtemp(join(tmpdir(), "assetgen-upscale-e2e-expand-"));
  try {
    const result = await runCli(
      "expand",
      [
        "--in", origin,
        "--actions", "idle",
        "--dirs", "1",
        "--provider", "mock",
        "--game", "shared",
        "--repo", repo,
        "--usage-log", "off",
        "--size", "48",
        "--frames", "1",
        "--height", "24",
        "--upscale",
      ],
      { REALESRGAN_BIN: fakeBin, SHIPSHIT_ASSETGEN_USAGE_LOG: "off" },
    );
    assert.equal(result.exitCode, 0, `cli failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);

    const sheetPath = join(repo, "src/assets/sprites/warden.anim0.webp");
    assert.equal(existsSync(sheetPath), true, "packed anim sheet must exist");
    assertWebp(await readFile(sheetPath), "anim sheet");
    // The per-frame pre-pass logs `[upscale] ×N via <model>` when the binary runs,
    // so the present-binary path is observably exercised (not just the enable banner).
    assert.match(result.stdout, /\[upscale\] ×\d/, `expected an observed per-frame upscale\nstdout:\n${result.stdout}`);
  } finally {
    await rm(repo, { recursive: true, force: true });
    await rm(join(origin, ".."), { recursive: true, force: true });
    await rm(join(fakeBin, ".."), { recursive: true, force: true });
  }
});

test("e2e: expand --upscale never hard-fails when the upscaler is absent (graceful no-op)", async () => {
  const origin = await writeOriginFixture();
  const repo = await mkdtemp(join(tmpdir(), "assetgen-upscale-e2e-expand-noop-"));
  try {
    const result = await runCli(
      "expand",
      [
        "--in", origin,
        "--actions", "idle",
        "--dirs", "1",
        "--provider", "mock",
        "--game", "shared",
        "--repo", repo,
        "--usage-log", "off",
        "--size", "48",
        "--frames", "1",
        "--height", "24",
        "--upscale",
      ],
      { REALESRGAN_BIN: "/nonexistent/realesrgan-ncnn-vulkan", SHIPSHIT_ASSETGEN_USAGE_LOG: "off" },
    );
    // A missing upscaler must not fail the whole sprite-anim generation; the pre-pass
    // silently no-ops and the sheet still packs. Don't assert wording: a real binary
    // could be on PATH and flip skipped→upscaled, but exit 0 + a sheet must always hold.
    assert.equal(result.exitCode, 0, `cli must not hard-fail\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
    const sheetPath = join(repo, "src/assets/sprites/warden.anim0.webp");
    assert.equal(existsSync(sheetPath), true, "packed anim sheet must exist even without an upscaler");
    assertWebp(await readFile(sheetPath), "anim sheet (no upscaler)");
  } finally {
    await rm(repo, { recursive: true, force: true });
    await rm(join(origin, ".."), { recursive: true, force: true });
  }
});
