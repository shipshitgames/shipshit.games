import { test, expect } from "bun:test";

import { studioModelsPayload } from "./models-catalog";
import { FAL_IMAGE_KINDS, FAL_MODELS } from "../../../../packages/assetgen/src/fal";
import { DEFAULT_PROVIDER_BY_KIND } from "../../../../packages/assetgen/src/provider-catalog";

// The renderer (App.tsx) deleted its local DEFAULT_PROVIDER_BY_KIND / FAL_MODEL_KINDS
// and now reads them off this studio:models payload (#194). That makes the payload's
// FIELD NAMES a contract: if they drift from what the renderer reads, the per-kind
// pickers silently degrade with no failing build. Pin the shape and the values.
test("studio:models payload carries the catalog the renderer pickers read", () => {
  const payload = studioModelsPayload();
  // Exactly these three keys — the renderer destructures fal / defaultProviderByKind / falImageKinds.
  expect(Object.keys(payload).sort()).toEqual(["defaultProviderByKind", "fal", "falImageKinds"]);
  expect(payload.fal).toBe(FAL_MODELS);
  expect(payload.defaultProviderByKind).toEqual(DEFAULT_PROVIDER_BY_KIND);
  expect(payload.falImageKinds).toEqual([...FAL_IMAGE_KINDS]);
});

test("the payload's routing includes the sprite-anim → codex fix and stays canonical", () => {
  const { defaultProviderByKind, falImageKinds } = studioModelsPayload();
  // The #194 route the desktop copies had dropped.
  expect(defaultProviderByKind["sprite-anim"]).toBe("codex");
  // falImageKinds drives the renderer's fal-model picker gate; it must include sprite-anim.
  expect(falImageKinds).toContain("sprite-anim");
});
