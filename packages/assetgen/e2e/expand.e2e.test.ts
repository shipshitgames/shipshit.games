import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const pkgDir = fileURLToPath(new URL("..", import.meta.url));

async function runCli(args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(["bun", "src/cli.ts", "expand", ...args], {
    cwd: pkgDir,
    // No provider keys: the mock provider must fill the whole grid keyless.
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

async function writeOriginFixture(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "assetgen-expand-e2e-origin-"));
  const path = join(dir, "warden.png");
  await writeFile(
    path,
    await sharp({ create: { width: 48, height: 48, channels: 4, background: { r: 120, g: 90, b: 70, alpha: 1 } } })
      .png()
      .toBuffer(),
  );
  return path;
}

test("e2e: expand fills a directional sprite-anim from one origin on the keyless mock provider", async () => {
  const origin = await writeOriginFixture();
  const repo = await mkdtemp(join(tmpdir(), "assetgen-expand-e2e-"));
  try {
    const result = await runCli([
      "--in", origin,
      "--actions", "idle,run,attack",
      "--dirs", "4",
      "--provider", "mock",
      "--game", "shared",
      "--repo", repo,
      "--usage-log", "off",
      "--size", "64",
      "--frames", "2",
      "--height", "32",
    ]);
    assert.equal(result.exitCode, 0, `cli failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);

    // packed sheet page 0
    const sheetPath = join(repo, "src/assets/sprites/warden.anim0.webp");
    assert.equal(existsSync(sheetPath), true);
    const sheetBytes = await readFile(sheetPath);
    assertWebp(sheetBytes, "anim sheet");
    // The keyless mock fill grades through the fallback resize, so the packed page
    // must carry visible pixels — a blank/transparent page would still pass assertWebp.
    const stats = await sharp(sheetBytes).stats();
    assert.ok(
      stats.channels.some((c) => c.max > 0),
      "atlas page must contain visible (non-transparent) pixels",
    );

    // frame map
    const anim = JSON.parse(await readFile(join(repo, "src/assets/sprites/warden.anim.json"), "utf8"));
    assert.equal(anim.version, 1);
    assert.equal(anim.id, "warden");
    assert.deepEqual(Object.keys(anim.clips), ["idle", "run", "attack"]);
    assert.equal(anim.directions.length, 4);
    // 3 actions × 4 directions × 2 frames
    assert.equal(anim.frameCount, 24);
    assert.equal(anim.clips.attack.loop, false);
    assert.equal(anim.clips.idle.loop, true);
    assert.equal(anim.clips.run.directions.south.length, 2);
    for (const f of anim.clips.run.directions.south) {
      for (const v of ["page", "x", "y", "w", "h", "duration"]) assert.equal(typeof f[v], "number");
    }

    // sprite-anim manifest entry
    const manifest = JSON.parse(await readFile(join(repo, "src/assets/assets.json"), "utf8"));
    assert.equal(manifest.assets.length, 1);
    const entry = manifest.assets[0];
    assert.equal(entry.id, "warden");
    assert.equal(entry.kind, "sprite-anim");
    assert.equal(entry.game, "shared");
    assert.equal(entry.path, "sprites/warden.anim0.webp");
    assert.equal(entry.provider, "mock");
    assert.deepEqual(entry.clips, ["idle", "run", "attack"]);
    assert.equal(entry.animation, "sprites/warden.anim.json");
    assert.equal(entry.origin, origin);
    assert.equal(entry.frames, 24);
    assert.equal(entry.license.kind, "sprite-anim");
    assert.equal(entry.license.type, "ai-generated");

    // preview sidecar
    assert.equal(existsSync(join(repo, "src/assets/previews/warden-anim.html")), true);
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test("e2e: expand records --method and derives the id from the origin filename", async () => {
  const origin = await writeOriginFixture();
  const repo = await mkdtemp(join(tmpdir(), "assetgen-expand-e2e-method-"));
  try {
    const result = await runCli([
      "--in", origin,
      "--actions", "idle",
      "--dirs", "1",
      "--provider", "mock",
      "--method", "controlnet",
      "--game", "shared",
      "--repo", repo,
      "--usage-log", "off",
      "--size", "48",
      "--frames", "1",
      "--height", "24",
    ]);
    assert.equal(result.exitCode, 0, `cli failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);

    const anim = JSON.parse(await readFile(join(repo, "src/assets/sprites/warden.anim.json"), "utf8"));
    assert.equal(anim.method, "controlnet");
    assert.equal(anim.frameCount, 1);
    assert.deepEqual(anim.directions, ["south"]);

    const manifest = JSON.parse(await readFile(join(repo, "src/assets/assets.json"), "utf8"));
    assert.equal(manifest.assets[0].id, "warden");
    assert.equal(manifest.assets[0].path, "sprites/warden.anim0.webp");
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test("e2e: video expand runs keyless mock clip -> cleanup -> pixelize -> pack -> manifest", async () => {
  const origin = await writeOriginFixture();
  const repo = await mkdtemp(join(tmpdir(), "assetgen-expand-e2e-video-"));
  try {
    const result = await runCli([
      "--in", origin,
      "--actions", "idle:2,attack:2",
      "--dirs", "1",
      "--provider", "mock",
      "--method", "video",
      "--game", "shared",
      "--repo", repo,
      "--usage-log", "off",
      "--size", "48",
      "--height", "24",
    ]);
    assert.equal(result.exitCode, 0, `cli failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);

    const anim = JSON.parse(await readFile(join(repo, "src/assets/sprites/warden.anim.json"), "utf8"));
    assert.equal(anim.method, "video");
    assert.equal(anim.provider, "mock");
    assert.equal(anim.model, "mock-video");
    assert.equal(anim.frameCount, 4);
    assert.equal(anim.video.keyColor, "#00ff00");
    assert.ok(anim.video.keyedPixels > 0);
    assert.ok(anim.video.lockedPixels > 0);
    assert.equal(existsSync(join(repo, "src/assets/previews/warden-video-cleanup.webp")), true);

    const manifest = JSON.parse(await readFile(join(repo, "src/assets/assets.json"), "utf8"));
    assert.equal(manifest.assets[0].kind, "sprite-anim");
    assert.equal(manifest.assets[0].provider, "mock");
    assert.deepEqual(manifest.assets[0].referenceImages, [origin]);
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test("e2e: expand exits non-zero without --in", async () => {
  const result = await runCli(["--actions", "idle"]);
  assert.equal(result.exitCode, 1);
  assert.match(result.stderr, /usage:/);
});
