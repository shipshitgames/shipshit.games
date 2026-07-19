import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";

import {
  buildAssetIndex,
  checkAssetIndex,
  deriveGame,
  parseGltfJson,
  serializeAssetIndex,
  type ImageAsset,
  type ModelAsset,
} from "./asset-index.ts";

// ── helpers ──────────────────────────────────────────────────────────────

const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

function coloredSquare(size: number, color: { r: number; g: number; b: number }): sharp.Sharp {
  return sharp({ create: { width: size, height: size, channels: 4, background: { ...color, alpha: 1 } } }).png();
}

/** 4x2 grid of 32px cells; fill all but cells 4 and 6 (which stay transparent). */
async function writeSheet(path: string): Promise<void> {
  const filled = [0, 1, 2, 3, 5, 7];
  const square = await coloredSquare(24, { r: 200, g: 40, b: 40 }).toBuffer();
  const composites = filled.map((idx) => ({
    input: square,
    left: (idx % 4) * 32 + 4,
    top: Math.floor(idx / 4) * 32 + 4,
  }));
  await sharp({ create: { width: 128, height: 64, channels: 4, background: TRANSPARENT } })
    .composite(composites)
    .png()
    .toFile(path);
}

/** A non-blank 32px image (colored square inset on transparency). */
async function writeContentImage(path: string): Promise<void> {
  const square = await coloredSquare(20, { r: 40, g: 180, b: 90 }).toBuffer();
  await sharp({ create: { width: 32, height: 32, channels: 4, background: TRANSPARENT } })
    .composite([{ input: square, left: 6, top: 6 }])
    .png()
    .toFile(path);
}

async function writeBlankImage(path: string): Promise<void> {
  await sharp({ create: { width: 32, height: 32, channels: 4, background: TRANSPARENT } }).png().toFile(path);
}

const GLB_DOC = {
  asset: { version: "2.0" },
  meshes: [{ name: "Body", primitives: [{}] }],
  materials: [{ name: "Skin" }],
  textures: [{}],
  skins: [{ joints: [0, 1, 2] }],
  accessors: [{ type: "SCALAR", componentType: 5126, count: 2, min: [0], max: [1] }],
  animations: [
    { name: "idle", samplers: [{ input: 0, output: 1 }], channels: [{ sampler: 0, target: { node: 0, path: "translation" } }] },
  ],
};

function buildGlb(doc: unknown): Buffer {
  const json = Buffer.from(JSON.stringify(doc), "utf8");
  const pad = (4 - (json.length % 4)) % 4;
  const jsonChunk = Buffer.concat([json, Buffer.alloc(pad, 0x20)]);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonChunk.length, 8);
  const chunkHeader = Buffer.alloc(8);
  chunkHeader.writeUInt32LE(jsonChunk.length, 0);
  chunkHeader.writeUInt32LE(0x4e4f534a, 4);
  return Buffer.concat([header, chunkHeader, jsonChunk]);
}

// ── pure unit tests ──────────────────────────────────────────────────────

describe("parseGltfJson", () => {
  test("reads the JSON chunk from a GLB buffer", () => {
    const doc = parseGltfJson(buildGlb(GLB_DOC));
    expect(doc.meshes).toHaveLength(1);
    expect(doc.animations?.[0]?.name).toBe("idle");
  });
  test("reads a plain .gltf JSON buffer", () => {
    const doc = parseGltfJson(Buffer.from(JSON.stringify(GLB_DOC), "utf8"));
    expect(doc.skins?.[0]?.joints).toHaveLength(3);
  });
});

describe("deriveGame", () => {
  test("derives from games/<slug>/ and entities/<id>/<slug>.ext, else null", () => {
    expect(deriveGame("games/pactfall/rig.glb")).toBe("pactfall");
    expect(deriveGame("entities/graft-breacher/scourge-survivors.webp")).toBe("scourge-survivors");
    expect(deriveGame("shared/fx/ember.webp")).toBeNull();
  });
});

// ── integration: build an index over a generated fixture ─────────────────

describe("buildAssetIndex (fixture)", () => {
  let dir: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "assetgen-index-"));
    await mkdir(join(dir, "shared", "fx"), { recursive: true });
    await mkdir(join(dir, "entities", "test-entity"), { recursive: true });
    await mkdir(join(dir, "games", "scourge-survivors"), { recursive: true });
    await mkdir(join(dir, "sources", "models"), { recursive: true });
    await writeSheet(join(dir, "shared", "fx", "explosion.png"));
    await writeBlankImage(join(dir, "shared", "fx", "empty.png"));
    await writeContentImage(join(dir, "entities", "test-entity", "deadlane.png"));
    await writeFile(join(dir, "games", "scourge-survivors", "rig.glb"), buildGlb(GLB_DOC));
    await writeFile(join(dir, "sources", "models", "raw-provider-output.glb"), buildGlb(GLB_DOC));
    await writeFile(
      join(dir, "sources", "models", "raw-provider-output.optimize.json"),
      JSON.stringify({ source: "raw-provider-output.glb" }),
    );
    await writeFile(
      join(dir, "assets-catalog.json"),
      JSON.stringify({ version: "1", entities: [{ id: "test-entity" }], shared: [] }, null, 2),
    );
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test("scans images + models with per-game tagging", async () => {
    const index = await buildAssetIndex({ assetsDir: dir, frameSize: { width: 32, height: 32 } });
    expect(index.assetCount).toBe(4);
    expect(index.images).toBe(3);
    expect(index.models).toBe(1);

    const games = Object.fromEntries(index.games.map((g) => [g.game, g.total]));
    expect(games["deadlane"]).toBe(1);
    expect(games["scourge-survivors"]).toBe(1);
    expect(games["shared"]).toBe(2);
  });

  test("excludes raw model sources and trace reports from the runtime index", async () => {
    const index = await buildAssetIndex({ assetsDir: dir });
    expect(index.assets.some((asset) => asset.path.startsWith("sources/"))).toBe(false);
    expect(index.assetCount).toBe(4);
  });

  test("detects sprite-sheet frames and blank frames", async () => {
    const index = await buildAssetIndex({ assetsDir: dir, frameSize: { width: 32, height: 32 } });
    const sheet = index.assets.find((a) => a.path === "shared/fx/explosion.png") as ImageAsset;
    expect(sheet.sheet).not.toBeNull();
    expect(sheet.sheet?.frames).toBe(8);
    expect(sheet.sheet?.cols).toBe(4);
    expect(sheet.sheet?.blankFrames).toEqual([4, 6]);
    expect(sheet.blank).toBe(false);
  });

  test("flags blank images and enriches from the catalog", async () => {
    const index = await buildAssetIndex({ assetsDir: dir });
    const blank = index.assets.find((a) => a.path === "shared/fx/empty.png") as ImageAsset;
    expect(blank.blank).toBe(true);
    const entity = index.assets.find((a) => a.path === "entities/test-entity/deadlane.png") as ImageAsset;
    expect(entity.game).toBe("deadlane");
    expect(entity.id).toBe("test-entity");
    expect(entity.inCatalog).toBe(true);
    expect(entity.blank).toBe(false);
  });

  test("parses GLB model metadata", async () => {
    const index = await buildAssetIndex({ assetsDir: dir });
    const model = index.assets.find((a) => a.type === "model") as ModelAsset;
    expect(model.game).toBe("scourge-survivors");
    expect(model.meshes).toBe(1);
    expect(model.skins).toBe(1);
    expect(model.joints).toBe(3);
    expect(model.animations).toHaveLength(1);
    expect(model.animations[0]).toMatchObject({ name: "idle", durationSeconds: 1, channels: 1, loops: true });
  });

  test("--game filters to a single game", async () => {
    const index = await buildAssetIndex({ assetsDir: dir, game: "deadlane" });
    expect(index.assetCount).toBe(1);
    expect(index.assets[0]?.path).toBe("entities/test-entity/deadlane.png");
  });

  test("output is deterministic and --check detects drift", async () => {
    const a = serializeAssetIndex(await buildAssetIndex({ assetsDir: dir }));
    const b = serializeAssetIndex(await buildAssetIndex({ assetsDir: dir }));
    expect(a).toBe(b);

    const indexPath = join(dir, "assets.index.json");
    await writeFile(indexPath, a, "utf8");
    expect((await checkAssetIndex(await buildAssetIndex({ assetsDir: dir }), indexPath)).stale).toBe(false);

    await writeFile(indexPath, a.replace('"assetCount": 4', '"assetCount": 99'), "utf8");
    expect((await checkAssetIndex(await buildAssetIndex({ assetsDir: dir }), indexPath)).stale).toBe(true);

    await rm(indexPath, { force: true });
    expect((await checkAssetIndex(await buildAssetIndex({ assetsDir: dir }), indexPath)).stale).toBe(true);
  });
});
