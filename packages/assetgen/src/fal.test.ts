import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEFAULT_FAL_MODEL,
  DEFAULT_FAL_MODEL_BY_KIND,
  FAL_MODELS,
  falImageSize,
  generateFalAsset,
  resolveFalModel,
} from "./fal";

interface RecordedCall {
  url: string;
  init?: RequestInit;
}

function fakeFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>): {
  fetchImpl: typeof fetch;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const fetchImpl = (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    return handler(url, init);
  }) as typeof fetch;
  return { fetchImpl, calls };
}

/** Pin FAL_API_BASE_URL for a test so a developer's exported value never leaks in. */
async function withFalApiBase(value: string | undefined, fn: () => Promise<void>): Promise<void> {
  const saved = process.env.FAL_API_BASE_URL;
  if (value === undefined) delete process.env.FAL_API_BASE_URL;
  else process.env.FAL_API_BASE_URL = value;
  try {
    await fn();
  } finally {
    if (saved === undefined) delete process.env.FAL_API_BASE_URL;
    else process.env.FAL_API_BASE_URL = saved;
  }
}

test("resolveFalModel precedence: explicit beats per-kind beats provider default", () => {
  assert.equal(resolveFalModel("texture", "fal-ai/flux-pro/v1.1"), "fal-ai/flux-pro/v1.1");
  assert.equal(resolveFalModel("texture"), DEFAULT_FAL_MODEL_BY_KIND.texture);
  assert.equal(resolveFalModel("never-heard-of-it"), DEFAULT_FAL_MODEL);
});

test("per-kind fal defaults all reference models in the catalog", () => {
  const ids = new Set(FAL_MODELS.map((model) => model.id));
  assert.equal(ids.has(DEFAULT_FAL_MODEL), true);
  for (const [kind, model] of Object.entries(DEFAULT_FAL_MODEL_BY_KIND)) {
    assert.equal(ids.has(model), true, `${kind} default ${model} is missing from FAL_MODELS`);
  }
});

test("falImageSize parses WxH, bare integers, and falls back to 1024", () => {
  assert.deepEqual(falImageSize("1024x1024"), { width: 1024, height: 1024 });
  assert.deepEqual(falImageSize("512x768"), { width: 512, height: 768 });
  assert.deepEqual(falImageSize("640"), { width: 640, height: 640 });
  assert.deepEqual(falImageSize("garbage"), { width: 1024, height: 1024 });
});

test("falImageSize clamps dimensions to the FLUX-supported range", () => {
  assert.deepEqual(falImageSize("64"), { width: 256, height: 256 });
  assert.deepEqual(falImageSize("4096"), { width: 1440, height: 1440 });
  assert.deepEqual(falImageSize("64x4096"), { width: 256, height: 1440 });
});

test("generateFalAsset posts to the per-kind default model and downloads the image", async () => {
  await withFalApiBase(undefined, async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const { fetchImpl, calls } = fakeFetch((url) => {
      if (url.endsWith("/output.png")) {
        return new Response(png, { headers: { "content-type": "image/png" } });
      }
      return new Response(
        JSON.stringify({ images: [{ url: "https://cdn.example.test/output.png", content_type: "image/png" }] }),
        { headers: { "content-type": "application/json" } },
      );
    });

    const asset = await generateFalAsset(
      "texture",
      "rusted bone plating",
      { size: "512x512" },
      { fetchImpl, resolveKey: () => "unit-key" },
    );

    assert.equal(calls.length, 2);
    assert.equal(calls[0]?.url, "https://fal.run/fal-ai/flux/dev");
    assert.equal(calls[0]?.init?.method, "POST");
    const headers = calls[0]?.init?.headers as Record<string, string>;
    assert.equal(headers.authorization, "Key unit-key");
    assert.equal(headers["content-type"], "application/json");
    assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), {
      prompt: "rusted bone plating",
      image_size: { width: 512, height: 512 },
      num_images: 1,
    });
    assert.equal(calls[1]?.url, "https://cdn.example.test/output.png");
    assert.equal(asset.model, "fal-ai/flux/dev");
    assert.equal(asset.mediaType, "image/png");
    assert.equal(asset.extension, "png");
    assert.deepEqual(asset.data, png);
  });
});

test("generateFalAsset routes an explicit model past the per-kind default", async () => {
  await withFalApiBase(undefined, async () => {
    const { fetchImpl, calls } = fakeFetch((url) => {
      if (url.endsWith("/output.png")) return new Response(Buffer.from([1]), { headers: { "content-type": "image/png" } });
      return new Response(JSON.stringify({ images: ["https://cdn.example.test/output.png"] }), {
        headers: { "content-type": "application/json" },
      });
    });

    const asset = await generateFalAsset(
      "sprite",
      "a husk",
      { size: "1024", model: "fal-ai/flux/schnell" },
      { fetchImpl, resolveKey: () => "unit-key" },
    );

    assert.equal(calls[0]?.url, "https://fal.run/fal-ai/flux/schnell");
    assert.equal(asset.model, "fal-ai/flux/schnell");
  });
});

test("generateFalAsset without a key explains FAL_KEY and the keychain command", async () => {
  const { fetchImpl, calls } = fakeFetch(() => new Response("unreachable"));
  await assert.rejects(
    generateFalAsset("texture", "a husk", { size: "1024" }, { fetchImpl, resolveKey: () => undefined }),
    /FAL_KEY[\s\S]*security add-generic-password -a shipshit -s shipshit-fal/,
  );
  assert.equal(calls.length, 0);
});

test("generateFalAsset maps fetch timeouts to a readable error", async () => {
  const { fetchImpl } = fakeFetch(() => {
    throw Object.assign(new Error("The operation timed out."), { name: "TimeoutError" });
  });
  await assert.rejects(
    generateFalAsset("texture", "a husk", { size: "1024", timeoutMs: 1000 }, { fetchImpl, resolveKey: () => "unit-key" }),
    /fal: fal-ai\/flux\/dev timed out after 1s/,
  );
});

test("generateFalAsset surfaces non-ok responses as fal <status>", async () => {
  const { fetchImpl } = fakeFetch(() => new Response("boom", { status: 500 }));
  await assert.rejects(
    generateFalAsset("texture", "a husk", { size: "1024" }, { fetchImpl, resolveKey: () => "unit-key" }),
    /fal 500: boom/,
  );
});

test("generateFalAsset throws when the response has no image", async () => {
  const { fetchImpl } = fakeFetch(
    () => new Response(JSON.stringify({ images: [] }), { headers: { "content-type": "application/json" } }),
  );
  await assert.rejects(
    generateFalAsset("texture", "a husk", { size: "1024" }, { fetchImpl, resolveKey: () => "unit-key" }),
    /fal: no image in fal-ai\/flux\/dev response/,
  );
});

test("generateFalAsset prefers the declared content_type over URL sniffing", async () => {
  const { fetchImpl } = fakeFetch((url) => {
    // Download response carries no content-type header, so the media type
    // would otherwise be sniffed from the .webp URL.
    if (url.endsWith("/output.webp")) return new Response(Buffer.from([1, 2, 3]));
    return new Response(
      JSON.stringify({ images: [{ url: "https://cdn.example.test/output.webp", content_type: "image/png" }] }),
      { headers: { "content-type": "application/json" } },
    );
  });

  const asset = await generateFalAsset("texture", "a husk", { size: "1024" }, { fetchImpl, resolveKey: () => "unit-key" });

  assert.equal(asset.mediaType, "image/png");
});

test("generateFalAsset respects the FAL_API_BASE_URL override", async () => {
  await withFalApiBase("http://127.0.0.1:9999/fal-stub/", async () => {
    const { fetchImpl, calls } = fakeFetch((url) => {
      if (url.endsWith("/output.png")) return new Response(Buffer.from([1]), { headers: { "content-type": "image/png" } });
      return new Response(JSON.stringify({ image: "http://127.0.0.1:9999/fal-stub/output.png" }), {
        headers: { "content-type": "application/json" },
      });
    });

    await generateFalAsset("texture", "a husk", { size: "1024" }, { fetchImpl, resolveKey: () => "unit-key" });

    // Trailing slashes are stripped before the model id is appended.
    assert.equal(calls[0]?.url, "http://127.0.0.1:9999/fal-stub/fal-ai/flux/dev");
  });
});
