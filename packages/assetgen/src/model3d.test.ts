import assert from "node:assert/strict";
import { test } from "node:test";

import { Document, NodeIO } from "@gltf-transform/core";
import sharp from "sharp";

import { buildMinimalGlb } from "./glb-fixture.ts";
import {
  MODEL_EXTENSION,
  MODEL_KINDS,
  MODEL_MEDIA_TYPE,
  assertModelRuntimeBudget,
  isModelKind,
  optimizeGlb,
} from "./model3d.ts";

function glbContains(glb: Buffer, needle: string): boolean {
  return glb.includes(Buffer.from(needle));
}

/** Parse the `extensionsUsed` array straight from a GLB's JSON chunk. */
function glbExtensionsUsed(glb: Buffer): string[] {
  // GLB header is 12 bytes; chunk 0 is JSON: 4-byte length, 4-byte type, then data.
  const jsonLength = glb.readUInt32LE(12);
  const json = JSON.parse(glb.subarray(20, 20 + jsonLength).toString("utf8")) as { extensionsUsed?: string[] };
  return json.extensionsUsed ?? [];
}

/** Like {@link buildTexturedGlb} but with a SOLID texture that `prune` folds into a material factor. */
async function buildSolidTexturedGlb(): Promise<Buffer> {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const position = doc
    .createAccessor()
    .setType("VEC3")
    .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
    .setBuffer(buffer);
  const uv = doc.createAccessor().setType("VEC2").setArray(new Float32Array([0, 0, 1, 0, 0, 1])).setBuffer(buffer);
  const width = 8;
  const height = 8;
  const raw = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    raw[i * 4] = 180;
    raw[i * 4 + 1] = 60;
    raw[i * 4 + 2] = 40;
    raw[i * 4 + 3] = 255;
  }
  const png = await sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();
  const texture = doc.createTexture("solid").setImage(png).setMimeType("image/png");
  const material = doc.createMaterial("mat").setBaseColorTexture(texture);
  const prim = doc
    .createPrimitive()
    .setAttribute("POSITION", position)
    .setAttribute("TEXCOORD_0", uv)
    .setMaterial(material);
  const mesh = doc.createMesh().addPrimitive(prim);
  const node = doc.createNode().setMesh(mesh);
  doc.createScene().addChild(node);
  return Buffer.from(await new NodeIO().writeBinary(doc));
}

/** A minimal GLB carrying one texture actually referenced by a primitive. */
async function buildTexturedGlb(): Promise<Buffer> {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const position = doc
    .createAccessor()
    .setType("VEC3")
    .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
    .setBuffer(buffer);
  const uv = doc.createAccessor().setType("VEC2").setArray(new Float32Array([0, 0, 1, 0, 0, 1])).setBuffer(buffer);
  // A NON-uniform texture: `prune` folds solid-colour textures into material
  // factors (a real optimization), so the test image must actually vary.
  const width = 8;
  const height = 8;
  const raw = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    raw[i * 4] = (i * 7) % 256;
    raw[i * 4 + 1] = (i * 13) % 256;
    raw[i * 4 + 2] = (i * 29) % 256;
    raw[i * 4 + 3] = 255;
  }
  const png = await sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();
  const texture = doc.createTexture("base").setImage(png).setMimeType("image/png");
  const material = doc.createMaterial("mat").setBaseColorTexture(texture);
  const prim = doc
    .createPrimitive()
    .setAttribute("POSITION", position)
    .setAttribute("TEXCOORD_0", uv)
    .setMaterial(material);
  const mesh = doc.createMesh().addPrimitive(prim);
  const node = doc.createNode().setMesh(mesh);
  doc.createScene().addChild(node);
  return Buffer.from(await new NodeIO().writeBinary(doc));
}

test("model kind helpers and constants", () => {
  assert.deepEqual([...MODEL_KINDS], ["model", "3d"]);
  assert.equal(MODEL_EXTENSION, "glb");
  assert.equal(MODEL_MEDIA_TYPE, "model/gltf-binary");
  assert.equal(isModelKind("model"), true);
  assert.equal(isModelKind("3d"), true);
  assert.equal(isModelKind("sprite"), false);
});

test("optimizeGlb applies Draco geometry and preserves rig + animations", async () => {
  const raw = buildMinimalGlb({ animationName: "idle" });
  const result = await optimizeGlb(raw);

  assert.equal(result.compression.draco, true);
  assert.equal(result.compression.ktx2, false);
  assert.equal(result.compression.textureFormat, "none");
  assert.equal(result.compression.rawBytes, raw.length);
  assert.equal(result.compression.optimizedBytes, result.data.length);
  assert.ok(glbContains(result.data, "KHR_draco_mesh_compression"), "Draco extension should be present");

  assert.deepEqual(result.animations, ["idle"]);
  assert.equal(result.summary.skins, 1);
  assert.equal(result.summary.joints, 1);
  assert.equal(result.summary.meshes, 1);
});

test("optimizeGlb with --no-draco skips geometry compression", async () => {
  const result = await optimizeGlb(buildMinimalGlb(), { draco: false });
  assert.equal(result.compression.draco, false);
  assert.ok(!glbContains(result.data, "KHR_draco_mesh_compression"), "Draco extension should be absent");
});

test("assertModelRuntimeBudget rejects optimized GLBs above the configured ceiling", async () => {
  const result = await optimizeGlb(buildMinimalGlb(), { draco: false });
  assert.doesNotThrow(() => assertModelRuntimeBudget(result, result.data.length));
  assert.throws(
    () => assertModelRuntimeBudget(result, result.data.length - 1),
    /exceeding the .*runtime budget/,
  );
});

test("optimizeGlb compresses embedded textures to WebP", async () => {
  const result = await optimizeGlb(await buildTexturedGlb(), { draco: false });
  assert.equal(result.compression.textureFormat, "webp");
  assert.equal(result.compression.ktx2, false);
  assert.equal(result.summary.textures, 1);
  assert.ok(glbContains(result.data, "image/webp"), "texture should be re-encoded to WebP");
});

test("optimizeGlb writes conformant WebP GLBs (EXT_texture_webp declared)", async () => {
  // Regression: a WebP texture referenced from a core textures[].source without
  // EXT_texture_webp in extensionsUsed is non-conformant glTF 2.0 and fails to
  // load textures in standard loaders (the real Meshy/Tripo PBR case).
  const result = await optimizeGlb(await buildTexturedGlb(), { draco: false });
  const used = glbExtensionsUsed(result.data);
  assert.ok(used.includes("EXT_texture_webp"), `extensionsUsed must include EXT_texture_webp, got [${used.join(", ")}]`);
});

test("optimizeGlb default options apply Draco AND WebP with both extensions declared", async () => {
  // The production default path (no options) must run geometry + texture
  // compression together and declare both extensions.
  const result = await optimizeGlb(await buildTexturedGlb());
  assert.equal(result.compression.draco, true);
  assert.equal(result.compression.ktx2, false);
  assert.equal(result.compression.textureFormat, "webp");
  assert.equal(result.summary.textures, 1);
  const used = glbExtensionsUsed(result.data);
  assert.ok(used.includes("KHR_draco_mesh_compression"), `Draco extension expected, got [${used.join(", ")}]`);
  assert.ok(used.includes("EXT_texture_webp"), `WebP extension expected, got [${used.join(", ")}]`);
});

test("optimizeGlb reports textureFormat none when prune folds away the only texture", async () => {
  // Truthful reporting: a solid texture is pruned into a material factor, so the
  // written GLB carries no texture and compression must not claim "webp".
  const result = await optimizeGlb(await buildSolidTexturedGlb(), { draco: false });
  assert.equal(result.summary.textures, 0, "prune should remove the solid texture");
  assert.equal(result.compression.textureFormat, "none");
  assert.equal(result.compression.ktx2, false);
});

test("optimizeGlb requests KTX2 but falls back to WebP when no encoder is wired", async () => {
  const result = await optimizeGlb(await buildTexturedGlb(), { draco: false, ktx2: true });
  // KTX2 needs a KTX-Software encoder not bundled here; truthfully report the fallback.
  assert.equal(result.compression.ktx2, false);
  assert.equal(result.compression.textureFormat, "webp");
});
