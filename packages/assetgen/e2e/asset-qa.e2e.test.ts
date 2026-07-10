import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "bun:test";

import {
  encodeWebp,
  runAssetQaCheck,
  runAssetQaRepair,
  webpEncodingKind,
  type AssetQaManifest,
  type RgbaImage,
} from "../src/asset-qa/index.ts";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));

function image(width: number, height: number, pixels: number[][]): RgbaImage {
  const data = Buffer.alloc(width * height * 4);
  for (const [x = 0, y = 0, red = 0, green = 0, blue = 0, alpha = 0] of pixels) {
    data.set([red, green, blue, alpha], (y * width + x) * 4);
  }
  return { data, width, height };
}

async function writeManifest(path: string, manifest: AssetQaManifest): Promise<void> {
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function runCli(args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const process = Bun.spawn(["bun", "src/cli.ts", "asset-qa", ...args], {
    cwd: packageRoot,
    env: { ...globalThis.process.env, SHIPSHIT_ASSETGEN_USAGE_LOG: "off" },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  return { exitCode, stdout, stderr };
}

test("e2e: asset-qa check is deterministic and byte-for-byte read-only; repair is explicit and idempotent", async () => {
  const root = await mkdtemp(join(tmpdir(), "assetgen-asset-qa-e2e-"));
  try {
    const targetPath = join(root, "sprite.webp");
    const manifestPath = join(root, "asset-qa.json");
    const source = image(5, 5, [
      [1, 1, 8, 8, 8, 120],
      [2, 1, 235, 220, 190, 255],
      [1, 2, 205, 35, 28, 255],
      [2, 2, 235, 220, 190, 255],
    ]);
    await writeFile(targetPath, await encodeWebp(source, { format: "webp", lossless: true, exact: true }));
    await writeManifest(manifestPath, {
      schemaVersion: 1,
      targets: [
        {
          id: "sprite",
          path: "sprite.webp",
          checks: {
            dimensions: { width: 5, height: 5 },
            alpha: { minMargins: 1, maxBorderPixels: 0, maxDarkFringePixels: 0 },
            webpEncoding: "lossless",
          },
          repair: {
            rematte: { mode: "dark-fringe", maxPasses: 2 },
            output: { format: "webp", lossless: true, exact: true },
          },
        },
      ],
    });

    const beforeBytes = await readFile(targetPath);
    const beforeStat = await stat(targetPath);
    const first = await runAssetQaCheck({ manifestPath });
    const second = await runAssetQaCheck({ manifestPath });
    assert.deepEqual(second, first);
    assert.equal(first.ok, false);
    assert.deepEqual(first.targets[0]?.diagnostics.map((diagnostic) => diagnostic.code), ["dark-alpha-fringe"]);
    assert.deepEqual(await readFile(targetPath), beforeBytes);
    assert.equal((await stat(targetPath)).mtimeMs, beforeStat.mtimeMs);

    const repaired = await runAssetQaRepair({ manifestPath });
    assert.equal(repaired.ok, true);
    assert.equal(repaired.targets[0]?.changed, true);
    assert.equal(repaired.targets[0]?.remattedPixels, 1);
    assert.equal(repaired.targets[0]?.validation.metrics?.alpha.darkFringePixels, 0);
    assert.equal(webpEncodingKind(await readFile(targetPath)), "lossless");

    const repeated = await runAssetQaRepair({ manifestPath });
    assert.equal(repeated.ok, true);
    assert.equal(repeated.targets[0]?.changed, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("e2e: asset-qa repair converges when a single pass at maxPasses:1 fully repairs", async () => {
  const root = await mkdtemp(join(tmpdir(), "assetgen-asset-qa-converge-"));
  try {
    const targetPath = join(root, "sprite.webp");
    const manifestPath = join(root, "asset-qa.json");
    // One dark fringe pixel that rematteDarkFringe repairs in a single pass.
    const source = image(5, 5, [
      [1, 1, 8, 8, 8, 120],
      [2, 1, 235, 220, 190, 255],
      [1, 2, 205, 35, 28, 255],
      [2, 2, 235, 220, 190, 255],
    ]);
    await writeFile(targetPath, await encodeWebp(source, { format: "webp", lossless: true, exact: true }));
    await writeManifest(manifestPath, {
      schemaVersion: 1,
      targets: [
        {
          id: "sprite",
          path: "sprite.webp",
          checks: { alpha: { maxDarkFringePixels: 0 }, webpEncoding: "lossless" },
          repair: {
            // maxPasses:1 budgets one mutating pass; the fix still allows a
            // final zero-change pass to observe convergence instead of throwing.
            rematte: { mode: "dark-fringe", maxPasses: 1 },
            output: { format: "webp", lossless: true, exact: true },
          },
        },
      ],
    });

    const repaired = await runAssetQaRepair({ manifestPath });
    assert.equal(repaired.ok, true);
    assert.equal(repaired.targets[0]?.changed, true);
    assert.equal(repaired.targets[0]?.remattedPixels, 1);
    assert.equal(repaired.targets[0]?.validation.metrics?.alpha.darkFringePixels, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("e2e: asset-qa repair applies a declared multi-cell pad and validates the output", async () => {
  const root = await mkdtemp(join(tmpdir(), "assetgen-asset-qa-pad-"));
  try {
    const sourcePath = join(root, "source.webp");
    const targetPath = join(root, "padded.webp");
    const manifestPath = join(root, "asset-qa.json");
    const source = image(6, 2, [
      [0, 0, 10, 0, 0, 255],
      [1, 0, 20, 0, 0, 255],
      [2, 0, 30, 0, 0, 255],
      [3, 0, 40, 0, 0, 255],
      [4, 0, 50, 0, 0, 255],
      [5, 0, 60, 0, 0, 255],
    ]);
    await writeFile(sourcePath, await encodeWebp(source, { format: "webp", lossless: true }));
    await writeManifest(manifestPath, {
      schemaVersion: 1,
      targets: [
        {
          id: "padded-sheet",
          path: "padded.webp",
          checks: {
            dimensions: { width: 12, height: 4 },
            alpha: { minMargins: 1, maxBorderPixels: 0 },
            webpEncoding: "lossless",
          },
          repair: {
            source: "source.webp",
            expectedSource: { width: 6, height: 2 },
            padHorizontalCells: {
              columns: 3,
              padding: { left: 1, right: 1, top: 1, bottom: 1 },
            },
            output: { format: "webp", lossless: true },
          },
        },
      ],
    });

    const before = await runAssetQaCheck({ manifestPath });
    assert.equal(before.ok, false);
    assert.equal(before.targets[0]?.diagnostics[0]?.code, "target-unreadable");
    const repair = await runAssetQaRepair({ manifestPath });
    assert.equal(repair.ok, true);
    assert.equal(repair.targets[0]?.changed, true);
    assert.deepEqual(repair.targets[0]?.validation.metrics?.alpha.margins, { left: 1, top: 1, right: 1, bottom: 2 });
    assert.equal((await stat(targetPath)).size > 0, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("e2e: asset-qa repair crops declared atlas bounds with validated transparent margins", async () => {
  const root = await mkdtemp(join(tmpdir(), "assetgen-asset-qa-crop-"));
  try {
    const atlasPath = join(root, "atlas.webp");
    const targetPath = join(root, "prop.webp");
    const manifestPath = join(root, "asset-qa.json");
    const atlasPixels: number[][] = [];
    for (let y = 2; y <= 3; y += 1) {
      for (let x = 2; x <= 4; x += 1) atlasPixels.push([x, y, 180, 90, 40, 255]);
    }
    await writeFile(atlasPath, await encodeWebp(image(8, 6, atlasPixels), { format: "webp", lossless: true }));
    await writeManifest(manifestPath, {
      schemaVersion: 1,
      targets: [
        {
          id: "atlas-prop",
          path: "prop.webp",
          checks: {
            dimensions: { width: 7, height: 6 },
            alpha: { minMargins: 2, maxBorderPixels: 0 },
            webpEncoding: "lossless",
          },
          repair: {
            source: "atlas.webp",
            expectedSource: { width: 8, height: 6 },
            crop: { bounds: { minX: 2, minY: 2, maxX: 4, maxY: 3 }, padding: 2 },
            output: { format: "webp", lossless: true },
          },
        },
      ],
    });

    const repair = await runAssetQaRepair({ manifestPath });
    assert.equal(repair.ok, true);
    assert.deepEqual(repair.targets[0]?.validation.metrics?.alpha.margins, { left: 2, top: 2, right: 2, bottom: 2 });
    assert.equal((await stat(targetPath)).size > 0, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("e2e: asset-qa enforces physical root containment across symlinked directories", async () => {
  const base = await mkdtemp(join(tmpdir(), "assetgen-asset-qa-symlink-"));
  try {
    const root = join(base, "root");
    const outside = join(base, "outside");
    await mkdir(root);
    await mkdir(outside);
    await mkdir(join(root, "real"));
    await symlink(join(base, "outside"), join(root, "dist"), "dir");
    await symlink(join(root, "real"), join(root, "alias"), "dir");
    const manifestPath = join(root, "asset-qa.json");

    // A symlinked directory component that leaves the root must fail before
    // any target is read or written, for both check and repair.
    await writeManifest(manifestPath, {
      schemaVersion: 1,
      targets: [
        {
          id: "escaping",
          path: "dist/sprite.webp",
          checks: { webpEncoding: "lossless" },
          repair: { output: { format: "webp", lossless: true } },
        },
      ],
    });
    await assert.rejects(() => runAssetQaCheck({ manifestPath }), /escapes the manifest root/);
    await assert.rejects(() => runAssetQaRepair({ manifestPath }), /escapes the manifest root/);
    assert.deepEqual(await Array.fromAsync(new Bun.Glob("*").scan({ cwd: outside })), []);

    // A symlink that stays inside the root remains a valid product layout.
    await writeFile(
      join(root, "real", "sprite.webp"),
      await encodeWebp(image(2, 2, [[0, 0, 90, 60, 30, 255]]), { format: "webp", lossless: true }),
    );
    await writeManifest(manifestPath, {
      schemaVersion: 1,
      targets: [{ id: "contained", path: "alias/sprite.webp", checks: { webpEncoding: "lossless" } }],
    });
    const contained = await runAssetQaCheck({ manifestPath });
    assert.equal(contained.ok, true);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test("e2e: asset-qa repair fails malformed --target and --root flags instead of widening scope", async () => {
  const root = await mkdtemp(join(tmpdir(), "assetgen-asset-qa-flags-"));
  try {
    const manifestPath = join(root, "asset-qa.json");
    const pixels: number[][] = [[0, 0, 90, 60, 30, 255]];
    for (const name of ["sprite-a", "sprite-b"]) {
      await writeFile(
        join(root, `${name}.webp`),
        await encodeWebp(image(2, 2, pixels), { format: "webp", lossless: false, quality: 80 }),
      );
    }
    await writeManifest(manifestPath, {
      schemaVersion: 1,
      targets: ["sprite-a", "sprite-b"].map((name) => ({
        id: name,
        path: `${name}.webp`,
        checks: { webpEncoding: "lossless" as const },
        repair: { output: { format: "webp" as const, lossless: true } },
      })),
    });
    const before = {
      a: await readFile(join(root, "sprite-a.webp")),
      b: await readFile(join(root, "sprite-b.webp")),
    };

    // A --target whose id is missing or swallowed by the next flag must fail
    // before any mutation instead of silently selecting every target.
    for (const args of [
      ["repair", "--manifest", manifestPath, "--target", "--json"],
      ["repair", "--manifest", manifestPath, "--target"],
    ]) {
      const run = await runCli(args);
      assert.equal(run.exitCode, 1);
      assert.match(run.stderr, /--target requires a target id/);
    }
    const rootless = await runCli(["check", "--manifest", manifestPath, "--root"]);
    assert.equal(rootless.exitCode, 1);
    assert.match(rootless.stderr, /--root requires a directory path/);
    assert.deepEqual(await readFile(join(root, "sprite-a.webp")), before.a);
    assert.deepEqual(await readFile(join(root, "sprite-b.webp")), before.b);

    // A well-formed --target still repairs only the selected target.
    const scoped = await runCli(["repair", "--manifest", manifestPath, "--target", "sprite-a"]);
    assert.equal(scoped.exitCode, 0, scoped.stderr);
    assert.notDeepEqual(await readFile(join(root, "sprite-a.webp")), before.a);
    assert.deepEqual(await readFile(join(root, "sprite-b.webp")), before.b);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("e2e: asset-qa CLI emits machine-readable diagnostics and failure exit codes", async () => {
  const root = await mkdtemp(join(tmpdir(), "assetgen-asset-qa-cli-"));
  try {
    const targetPath = join(root, "sprite.webp");
    const manifestPath = join(root, "asset-qa.json");
    await writeFile(
      targetPath,
      await encodeWebp(image(2, 2, [[1, 1, 220, 180, 130, 255]]), { format: "webp", lossless: true }),
    );
    const manifest: AssetQaManifest = {
      schemaVersion: 1,
      targets: [{ id: "sprite", path: "sprite.webp", checks: { dimensions: { width: 2, height: 2 } } }],
    };
    await writeManifest(manifestPath, manifest);
    const passed = await runCli(["check", "--manifest", manifestPath, "--json"]);
    assert.equal(passed.exitCode, 0, passed.stderr);
    assert.equal((JSON.parse(passed.stdout) as { ok: boolean }).ok, true);

    manifest.targets[0]!.checks.dimensions!.width = 3;
    await writeManifest(manifestPath, manifest);
    const failed = await runCli(["check", "--manifest", manifestPath, "--json"]);
    assert.equal(failed.exitCode, 1);
    assert.equal(failed.stderr, "");
    const report = JSON.parse(failed.stdout) as { ok: boolean; targets: Array<{ diagnostics: Array<{ code: string }> }> };
    assert.equal(report.ok, false);
    assert.deepEqual(report.targets[0]?.diagnostics.map((diagnostic) => diagnostic.code), ["width-mismatch"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
