import assert from "node:assert/strict";
import { test } from "node:test";

import { defaultProviderForKind, generateAsset, resolveProvider } from "./providers";

test("provider defaults are selected by asset kind", () => {
  assert.equal(defaultProviderForKind("sprite"), "codex");
  assert.equal(defaultProviderForKind("music"), "suno");
  assert.equal(defaultProviderForKind("model"), "replicate");
  assert.equal(defaultProviderForKind("unknown-kind"), "codex");
});

test("provider resolution rejects unsupported asset kinds", () => {
  assert.throws(() => resolveProvider("music", "openai"), /openai does not support music assets/);
  assert.equal(resolveProvider("music", "suno").id, "suno");
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
