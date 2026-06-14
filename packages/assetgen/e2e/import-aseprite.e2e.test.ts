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
  const proc = Bun.spawn(["bun", "src/cli.ts", "import-aseprite", ...args], {
    cwd: pkgDir,
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

/** Write a PNG + Aseprite JSON pair (idle/run/attack × south/north, 2 frames each) to `dir`. */
async function writeFixture(dir: string): Promise<{ png: string; json: string }> {
  const clips = ["idle", "run", "attack"];
  const facings = ["south", "north"];
  const size = 16;
  const frames: Array<{ filename: string; frame: { x: number; y: number; w: number; h: number }; duration: number }> = [];
  const frameTags: Array<{ name: string; from: number; to: number; direction: string }> = [];
  const overlays: sharp.OverlayOptions[] = [];
  let idx = 0;
  for (const clip of clips) {
    for (const facing of facings) {
      const from = idx;
      for (let f = 0; f < 2; f++) {
        const cell = await sharp({
          create: { width: size, height: size, channels: 4, background: { r: 80 + idx * 6, g: 90 + idx * 4, b: 110, alpha: 1 } },
        }).png().toBuffer();
        overlays.push({ input: cell, left: idx * size, top: 0 });
        frames.push({ filename: `${clip}_${facing}_${f}`, frame: { x: idx * size, y: 0, w: size, h: size }, duration: 125 });
        idx++;
      }
      frameTags.push({ name: `${clip}_${facing}`, from, to: idx - 1, direction: "forward" });
    }
  }
  const png = join(dir, "warden.png");
  await sharp({ create: { width: idx * size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(overlays)
    .png()
    .toFile(png);
  const json = join(dir, "warden.json");
  await writeFile(json, JSON.stringify({ frames, meta: { image: "warden.png", size: { w: idx * size, h: size }, frameTags } }));
  return { png, json };
}

test("e2e: import-aseprite turns a tagged sheet into a sprite-anim entry", async () => {
  const fixtureDir = await mkdtemp(join(tmpdir(), "assetgen-import-e2e-fix-"));
  const repo = await mkdtemp(join(tmpdir(), "assetgen-import-e2e-"));
  try {
    const { png, json } = await writeFixture(fixtureDir);
    const result = await runCli([
      "--in", png,
      "--json", json,
      "--id", "warden",
      "--game", "shared",
      "--repo", repo,
      "--fps", "8",
      "--usage-log", "off",
    ]);
    assert.equal(result.exitCode, 0, `cli failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);

    // packed sheet page 0
    const sheetPath = join(repo, "src/assets/sprites/warden.anim0.webp");
    assert.equal(existsSync(sheetPath), true);
    const sheetBytes = await readFile(sheetPath);
    assertWebp(sheetBytes, "anim sheet");
    const stats = await sharp(sheetBytes).stats();
    assert.ok(stats.channels.some((c) => c.max > 0), "atlas page must contain visible pixels");

    // frame map
    const anim = JSON.parse(await readFile(join(repo, "src/assets/sprites/warden.anim.json"), "utf8"));
    assert.equal(anim.version, 1);
    assert.equal(anim.id, "warden");
    assert.deepEqual(Object.keys(anim.clips), ["idle", "run", "attack"]);
    assert.deepEqual(anim.directions, ["south", "north"]);
    // 3 clips × 2 facings × 2 frames
    assert.equal(anim.frameCount, 12);
    assert.equal(anim.clips.attack.loop, false);
    assert.equal(anim.clips.idle.loop, true);
    assert.equal(anim.clips.run.directions.south.length, 2);
    for (const f of anim.clips.run.directions.south) {
      for (const v of ["page", "x", "y", "w", "h", "duration"]) assert.equal(typeof f[v], "number");
    }

    // sprite-anim manifest entry — same shape the expand path writes
    const manifest = JSON.parse(await readFile(join(repo, "src/assets/assets.json"), "utf8"));
    assert.equal(manifest.assets.length, 1);
    const entry = manifest.assets[0];
    assert.equal(entry.id, "warden");
    assert.equal(entry.kind, "sprite-anim");
    assert.equal(entry.game, "shared");
    assert.equal(entry.path, "sprites/warden.anim0.webp");
    assert.equal(entry.provider, "aseprite");
    assert.deepEqual(entry.clips, ["idle", "run", "attack"]);
    assert.equal(entry.animation, "sprites/warden.anim.json");
    assert.equal(entry.frames, 12);
    assert.equal(entry.license.kind, "sprite-anim");
    assert.equal(entry.license.type, "hand-authored");

    // preview sidecar
    assert.equal(existsSync(join(repo, "src/assets/previews/warden-anim.html")), true);
  } finally {
    await rm(repo, { recursive: true, force: true });
    await rm(fixtureDir, { recursive: true, force: true });
  }
});

test("e2e: import-aseprite derives the id from the sheet filename and reads per-frame timing", async () => {
  const fixtureDir = await mkdtemp(join(tmpdir(), "assetgen-import-e2e-id-"));
  const repo = await mkdtemp(join(tmpdir(), "assetgen-import-e2e-id-repo-"));
  try {
    const { png, json } = await writeFixture(fixtureDir);
    const result = await runCli([
      "--in", png,
      "--json", json,
      "--game", "shared",
      "--repo", repo,
      "--usage-log", "off",
    ]);
    assert.equal(result.exitCode, 0, `cli failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);

    // id derived from "warden.png"
    const anim = JSON.parse(await readFile(join(repo, "src/assets/sprites/warden.anim.json"), "utf8"));
    assert.equal(anim.id, "warden");
    // per-frame durations (125ms each) drive fps = round(1000/125) = 8 with no --fps flag
    assert.equal(anim.fps, 8);
    assert.equal(anim.clips.idle.directions.south[0].duration, 125);

    const manifest = JSON.parse(await readFile(join(repo, "src/assets/assets.json"), "utf8"));
    assert.equal(manifest.assets[0].id, "warden");
  } finally {
    await rm(repo, { recursive: true, force: true });
    await rm(fixtureDir, { recursive: true, force: true });
  }
});

test("e2e: import-aseprite exits non-zero without --in/--json", async () => {
  const onlyIn = await runCli(["--in", "/tmp/x.png"]);
  assert.equal(onlyIn.exitCode, 1);
  assert.match(onlyIn.stderr, /usage:/);

  const neither = await runCli(["--id", "warden"]);
  assert.equal(neither.exitCode, 1);
  assert.match(neither.stderr, /usage:/);
});
