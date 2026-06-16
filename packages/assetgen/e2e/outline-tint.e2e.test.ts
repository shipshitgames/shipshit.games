import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = fileURLToPath(new URL("..", import.meta.url));

async function runGenerate(args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(["bun", "src/cli.ts", "generate", ...args], {
    cwd: pkgDir,
    // No provider keys: the keyless mock provider must serve the whole run.
    env: { ...process.env, SHIPSHIT_ASSETGEN_USAGE_LOG: "off" },
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

test("e2e: generate --outline-tint threads through the toWebp postprocess on the keyless mock provider", async () => {
  const repo = await mkdtemp(join(tmpdir(), "assetgen-outline-tint-e2e-"));
  try {
    const result = await runGenerate([
      "--id", "rune-plate",
      "--prompt", "weathered rune plate",
      "--kind", "texture",
      "--provider", "mock",
      "--game", "shared",
      "--repo", repo,
      "--usage-log", "off",
      "--size", "64",
      "--outline-tint",
      "--outline-tint-strength", "0.6",
      "--outline-tint-threshold", "40",
    ]);
    assert.equal(result.exitCode, 0, `cli failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);

    const assetPath = join(repo, "src/assets/textures/rune-plate.webp");
    assert.equal(existsSync(assetPath), true, "outline-tinted texture must be written");
    assertWebp(await readFile(assetPath), "texture");

    const manifest = JSON.parse(await readFile(join(repo, "src/assets/assets.json"), "utf8"));
    assert.equal(manifest.assets.length, 1);
    const entry = manifest.assets[0];
    assert.equal(entry.id, "rune-plate");
    assert.equal(entry.kind, "texture");
    assert.equal(entry.game, "shared");
    assert.equal(entry.path, "textures/rune-plate.webp");
    assert.equal(entry.provider, "mock");
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test("e2e: generate without --outline-tint still produces the same texture (opt-in, no regression)", async () => {
  const repo = await mkdtemp(join(tmpdir(), "assetgen-outline-tint-off-e2e-"));
  try {
    const result = await runGenerate([
      "--id", "rune-plate",
      "--prompt", "weathered rune plate",
      "--kind", "texture",
      "--provider", "mock",
      "--game", "shared",
      "--repo", repo,
      "--usage-log", "off",
      "--size", "64",
    ]);
    assert.equal(result.exitCode, 0, `cli failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);

    const assetPath = join(repo, "src/assets/textures/rune-plate.webp");
    assert.equal(existsSync(assetPath), true);
    assertWebp(await readFile(assetPath), "texture");
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test("e2e: --outline-tint appears in the generate usage banner", async () => {
  const result = await runGenerate([]);
  assert.equal(result.exitCode, 1);
  assert.match(result.stderr, /--outline-tint/);
});
