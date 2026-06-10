import assert from "node:assert/strict";
import { test } from "node:test";

import { FAL_MODELS } from "./fal";
import { assetProviders, defaultProviderForKind, generateAsset, resolveProvider } from "./providers";

test("provider defaults are selected by asset kind", () => {
  assert.equal(defaultProviderForKind("sprite"), "codex");
  assert.equal(defaultProviderForKind("sprite-anim"), "codex");
  assert.equal(defaultProviderForKind("music"), "suno");
  assert.equal(defaultProviderForKind("model"), "replicate");
  assert.equal(defaultProviderForKind("unknown-kind"), "codex");
});

test("provider resolution rejects unsupported asset kinds", () => {
  assert.throws(() => resolveProvider("music", "openai"), /openai does not support music assets/);
  assert.equal(resolveProvider("music", "suno").id, "suno");
});

test("fal provider resolves for image kinds and exposes the model catalog", () => {
  assert.equal(resolveProvider("texture", "fal").id, "fal");
  assert.equal(resolveProvider("sprite", "fal").id, "fal");
  assert.equal(assetProviders.fal.models, FAL_MODELS);
  assert.throws(() => resolveProvider("music", "fal"), /fal does not support music assets/);
});

test("provider interface generates an asset for the requested kind", async () => {
  const asset = await generateAsset("sprite", "offline test asset", {
    provider: "mock",
    size: "64x64",
  });

  assert.equal(asset.provider, "mock");
  assert.equal(asset.mediaType, "image/png");
  assert.equal(asset.extension, "png");
  assert.ok(asset.data.length > 0);
});
