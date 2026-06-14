import { writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { test } from "node:test";

import { FAL_MODELS } from "./fal";
import {
  assetProviders,
  defaultProviderForKind,
  generateAsset,
  generateCodex,
  generateOpenAi,
  openAiAssetMeta,
  openAiImageBody,
  resolveProvider,
} from "./providers";

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

test("generateAsset always returns meta; the mock provider is never reproducible", async () => {
  const asset = await generateAsset("sprite", "offline test asset", { provider: "mock", size: "64x64" });
  assert.deepEqual(asset.meta, { model: "mock", reproducible: false });
});

test("generateAsset echoes a requested seed through the mock provider but keeps reproducible:false", async () => {
  const asset = await generateAsset("sprite", "offline test asset", { provider: "mock", size: "64x64", seed: 5 });
  assert.equal(asset.meta.seed, 5);
  assert.equal(asset.meta.reproducible, false);
});

test("openAiImageBody omits the seed key unless one is supplied", () => {
  assert.deepEqual(openAiImageBody("a husk", "gpt-image-2", "1024x1024"), {
    model: "gpt-image-2",
    prompt: "a husk",
    size: "1024x1024",
    background: "transparent",
    n: 1,
  });
  assert.equal(openAiImageBody("a husk", "gpt-image-2", "1024x1024", 7).seed, 7);
  // 0 is a valid seed and must survive into the request body.
  assert.equal(openAiImageBody("a husk", "gpt-image-2", "1024x1024", 0).seed, 0);
});

test("openAiAssetMeta marks a seeded request reproducible and keeps seed 0", () => {
  assert.deepEqual(openAiAssetMeta("gpt-image-2"), { model: "gpt-image-2", reproducible: false });
  assert.deepEqual(openAiAssetMeta("gpt-image-2", 7), { model: "gpt-image-2", reproducible: true, seed: 7 });
  assert.deepEqual(openAiAssetMeta("gpt-image-2", 0), { model: "gpt-image-2", reproducible: true, seed: 0 });
});

test("generateOpenAi forwards a seed and records the honored seed as reproducible meta", async () => {
  const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  let body: any;
  const fetchImpl = (async (_url: unknown, init?: RequestInit) => {
    body = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ data: [{ b64_json: pngBytes.toString("base64") }] }), {
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  const asset = await generateOpenAi(
    "rusted bone plating",
    { size: "1024x1024", seed: 1234 },
    { fetchImpl, getKeyImpl: () => "unit-key" },
  );

  assert.equal(body.seed, 1234);
  assert.equal(body.background, "transparent");
  assert.deepEqual(asset.meta, { model: "gpt-image-2", reproducible: true, seed: 1234 });
  assert.deepEqual(asset.data, pngBytes);
});

test("generateOpenAi omits the seed and stays non-reproducible when none is supplied", async () => {
  let body: any;
  const fetchImpl = (async (_url: unknown, init?: RequestInit) => {
    body = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ data: [{ b64_json: Buffer.from([1]).toString("base64") }] }), {
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  const asset = await generateOpenAi("a husk", { size: "1024x1024" }, { fetchImpl, getKeyImpl: () => "unit-key" });

  assert.equal("seed" in body, false);
  assert.deepEqual(asset.meta, { model: "gpt-image-2", reproducible: false });
});

test("generateOpenAi without a key explains how to set OPENAI_API_KEY", async () => {
  await assert.rejects(
    generateOpenAi("a husk", { size: "1024" }, { getKeyImpl: () => undefined }),
    /No OpenAI key[\s\S]*OPENAI_API_KEY[\s\S]*security add-generic-password -a shipshit -s shipshit-openai/,
  );
});

test("generateCodex records non-reproducible meta (the local agent is not seed-driven)", async () => {
  const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  let recordedOut: string | undefined;
  const asset = await generateCodex(
    "a parasite-taken host",
    { size: "128", seed: 99 },
    {
      runCodexCliImpl: async ({ outPath }) => {
        recordedOut = outPath;
        await writeFile(outPath, pngBytes);
        return { command: "codex", args: [], output: "", exitCode: 0 };
      },
    },
  );

  // Even with a seed supplied, codex can never claim reproducibility.
  assert.deepEqual(asset.meta, { model: "codex-cli", reproducible: false });
  assert.ok(recordedOut?.endsWith("out.png"));
  assert.deepEqual(asset.data, pngBytes);
});
