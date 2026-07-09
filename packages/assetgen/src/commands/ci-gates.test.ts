import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, test } from "bun:test";

import { buildAssetgenGatePlan } from "./ci-gates.ts";

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "assetgen-ci-gates-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("assetgen ci-gates", () => {
  test("discovers only assetgen-format indexes and known generated outputs", async () => {
    await withTempDir(async (dir) => {
      const assetsDir = join(dir, "assets");
      const gamesRoot = join(dir, "games");
      await mkdir(assetsDir, { recursive: true });
      await mkdir(join(gamesRoot, "scourge-survivors", "src"), { recursive: true });
      await mkdir(join(gamesRoot, "brawl", "src"), { recursive: true });

      await writeFile(
        join(assetsDir, "assets.index.json"),
        JSON.stringify({ version: 1, generatedFrom: "all", assets: [] }),
        "utf8"
      );
      await writeFile(join(assetsDir, "assets.index.schema.json"), JSON.stringify({ type: "object" }), "utf8");
      await writeFile(join(assetsDir, "scourge-survivors.atlas.json"), JSON.stringify({ pages: [], frames: {} }), "utf8");
      await writeFile(join(assetsDir, "brawl.atlas.json"), JSON.stringify({ pages: [], frames: {} }), "utf8");
      await writeFile(join(gamesRoot, "scourge-survivors", "src", "assets.generated.ts"), "export {};\n", "utf8");
      await writeFile(join(gamesRoot, "brawl", "src", "assets.generated.ts"), "export {};\n", "utf8");

      const plan = await buildAssetgenGatePlan({ assetsDir, gamesRoot });

      assert.deepEqual(plan.indexFiles, ["assets.index.json"]);
      assert.deepEqual(plan.skippedIndexFiles, []);
      assert.deepEqual(plan.atlasGames, ["brawl", "scourge-survivors"]);
      assert.deepEqual(plan.codegenTargets.map((target) => target.game), ["brawl", "scourge-survivors"]);
    });
  });

  test("skips package-native index files that do not use assetgen's index format", async () => {
    await withTempDir(async (dir) => {
      const assetsDir = join(dir, "assets");
      const gamesRoot = join(dir, "games");
      await mkdir(assetsDir, { recursive: true });
      await mkdir(gamesRoot, { recursive: true });

      await writeFile(
        join(assetsDir, "assets.index.json"),
        JSON.stringify({
          $schema: "./assets.index.schema.json",
          version: "1",
          generator: "scripts/generate-asset-index.mjs",
          assets: [],
        }),
        "utf8"
      );

      const plan = await buildAssetgenGatePlan({ assetsDir, gamesRoot });

      assert.deepEqual(plan.indexFiles, []);
      assert.deepEqual(plan.skippedIndexFiles, ["assets.index.json"]);
      assert.deepEqual(plan.atlasGames, []);
      assert.deepEqual(plan.codegenTargets, []);
    });
  });
});
