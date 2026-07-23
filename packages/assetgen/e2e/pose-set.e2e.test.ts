import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import sharp from "sharp";

const pkgDir = fileURLToPath(new URL("..", import.meta.url));

test("e2e: pose-set generates the canonical library from a promoted catalog variant", async () => {
  const assetsDir = await mkdtemp(join(tmpdir(), "assetgen-pose-set-e2e-"));
  try {
    const sourceRel = "entities/scourge-swarm/scourge-survivors.png";
    const sourcePath = join(assetsDir, sourceRel);
    await mkdir(join(assetsDir, "entities/scourge-swarm"), { recursive: true });
    await writeFile(
      sourcePath,
      await sharp({
        create: {
          width: 32,
          height: 48,
          channels: 4,
          background: { r: 90, g: 45, b: 35, alpha: 1 },
        },
      })
        .png()
        .toBuffer(),
    );
    await writeFile(
      join(assetsDir, "assets-catalog.json"),
      JSON.stringify({
        version: "test",
        entities: [
          {
            id: "scourge-swarm",
            promptBase:
              "Scourge swarm parasite wearing a conquered rot-flesh host",
            variants: { "scourge-survivors": sourceRel },
          },
        ],
        shared: [],
      }),
    );

    const proc = Bun.spawn(
      [
        "bun",
        "src/cli.ts",
        "pose-set",
        "--entity",
        "scourge-swarm",
        "--game",
        "scourge-survivors",
        "--assets-dir",
        assetsDir,
        "--provider",
        "mock",
        "--size",
        "48",
        "--height",
        "24",
        "--usage-log",
        "off",
      ],
      { cwd: pkgDir, stdout: "pipe", stderr: "pipe" },
    );
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    assert.equal(
      exitCode,
      0,
      `cli failed\nstdout:\n${stdout}\nstderr:\n${stderr}`,
    );

    const root = join(
      assetsDir,
      "sources/pose-sets/scourge-swarm/scourge-survivors",
    );
    const manifest = JSON.parse(
      await readFile(join(root, "pose-set.json"), "utf8"),
    );
    assert.deepEqual(Object.keys(manifest.poses), [
      "idle",
      "walk",
      "attack",
      "hit",
      "death",
    ]);
    assert.equal(manifest.source.image, sourceRel);
    assert.equal(manifest.design.palette, "doom");
    for (const pose of Object.values(manifest.poses) as Array<{
      image: string;
      license: { kind: string };
    }>) {
      assert.equal(existsSync(join(assetsDir, pose.image)), true);
      assert.equal(pose.license.kind, "pose-reference");
    }
  } finally {
    await rm(assetsDir, { recursive: true, force: true });
  }
});
