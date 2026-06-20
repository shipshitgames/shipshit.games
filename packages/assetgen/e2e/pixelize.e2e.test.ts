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
 * Write a fake POSIX `rembg` that parses `i <in> <out>` and copies the input to the
 * output (a no-op "cutout"). The CLI resolves it via REMBG_BIN and treats a
 * non-empty output as a real cutout, so this drives the binary-present path without
 * the heavy real model + its first-run download.
 */
async function writeFakeRembg(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "assetgen-pixelize-e2e-bin-"));
  const path = join(dir, "rembg");
  const body = [
    "#!/bin/sh",
    'inp=""; out=""',
    "shift", // drop the `i` subcommand
    'while [ $# -gt 0 ]; do',
    '  if [ -z "$inp" ]; then inp="$1"; elif [ -z "$out" ]; then out="$1"; fi',
    "  shift",
    "done",
    'cp "$inp" "$out"',
    "",
  ].join("\n");
  await writeFile(path, body);
  await chmod(path, 0o755);
  return path;
}

/** Bright subject square on a near-black void → a real edge-connected background. */
async function writeRawFixture(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "assetgen-pixelize-e2e-raw-"));
  const path = join(dir, "raw.png");
  await writeFile(
    path,
    await sharp({ create: { width: 64, height: 64, channels: 4, background: { r: 8, g: 8, b: 8, alpha: 1 } } })
      .composite([
        {
          input: {
            create: { width: 32, height: 32, channels: 4, background: { r: 150, g: 90, b: 70, alpha: 1 } },
          },
          left: 16,
          top: 16,
        },
      ])
      .png()
      .toBuffer(),
  );
  return path;
}

test("e2e: pixelize --cutout auto uses rembg when present (fake rembg)", async () => {
  const fakeBin = await writeFakeRembg();
  const raw = await writeRawFixture();
  const workDir = await mkdtemp(join(tmpdir(), "assetgen-pixelize-e2e-A-"));
  const out = join(workDir, "sprite.webp");
  try {
    const result = await runCli(
      "pixelize",
      ["--in", raw, "--out", out, "--height", "32", "--cutout", "auto"],
      { REMBG_BIN: fakeBin },
    );
    assert.equal(result.exitCode, 0, `cli failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
    assert.equal(existsSync(out), true, "pixelize output sprite must exist");
    assertWebp(await readFile(out), "pixelize sprite");
    assert.match(result.stdout, /cutout: rembg/, `expected the rembg cutout path\nstdout:\n${result.stdout}`);
  } finally {
    await rm(workDir, { recursive: true, force: true });
    await rm(join(raw, ".."), { recursive: true, force: true });
    await rm(join(fakeBin, ".."), { recursive: true, force: true });
  }
});

test("e2e: pixelize --cutout auto falls back to the flood-fill when rembg is absent", async () => {
  const raw = await writeRawFixture();
  const workDir = await mkdtemp(join(tmpdir(), "assetgen-pixelize-e2e-B-"));
  const out = join(workDir, "sprite.webp");
  try {
    const result = await runCli(
      "pixelize",
      ["--in", raw, "--out", out, "--height", "32", "--cutout", "auto"],
      { REMBG_BIN: "/nonexistent/rembg" },
    );
    // The acceptance criterion is that a missing rembg is a silent fallback, never a
    // hard failure. Don't assert the tool wording (a real rembg could be on PATH and
    // flip flood→rembg) — exit 0 + a valid webp must always hold.
    assert.equal(result.exitCode, 0, `cli must not hard-fail\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
    assert.equal(existsSync(out), true, "pixelize output sprite must exist even without rembg");
    assertWebp(await readFile(out), "pixelize sprite (no rembg)");
    assert.match(result.stdout, /cutout: (flood-fill|rembg)/, `expected a cutout line\nstdout:\n${result.stdout}`);
  } finally {
    await rm(workDir, { recursive: true, force: true });
    await rm(join(raw, ".."), { recursive: true, force: true });
  }
});

test("e2e: pixelize --cutout flood forces the flood-fill regardless of rembg", async () => {
  const fakeBin = await writeFakeRembg();
  const raw = await writeRawFixture();
  const workDir = await mkdtemp(join(tmpdir(), "assetgen-pixelize-e2e-C-"));
  const out = join(workDir, "sprite.webp");
  try {
    const result = await runCli(
      "pixelize",
      ["--in", raw, "--out", out, "--height", "32", "--cutout", "flood"],
      { REMBG_BIN: fakeBin },
    );
    assert.equal(result.exitCode, 0, `cli failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
    assertWebp(await readFile(out), "pixelize sprite (forced flood)");
    assert.match(result.stdout, /cutout: flood-fill/, `expected the flood-fill\nstdout:\n${result.stdout}`);
  } finally {
    await rm(workDir, { recursive: true, force: true });
    await rm(join(raw, ".."), { recursive: true, force: true });
    await rm(join(fakeBin, ".."), { recursive: true, force: true });
  }
});

test("e2e: pixelize rejects an unknown palette", async () => {
  const raw = await writeRawFixture();
  const workDir = await mkdtemp(join(tmpdir(), "assetgen-pixelize-e2e-D-"));
  const out = join(workDir, "sprite.webp");
  try {
    const result = await runCli("pixelize", ["--in", raw, "--out", out, "--palette", "nebula"]);
    assert.notEqual(result.exitCode, 0, "unknown palette must be a hard error");
    assert.match(result.stderr, /unknown palette/, `expected an unknown-palette error\nstderr:\n${result.stderr}`);
    assert.equal(existsSync(out), false, "no output should be written for a bad palette");
  } finally {
    await rm(workDir, { recursive: true, force: true });
    await rm(join(raw, ".."), { recursive: true, force: true });
  }
});
