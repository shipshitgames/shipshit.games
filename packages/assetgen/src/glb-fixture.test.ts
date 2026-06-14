import assert from "node:assert/strict";
import { test } from "node:test";

import { buildMinimalGlb } from "./glb-fixture.ts";
import { parseGltfJson, summarizeModel } from "./asset-index.ts";

const GLB_MAGIC = 0x46546c67;

test("buildMinimalGlb emits a valid GLB container the indexer can parse", () => {
  const glb = buildMinimalGlb();
  // Header: magic + version 2, declared length matches the actual buffer.
  assert.equal(glb.readUInt32LE(0), GLB_MAGIC);
  assert.equal(glb.readUInt32LE(4), 2);
  assert.equal(glb.readUInt32LE(8), glb.length);
  // Whole buffer is 4-byte aligned (glTF chunk alignment).
  assert.equal(glb.length % 4, 0);

  const doc = parseGltfJson(glb);
  assert.equal(doc.meshes?.length, 1);
});

test("rigged fixture reads back as a skinned, animated model", () => {
  const summary = summarizeModel(parseGltfJson(buildMinimalGlb({ animationName: "walk" })));
  assert.equal(summary.meshes, 1);
  assert.equal(summary.skins, 1);
  assert.equal(summary.joints, 1);
  assert.equal(summary.animations.length, 1);
  assert.equal(summary.animations[0]?.name, "walk");
  assert.equal(summary.animations[0]?.durationSeconds, 1);
});

test("static fixture drops the skin and animation", () => {
  const summary = summarizeModel(parseGltfJson(buildMinimalGlb({ rigged: false })));
  assert.equal(summary.meshes, 1);
  assert.equal(summary.skins, 0);
  assert.equal(summary.joints, 0);
  assert.equal(summary.animations.length, 0);
});

test("buildMinimalGlb is deterministic (same input -> identical bytes)", () => {
  const a = buildMinimalGlb({ animationName: "idle" });
  const b = buildMinimalGlb({ animationName: "idle" });
  assert.deepEqual(a, b);
  // Different animation name -> different bytes.
  assert.notDeepEqual(buildMinimalGlb({ animationName: "run" }), a);
});
