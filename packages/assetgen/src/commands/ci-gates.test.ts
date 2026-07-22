import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "bun:test";

import {
  buildAssetgenGatePlan,
  executeAssetgenGatePlan,
  parseAssetgenGateManifest,
  type AssetgenGateManifest,
} from "./ci-gates.ts";

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "assetgen-ci-gates-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function manifest(
  overrides: Partial<AssetgenGateManifest> = {},
): AssetgenGateManifest {
  return {
    schemaVersion: 1,
    package: "@deadrot/assets",
    mode: "enforced",
    targets: { indexes: ["assets.index.json"], atlases: [], codegen: [] },
    ...overrides,
  };
}

async function writeManifest(
  dir: string,
  value: AssetgenGateManifest,
): Promise<string> {
  const path = join(dir, "assetgen-ci-gates.json");
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return path;
}

describe("assetgen ci-gates manifest", () => {
  test("requires an explicit reason for an explicit zero-target state", () => {
    assert.deepEqual(
      parseAssetgenGateManifest(
        manifest({
          mode: "native-only",
          reason:
            "The package uses its native index until assetgen targets are adopted.",
          targets: { indexes: [], atlases: [], codegen: [] },
        }),
      ),
      manifest({
        mode: "native-only",
        reason:
          "The package uses its native index until assetgen targets are adopted.",
        targets: { indexes: [], atlases: [], codegen: [] },
      }),
    );

    assert.throws(
      () =>
        parseAssetgenGateManifest(
          manifest({
            mode: "native-only",
            targets: { indexes: [], atlases: [], codegen: [] },
          }),
        ),
      /native-only mode requires a reason/,
    );
    assert.throws(
      () =>
        parseAssetgenGateManifest(
          manifest({ targets: { indexes: [], atlases: [], codegen: [] } }),
        ),
      /enforced mode requires at least one target/,
    );
  });

  test("rejects unknown fields, unsafe index paths, and duplicate targets", () => {
    assert.throws(
      () => parseAssetgenGateManifest({ ...manifest(), accidental: true }),
      /unknown field\(s\): accidental/,
    );
    assert.throws(
      () =>
        parseAssetgenGateManifest(
          manifest({
            targets: {
              indexes: ["../assets.index.json"],
              atlases: [],
              codegen: [],
            },
          }),
        ),
      /relative to the assets directory/,
    );
    assert.throws(
      () =>
        parseAssetgenGateManifest(
          manifest({
            targets: {
              indexes: [],
              atlases: ["deadlane", "deadlane"],
              codegen: [],
            },
          }),
        ),
      /duplicate "deadlane"/,
    );
  });
});

describe("assetgen ci-gates plan", () => {
  test("accepts only an exact declaration of every discovered target", async () => {
    await withTempDir(async (dir) => {
      const assetsDir = join(dir, "assets");
      const gamesRoot = join(dir, "games");
      await mkdir(assetsDir, { recursive: true });
      await mkdir(join(gamesRoot, "deadlane", "src"), { recursive: true });
      await writeFile(
        join(assetsDir, "assets.index.json"),
        JSON.stringify({ version: 1, generatedFrom: "all", assets: [] }),
        "utf8",
      );
      await writeFile(
        join(assetsDir, "deadlane.atlas.json"),
        JSON.stringify({ pages: [], frames: {} }),
        "utf8",
      );
      await writeFile(
        join(gamesRoot, "deadlane", "src", "assets.generated.ts"),
        "export {};\n",
        "utf8",
      );
      const configPath = await writeManifest(
        dir,
        manifest({
          targets: {
            indexes: ["assets.index.json"],
            atlases: ["deadlane"],
            codegen: ["deadlane"],
          },
        }),
      );

      const plan = await buildAssetgenGatePlan({
        assetsDir,
        gamesRoot,
        configPath,
      });

      assert.equal(plan.mode, "enforced");
      assert.deepEqual(plan.indexFiles, ["assets.index.json"]);
      assert.deepEqual(plan.atlasGames, ["deadlane"]);
      assert.deepEqual(plan.codegenTargets, [
        {
          game: "deadlane",
          out: join(gamesRoot, "deadlane", "src", "assets.generated.ts"),
        },
      ]);
    });
  });

  test("fails when a declared target is missing or an undeclared target appears", async () => {
    await withTempDir(async (dir) => {
      const assetsDir = join(dir, "assets");
      const gamesRoot = join(dir, "games");
      await mkdir(assetsDir, { recursive: true });
      await mkdir(gamesRoot, { recursive: true });

      const missingConfig = await writeManifest(dir, manifest());
      await assert.rejects(
        buildAssetgenGatePlan({
          assetsDir,
          gamesRoot,
          configPath: missingConfig,
        }),
        /declared index target\(s\) missing: assets\.index\.json/,
      );

      await writeFile(
        join(assetsDir, "assets.index.json"),
        JSON.stringify({ version: 1, generatedFrom: "all", assets: [] }),
        "utf8",
      );
      const nativeOnlyConfig = await writeManifest(
        dir,
        manifest({
          mode: "native-only",
          reason: "No assetgen targets are adopted yet.",
          targets: { indexes: [], atlases: [], codegen: [] },
        }),
      );
      await assert.rejects(
        buildAssetgenGatePlan({
          assetsDir,
          gamesRoot,
          configPath: nativeOnlyConfig,
        }),
        /undeclared index target\(s\) found: assets\.index\.json/,
      );
    });
  });

  test("runs exactly the declared check commands and propagates stale failures", async () => {
    await withTempDir(async (dir) => {
      const assetsDir = join(dir, "assets");
      const gamesRoot = join(dir, "games");
      await mkdir(assetsDir, { recursive: true });
      await mkdir(join(gamesRoot, "deadlane", "src"), { recursive: true });
      await writeFile(
        join(assetsDir, "assets.index.json"),
        JSON.stringify({ version: 1, generatedFrom: "all", assets: [] }),
        "utf8",
      );
      await writeFile(
        join(assetsDir, "deadlane.atlas.json"),
        JSON.stringify({ pages: [], frames: {} }),
        "utf8",
      );
      await writeFile(
        join(gamesRoot, "deadlane", "src", "assets.generated.ts"),
        "export {};\n",
        "utf8",
      );
      const configPath = await writeManifest(
        dir,
        manifest({
          targets: {
            indexes: ["assets.index.json"],
            atlases: ["deadlane"],
            codegen: ["deadlane"],
          },
        }),
      );
      const plan = await buildAssetgenGatePlan({
        assetsDir,
        gamesRoot,
        configPath,
      });
      const commands: string[][] = [];

      await executeAssetgenGatePlan(plan, async (args) => {
        commands.push(args);
      });

      assert.equal(commands.length, 3);
      assert.equal(
        commands.every((args) => args[0]?.endsWith("/cli.ts")),
        true,
      );
      assert.deepEqual(
        commands.map((args) => args[1]),
        ["check", "atlas", "codegen"],
      );
      assert.deepEqual(commands[1]?.slice(2), [
        "--game",
        "deadlane",
        "--assets-dir",
        assetsDir,
        "--out-dir",
        assetsDir,
        "--name",
        "deadlane",
        "--check",
      ]);

      await assert.rejects(
        executeAssetgenGatePlan(plan, async (args) => {
          if (args[1] === "atlas") throw new Error("atlas target is stale");
        }),
        /atlas target is stale/,
      );
    });
  });
});
