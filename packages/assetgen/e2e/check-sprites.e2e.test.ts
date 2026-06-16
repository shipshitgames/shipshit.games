import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

import type { AnimClip, AnimFrame, SpriteAnimSheet } from "../src/expand.ts";
import type { SpriteGeometryReport } from "../src/sprite-geometry.ts";

const pkgDir = fileURLToPath(new URL("..", import.meta.url));

/** Shape of the `--json` payload emitted by `runCheckSpritesCommand`. */
type Report = { ok: boolean; assetsDir: string; game: string | null; reports: SpriteGeometryReport[] };

/** Shape of `<base>.atlas.json` (only the fields the e2e asserts on). */
type Atlas = { frameCount: number; frames: unknown[]; pages: unknown[] };

async function runCli(verb: string, args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(["bun", "src/cli.ts", verb, ...args], {
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

async function writeOriginFixture(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "assetgen-checksprites-origin-"));
  const path = join(dir, "warden.png");
  await writeFile(
    path,
    await sharp({ create: { width: 48, height: 48, channels: 4, background: { r: 120, g: 90, b: 70, alpha: 1 } } })
      .png()
      .toBuffer(),
  );
  return path;
}

const DIRS_4 = ["south", "west", "north", "east"];

/** A clip whose facings each carry `frames` uniform rects laid out along one row. */
function uniformClip(directions: string[], frames: number): AnimClip {
  const dirs: Record<string, AnimFrame[]> = {};
  directions.forEach((facing, di) => {
    dirs[facing] = Array.from({ length: frames }, (_unused, i) => ({
      page: 0,
      x: (di * frames + i) * 20,
      y: 0,
      w: 16,
      h: 16,
      duration: 125,
    }));
  });
  return { loop: true, frames, directions: dirs };
}

/** A minimal-but-valid 4-direction sprite-anim sheet (no real page image needed for structural checks). */
function makeSheet(): SpriteAnimSheet {
  return {
    version: 1,
    id: "ripper",
    game: "shared",
    origin: "ripper.png",
    provider: "mock",
    fps: 8,
    padding: 2,
    anchor: [0.5, 1],
    scale: 1,
    directions: DIRS_4,
    pages: [{ image: "ripper.anim0.webp", width: 400, height: 50 }],
    clips: { idle: uniformClip(DIRS_4, 2), run: uniformClip(DIRS_4, 2) },
    frameCount: DIRS_4.length * 4,
  };
}

test("e2e: check-sprites passes on an expanded sheet and enforces CLI contract flags", async () => {
  const origin = await writeOriginFixture();
  const repo = await mkdtemp(join(tmpdir(), "assetgen-checksprites-e2e-"));
  try {
    const expand = await runCli("expand", [
      "--in", origin,
      "--actions", "idle,run",
      "--dirs", "4",
      "--provider", "mock",
      "--game", "shared",
      "--repo", repo,
      "--usage-log", "off",
      "--size", "48",
      "--frames", "2",
      "--height", "24",
    ]);
    assert.equal(expand.exitCode, 0, `expand failed\nstdout:\n${expand.stdout}\nstderr:\n${expand.stderr}`);

    const assetsDir = join(repo, "src/assets");

    // The freshly expanded sheet (incl. the per-frame pixel pass) satisfies the contract.
    const pass = await runCli("check-sprites", ["--assets-dir", assetsDir, "--game", "shared"]);
    assert.equal(pass.exitCode, 0, `check-sprites failed\nstdout:\n${pass.stdout}\nstderr:\n${pass.stderr}`);
    assert.match(pass.stdout, /satisfy the frame-set geometry contract/);

    // A 4-direction sheet must fail `--dirs 8` (human path: code in stdout, summary in stderr).
    const dirs8 = await runCli("check-sprites", ["--assets-dir", assetsDir, "--game", "shared", "--dirs", "8"]);
    assert.equal(dirs8.exitCode, 1);
    assert.match(dirs8.stdout, /direction-count/);
    assert.match(dirs8.stderr, /violate the frame-set geometry contract/);
    // Same failure under --json names the EXACT violation code (not a substring elsewhere), and
    // keeps stderr machine-clean (the human summary is suppressed).
    const dirs8Json = await runCli("check-sprites", ["--assets-dir", assetsDir, "--game", "shared", "--dirs", "8", "--json"]);
    assert.equal(dirs8Json.exitCode, 1);
    const dirs8Parsed = JSON.parse(dirs8Json.stdout) as Report;
    assert.equal(dirs8Parsed.ok, false);
    assert.deepEqual(dirs8Parsed.reports[0]!.violations.map((v) => v.code), ["direction-count"]);
    assert.doesNotMatch(dirs8Json.stderr, /violate the frame-set geometry contract/);

    // Requiring a state the sheet lacks must fail — verified structurally.
    const states = await runCli("check-sprites", ["--assets-dir", assetsDir, "--game", "shared", "--states", "idle,walk", "--json"]);
    assert.equal(states.exitCode, 1);
    const statesParsed = JSON.parse(states.stdout) as Report;
    assert.deepEqual(statesParsed.reports[0]!.violations.map((v) => v.code), ["missing-state"]);
    assert.equal(statesParsed.reports[0]!.violations[0]!.clip, "walk");

    // --json emits a machine-readable report and still exits 0 when clean.
    const asJson = await runCli("check-sprites", ["--assets-dir", assetsDir, "--game", "shared", "--json"]);
    assert.equal(asJson.exitCode, 0);
    const parsed = JSON.parse(asJson.stdout) as Report;
    assert.equal(parsed.ok, true);
    assert.equal(parsed.reports.length, 1);
    assert.equal(parsed.reports[0]!.assetId, "warden");
    assert.equal(parsed.reports[0]!.ok, true);
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test("e2e: a structurally broken sheet fails check-sprites", async () => {
  const assetsDir = await mkdtemp(join(tmpdir(), "assetgen-checksprites-broken-"));
  try {
    const spritesDir = join(assetsDir, "sprites");
    await mkdir(spritesDir, { recursive: true });

    // Overflow a rect past its declared atlas page → clipped-bounds.
    const sheet = makeSheet();
    sheet.clips.idle!.directions.south![0]!.w = 9999;
    await writeFile(join(spritesDir, "ripper.anim.json"), JSON.stringify(sheet));

    // --no-pixels: there's no page image on disk; the structural pass alone must catch it.
    const broken = await runCli("check-sprites", ["--assets-dir", assetsDir, "--no-pixels"]);
    assert.equal(broken.exitCode, 1);
    assert.match(broken.stdout, /FAIL/);
    assert.match(broken.stdout, /clipped-bounds/);
    assert.match(broken.stderr, /violate the frame-set geometry contract/);
  } finally {
    await rm(assetsDir, { recursive: true, force: true });
  }
});

test("e2e: atlas gates on broken geometry and --no-geometry-check bypasses it", async () => {
  const assetsDir = await mkdtemp(join(tmpdir(), "assetgen-checksprites-atlas-"));
  try {
    const spritesDir = join(assetsDir, "sprites");
    await mkdir(spritesDir, { recursive: true });

    // Broken sheet the atlas gate must reject before packing.
    const sheet = makeSheet();
    sheet.clips.run!.directions.north![1]!.h = 9999;
    await writeFile(join(spritesDir, "ripper.anim.json"), JSON.stringify(sheet));

    // A loose frame to actually pack once the gate is skipped.
    await writeFile(
      join(spritesDir, "hero.png"),
      await sharp({ create: { width: 16, height: 16, channels: 4, background: { r: 200, g: 30, b: 30, alpha: 1 } } })
        .png()
        .toBuffer(),
    );

    // Default: the pre-pack geometry gate fails the run (the diff + summary go to stderr).
    const gated = await runCli("atlas", ["--assets-dir", assetsDir]);
    assert.equal(gated.exitCode, 1);
    assert.match(gated.stderr, /clipped-bounds/);
    assert.match(gated.stderr, /geometry check failed/);
    assert.equal(existsSync(join(assetsDir, "all.atlas.json")), false);

    // --no-geometry-check skips the gate and packs the loose frame.
    const skipped = await runCli("atlas", ["--assets-dir", assetsDir, "--no-geometry-check"]);
    assert.equal(skipped.exitCode, 0, `atlas failed\nstdout:\n${skipped.stdout}\nstderr:\n${skipped.stderr}`);
    assert.match(skipped.stdout, /packed/);
    const mapPath = join(assetsDir, "all.atlas.json");
    assert.equal(existsSync(mapPath), true);
    // The bypassed run produced a real atlas: the loose frame was packed onto a page.
    const atlas = JSON.parse(await readFile(mapPath, "utf8")) as Atlas;
    assert.ok(atlas.frameCount > 0, `expected packed frames, got ${atlas.frameCount}`);
    assert.equal(atlas.frames.length, atlas.frameCount);
    assert.ok(atlas.pages.length > 0, "expected at least one atlas page");
  } finally {
    await rm(assetsDir, { recursive: true, force: true });
  }
});

test("e2e: the pixel pass flags a blank frame and --no-pixels skips it", async () => {
  const assetsDir = await mkdtemp(join(tmpdir(), "assetgen-checksprites-blank-"));
  try {
    const spritesDir = join(assetsDir, "sprites");
    await mkdir(spritesDir, { recursive: true });

    // A real page wide enough for two 16×16 frames side by side; only the LEFT
    // half carries opaque pixels, so the right-hand frame region is blank.
    const page = await sharp({
      create: { width: 32, height: 16, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([
        {
          input: await sharp({ create: { width: 16, height: 16, channels: 4, background: { r: 200, g: 40, b: 40, alpha: 1 } } })
            .png()
            .toBuffer(),
          left: 0,
          top: 0,
        },
      ])
      .webp()
      .toBuffer();
    await writeFile(join(spritesDir, "ghost.anim0.webp"), page);

    // One clip, 1 direction, 2 frames: frame 0 over the opaque half, frame 1 over the transparent half.
    const sheet: SpriteAnimSheet = {
      version: 1,
      id: "ghost",
      game: "shared",
      origin: "ghost.png",
      provider: "mock",
      fps: 8,
      padding: 2,
      anchor: [0.5, 1],
      scale: 1,
      directions: ["south"],
      pages: [{ image: "ghost.anim0.webp", width: 32, height: 16 }],
      clips: {
        idle: {
          loop: true,
          frames: 2,
          directions: {
            south: [
              { page: 0, x: 0, y: 0, w: 16, h: 16, duration: 125 },
              { page: 0, x: 16, y: 0, w: 16, h: 16, duration: 125 },
            ],
          },
        },
      },
      frameCount: 2,
    };
    await writeFile(join(spritesDir, "ghost.anim.json"), JSON.stringify(sheet));

    // Default run reads pixels and flags the transparent frame (structurally valid otherwise).
    const withPixels = await runCli("check-sprites", ["--assets-dir", assetsDir, "--json"]);
    assert.equal(withPixels.exitCode, 1);
    const flagged = JSON.parse(withPixels.stdout) as Report;
    assert.equal(flagged.ok, false);
    assert.deepEqual(flagged.reports[0]!.violations.map((v) => v.code), ["blank-frame"]);
    assert.equal(flagged.reports[0]!.violations[0]!.frameIndex, 1);

    // --no-pixels runs structural checks only, so the same sheet passes.
    const noPixels = await runCli("check-sprites", ["--assets-dir", assetsDir, "--no-pixels"]);
    assert.equal(noPixels.exitCode, 0, `--no-pixels failed\nstdout:\n${noPixels.stdout}\nstderr:\n${noPixels.stderr}`);
    assert.match(noPixels.stdout, /satisfy the frame-set geometry contract/);
  } finally {
    await rm(assetsDir, { recursive: true, force: true });
  }
});
