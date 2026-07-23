import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, test } from "node:test";
import Ajv2020 from "ajv/dist/2020";
import sharp from "sharp";

import schema from "../pose-set.schema.json";
import {
  CANONICAL_POSES,
  generatePoseSet,
  parsePoseSetManifest,
} from "./pose-set.ts";
import type { PoseGenerator } from "./pose-set.ts";

const temps: string[] = [];
const exampleDir = fileURLToPath(
  new URL("../examples/pose-sets/scourge-swarm", import.meta.url),
);

afterEach(async () => {
  while (temps.length > 0)
    await rm(temps.pop()!, { recursive: true, force: true });
});

async function tempAssetsDir(
  variant: unknown = "entities/scourge-swarm/scourge-survivors.png",
): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "assetgen-pose-set-"));
  temps.push(root);
  await writeFile(
    join(root, "assets-catalog.json"),
    JSON.stringify({
      version: "test",
      entities: [
        {
          id: "scourge-swarm",
          promptBase:
            "Scourge swarm parasite wearing a conquered rot-flesh host",
          variants: { "scourge-survivors": variant },
        },
      ],
      shared: [],
    }),
  );
  if (typeof variant === "string" && !variant.includes("..")) {
    const path = join(root, variant);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(
      path,
      await sharp({
        create: {
          width: 32,
          height: 48,
          channels: 4,
          background: { r: 80, g: 40, b: 35, alpha: 1 },
        },
      })
        .png()
        .toBuffer(),
    );
  }
  return root;
}

const generator: PoseGenerator = async ({ pose, prompt, now, seed }) => {
  const index = CANONICAL_POSES.indexOf(pose);
  const data = await sharp({
    create: {
      width: 24 + index,
      height: 32,
      channels: 4,
      background: { r: 122, g: 15, b: 22, alpha: 1 },
    },
  })
    .webp({ lossless: true })
    .toBuffer();
  return {
    data,
    provider: "mock",
    model: "mock-pose",
    provenance: {
      provider: "mock",
      model: "mock-pose",
      ...(seed === undefined ? {} : { seed }),
      reproducible: true,
      promptHash: shortHash(prompt),
      styleSuffixHash: "0123456789abcdef",
      date: now.toISOString().slice(0, 10),
    },
  };
};

test("pose-set schema compiles and accepts the checked-in complete Scourge example", async () => {
  const validate = new Ajv2020({ strict: true }).compile(schema as object);
  const manifest = JSON.parse(
    await readFile(join(exampleDir, "pose-set.json"), "utf8"),
  );
  assert.equal(validate(manifest), true, JSON.stringify(validate.errors));
  assert.doesNotThrow(() => parsePoseSetManifest(manifest));
  assert.deepEqual(Object.keys(manifest.poses), CANONICAL_POSES);

  const source = await readFile(join(exampleDir, manifest.source.image));
  assert.equal(sha256(source), manifest.source.sha256);
  for (const pose of CANONICAL_POSES) {
    const entry = manifest.poses[pose];
    assert.equal(existsSync(join(exampleDir, entry.image)), true);
    assert.equal(
      sha256(await readFile(join(exampleDir, entry.image))),
      entry.sha256,
    );
  }
});

test("generatePoseSet writes all canonical poses with source, design, license, and provenance locks", async () => {
  const assetsDir = await tempAssetsDir();
  const calls: string[] = [];
  const result = await generatePoseSet({
    assetsDir,
    entityId: "scourge-swarm",
    game: "scourge-survivors",
    provider: "mock",
    size: 64,
    height: 32,
    seed: 10,
    usageLogPath: "off",
    licenseTerms: "test fixture",
    now: () => new Date("2026-07-22T10:00:00.000Z"),
    generate: async (args) => {
      calls.push(`${args.pose}:${args.seed}`);
      assert.match(
        args.prompt,
        /Preserve the source character's identity, anatomy, limb lengths/,
      );
      assert.equal(
        args.sourcePath.endsWith(
          "entities/scourge-swarm/scourge-survivors.png",
        ),
        true,
      );
      return generator(args);
    },
  });

  assert.equal(result.written, true);
  assert.deepEqual(calls, [
    "idle:10",
    "walk:11",
    "attack:12",
    "hit:13",
    "death:14",
  ]);
  assert.equal(result.manifest.source.assetId, "scourge-swarm");
  assert.equal(
    result.manifest.source.image,
    "entities/scourge-swarm/scourge-survivors.png",
  );
  assert.equal(result.manifest.design.palette, "doom");
  assert.equal(result.manifest.design.proportions, "source-reference-locked");
  assert.deepEqual(result.manifest.source.dimensions, [32, 48]);
  assert.equal(result.manifest.design.paletteColors.length > 20, true);
  assert.doesNotThrow(() => parsePoseSetManifest(result.manifest));

  const onDisk = JSON.parse(await readFile(result.manifestPath, "utf8"));
  assert.deepEqual(onDisk, result.manifest);
  for (const pose of CANONICAL_POSES) {
    const entry = result.manifest.poses[pose];
    const data = await readFile(join(assetsDir, entry.image));
    assert.equal(sha256(data), entry.sha256);
    assert.equal(entry.license.kind, "pose-reference");
    assert.equal(entry.license.terms, "test fixture");
    assert.deepEqual(entry.dimensions, [
      24 + CANONICAL_POSES.indexOf(pose),
      32,
    ]);
    assert.equal(entry.provenance.seed, 10 + CANONICAL_POSES.indexOf(pose));
  }
});

test("generatePoseSet dry-run validates and plans without creating a pose-set tree", async () => {
  const assetsDir = await tempAssetsDir();
  const result = await generatePoseSet({
    assetsDir,
    entityId: "scourge-swarm",
    game: "scourge-survivors",
    provider: "mock",
    size: 64,
    height: 32,
    usageLogPath: "off",
    dryRun: true,
    generate: generator,
  });
  assert.equal(result.written, false);
  assert.equal(existsSync(join(assetsDir, "sources/pose-sets")), false);
});

test("generatePoseSet rejects placeholders, aliases, and paths outside the asset package", async () => {
  for (const variant of [
    null,
    { type: "placeholder" },
    { type: "alias", sourceGame: "deadlane" },
  ]) {
    const assetsDir = await tempAssetsDir(variant);
    await assert.rejects(
      generatePoseSet({
        assetsDir,
        entityId: "scourge-swarm",
        game: "scourge-survivors",
        provider: "mock",
        size: 64,
        height: 32,
        usageLogPath: "off",
        generate: generator,
      }),
      /no promoted local scourge-survivors variant/,
    );
  }
  const escaping = await tempAssetsDir("../outside.png");
  await assert.rejects(
    generatePoseSet({
      assetsDir: escaping,
      entityId: "scourge-swarm",
      game: "scourge-survivors",
      provider: "mock",
      size: 64,
      height: 32,
      usageLogPath: "off",
      generate: generator,
    }),
    /safe asset-package-relative path/,
  );
});

test("parsePoseSetManifest rejects missing canonical poses and traversal", async () => {
  const manifest = JSON.parse(
    await readFile(join(exampleDir, "pose-set.json"), "utf8"),
  );
  delete manifest.poses.death;
  assert.throws(() => parsePoseSetManifest(manifest), /must contain exactly/);

  const escaped = JSON.parse(
    await readFile(join(exampleDir, "pose-set.json"), "utf8"),
  );
  escaped.poses.idle.image = "../idle.svg";
  assert.throws(
    () => parsePoseSetManifest(escaped),
    /safe asset-package-relative path/,
  );
});

function sha256(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function shortHash(value: string): string {
  return sha256(Buffer.from(value)).slice(0, 16);
}
