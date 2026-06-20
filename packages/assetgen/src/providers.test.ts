import { writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { test } from "node:test";

import { FAL_MODELS } from "./fal";
import { buildMinimalGlb } from "./glb-fixture";
import {
  PROVIDER_CATALOG,
  assetProviders,
  defaultProviderForKind,
  generateAsset,
  generateCodex,
  generateOpenAi,
  meshyClient,
  openAiAssetMeta,
  openAiImageBody,
  resolveProvider,
  runModelTask,
  tripoClient,
} from "./providers";
import type { ProviderOptions } from "./providers";

test("provider defaults are selected by asset kind", () => {
  assert.equal(defaultProviderForKind("sprite"), "codex");
  assert.equal(defaultProviderForKind("sprite-anim"), "codex");
  assert.equal(defaultProviderForKind("music"), "suno");
  assert.equal(defaultProviderForKind("model"), "meshy");
  assert.equal(defaultProviderForKind("3d"), "meshy");
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

test("assetProviders zips every catalog descriptor with a runnable generate fn", () => {
  // assetProviders is now PROVIDER_CATALOG zipped with GENERATORS via Object.fromEntries
  // + an `as` cast, so the cast — not the compiler — guards completeness. Pin at runtime
  // that every catalog id survived the zip with both its descriptor fields and a callable
  // generate, so a GENERATORS omission can't ship a `generate: undefined` provider.
  for (const [id, descriptor] of Object.entries(PROVIDER_CATALOG)) {
    const provider = assetProviders[id as keyof typeof assetProviders];
    assert.ok(provider, `${id} missing from assetProviders`);
    assert.equal(typeof provider.generate, "function", `${id} has no generate fn`);
    // Descriptor half is shared verbatim with the bundle-safe catalog.
    assert.equal(provider.id, descriptor.id);
    assert.equal(provider.label, descriptor.label);
    assert.equal(provider.defaultModel, descriptor.defaultModel);
    assert.equal(provider.key, descriptor.key);
    assert.deepEqual(provider.supports, descriptor.supports);
  }
  assert.deepEqual(Object.keys(assetProviders).sort(), Object.keys(PROVIDER_CATALOG).sort());
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

test("openAiImageBody never attaches a seed (the OpenAI Images API rejects it)", () => {
  const expected = {
    model: "gpt-image-2",
    prompt: "a husk",
    size: "1024x1024",
    background: "transparent",
    n: 1,
  };
  assert.deepEqual(openAiImageBody("a husk", "gpt-image-2", "1024x1024"), expected);
  // A supplied seed is a documented no-op — the body must be byte-identical and omit seed.
  assert.deepEqual(openAiImageBody("a husk", "gpt-image-2", "1024x1024", 7), expected);
  assert.equal("seed" in openAiImageBody("a husk", "gpt-image-2", "1024x1024", 7), false);
  // 0 is also a no-op (not a falsy edge that sneaks in).
  assert.equal("seed" in openAiImageBody("a husk", "gpt-image-2", "1024x1024", 0), false);
});

test("openAiAssetMeta records the requested seed but is reproducible only when the response confirms it", () => {
  assert.deepEqual(openAiAssetMeta("gpt-image-2"), { model: "gpt-image-2", reproducible: false });
  // A requested seed is recorded for provenance, but unconfirmed by the response → not reproducible.
  assert.deepEqual(openAiAssetMeta("gpt-image-2", 7), { model: "gpt-image-2", reproducible: false, seed: 7 });
  assert.deepEqual(openAiAssetMeta("gpt-image-2", 0), { model: "gpt-image-2", reproducible: false, seed: 0 });
  // Seed 0 is still preserved (only null/undefined are dropped).
  // When a provider echoes the seed back, the generation is genuinely reproducible.
  assert.deepEqual(openAiAssetMeta("gpt-image-2", 7, { seed: 7 }), { model: "gpt-image-2", reproducible: true, seed: 7 });
});

test("generateOpenAi records a requested seed in provenance but never sends it (OpenAI Images rejects seed)", async () => {
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

  // The Images API has no seed param, so the body must OMIT it (sending it can 400).
  assert.equal("seed" in body, false);
  assert.equal(body.background, "transparent");
  // The requested seed is still recorded for provenance, but the response carries
  // no seed confirmation, so provenance must NOT claim reproducibility.
  assert.deepEqual(asset.meta, { model: "gpt-image-2", reproducible: false, seed: 1234 });
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

test("mock provider returns a valid GLB for model kinds", async () => {
  for (const kind of ["model", "3d"]) {
    const asset = await generateAsset(kind, "a stone golem", { provider: "mock", size: "1024x1024" });
    assert.equal(asset.mediaType, "model/gltf-binary");
    assert.equal(asset.extension, "glb");
    // GLB magic "glTF".
    assert.equal(asset.data.readUInt32LE(0), 0x46546c67);
  }
});

const MODEL_OPTS: ProviderOptions = { size: "1024x1024", pollIntervalMs: 1 };

test("meshyClient builds a text-to-3D task request and reads status", () => {
  const req = meshyClient.createTask("a stone golem", "secret", MODEL_OPTS);
  assert.match(req.url, /\/openapi\/v2\/text-to-3d$/);
  assert.equal(req.headers.authorization, "Bearer secret");
  const body = JSON.parse(req.body);
  assert.equal(body.prompt, "a stone golem");
  assert.equal(body.mode, "preview");

  assert.equal(meshyClient.parseTaskId({ result: "task-9" }), "task-9");
  assert.throws(() => meshyClient.parseTaskId({}), /missing task id/);

  const running = meshyClient.parseStatus({ status: "IN_PROGRESS" });
  assert.equal(running.done, false);
  const failed = meshyClient.parseStatus({ status: "FAILED" });
  assert.deepEqual([failed.done, failed.succeeded], [true, false]);
  const ok = meshyClient.parseStatus({ status: "SUCCEEDED", model_urls: { glb: "https://cdn/x.glb" } });
  assert.deepEqual([ok.done, ok.succeeded, ok.glbUrl], [true, true, "https://cdn/x.glb"]);
});

test("tripoClient builds a text_to_model task request and reads status", () => {
  const req = tripoClient.createTask("a goblin", "secret", MODEL_OPTS);
  assert.match(req.url, /\/v2\/openapi\/task$/);
  assert.equal(JSON.parse(req.body).type, "text_to_model");

  assert.equal(tripoClient.parseTaskId({ data: { task_id: "t-1" } }), "t-1");
  assert.throws(() => tripoClient.parseTaskId({ data: {} }), /missing task id/);

  const ok = tripoClient.parseStatus({ data: { status: "success", output: { pbr_model: "https://cdn/y.glb" } } });
  assert.deepEqual([ok.done, ok.succeeded, ok.glbUrl], [true, true, "https://cdn/y.glb"]);
  const failed = tripoClient.parseStatus({ data: { status: "failed" } });
  assert.deepEqual([failed.done, failed.succeeded], [true, false]);
});

test("runModelTask drives create → poll → download to a GLB", async () => {
  const glb = buildMinimalGlb();
  let polls = 0;
  const fetchImpl = (async (input: unknown, init?: { method?: string }) => {
    const url = String(input);
    if (init?.method === "POST" && url.includes("/openapi/v2/text-to-3d")) {
      return new Response(JSON.stringify({ result: "task-123" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.endsWith("/text-to-3d/task-123")) {
      polls += 1;
      const body =
        polls < 2
          ? { status: "IN_PROGRESS" }
          : { status: "SUCCEEDED", model_urls: { glb: "https://assets.meshy.ai/test.glb" } };
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url === "https://assets.meshy.ai/test.glb") {
      return new Response(new Uint8Array(glb), { status: 200, headers: { "content-type": "model/gltf-binary" } });
    }
    throw new Error(`unexpected fetch ${url}`);
  }) as unknown as typeof fetch;

  const asset = await runModelTask(meshyClient, "a golem", { ...MODEL_OPTS, model: "meshy" }, {
    fetchImpl,
    getKeyImpl: () => "fake-key",
  });
  assert.equal(asset.mediaType, "model/gltf-binary");
  assert.equal(asset.extension, "glb");
  assert.ok(asset.data.length > 0);
  assert.equal(polls, 2);
});

test("runModelTask rejects a 200 download whose body is not a GLB", async () => {
  // A provider CDN returning an HTML/JSON error page with a 200 must fail loudly
  // here, not surface as an opaque parse error deep in the optimize.
  const fetchImpl = (async (input: unknown, init?: { method?: string }) => {
    const url = String(input);
    if (init?.method === "POST") {
      return new Response(JSON.stringify({ result: "task-x" }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.endsWith("/text-to-3d/task-x")) {
      return new Response(JSON.stringify({ status: "SUCCEEDED", model_urls: { glb: "https://assets.meshy.ai/bad.glb" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url === "https://assets.meshy.ai/bad.glb") {
      return new Response("<!doctype html><html>nope</html>", { status: 200, headers: { "content-type": "text/html" } });
    }
    throw new Error(`unexpected fetch ${url}`);
  }) as unknown as typeof fetch;

  await assert.rejects(
    runModelTask(meshyClient, "a golem", { ...MODEL_OPTS, model: "meshy" }, { fetchImpl, getKeyImpl: () => "fake-key" }),
    /not a valid GLB/,
  );
});

test("runModelTask surfaces a missing-key error before any request", async () => {
  await assert.rejects(
    runModelTask(tripoClient, "a golem", MODEL_OPTS, {
      fetchImpl: (() => {
        throw new Error("should not fetch without a key");
      }) as unknown as typeof fetch,
      getKeyImpl: () => undefined,
    }),
    /Tripo key/,
  );
});

test("runModelTask aborts a hung GLB download instead of blocking forever", async () => {
  // The final download must honor the same per-request timeout as create/poll: a
  // CDN that accepts the connection but never sends bytes can't stall the task.
  let downloadAttempts = 0;
  const fetchImpl = (async (input: unknown, init?: { method?: string; signal?: AbortSignal }) => {
    const url = String(input);
    if (init?.method === "POST") {
      return new Response(JSON.stringify({ result: "task-hang" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.endsWith("/text-to-3d/task-hang")) {
      return new Response(
        JSON.stringify({ status: "SUCCEEDED", model_urls: { glb: "https://assets.meshy.ai/slow.glb" } }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url === "https://assets.meshy.ai/slow.glb") {
      downloadAttempts += 1;
      // Resolve only when the abort signal fires — if the timeout weren't wired,
      // this promise (and the test) would hang forever, which is the bug guarded.
      return await new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        assert.ok(signal, "download fetch was not given an AbortSignal");
        if (signal.aborted) return reject(signal.reason);
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      });
    }
    throw new Error(`unexpected fetch ${url}`);
  }) as unknown as typeof fetch;

  await assert.rejects(
    runModelTask(
      meshyClient,
      "a golem",
      { ...MODEL_OPTS, model: "meshy", requestTimeoutMs: 25 },
      { fetchImpl, getKeyImpl: () => "fake-key" },
    ),
    (err: unknown) =>
      err instanceof Error &&
      ((err as { name?: string }).name === "TimeoutError" || /timed out|abort/i.test(err.message)),
  );
  assert.equal(downloadAttempts, 1);
});

test("runModelTask rejects a GLB url outside the provider CDN allowlist (SSRF guard)", async () => {
  // glbUrl is provider-supplied; a host off the Meshy CDN must be refused before
  // any bytes are fetched, not blindly downloaded.
  const fetchImpl = (async (input: unknown, init?: { method?: string }) => {
    const url = String(input);
    if (init?.method === "POST") {
      return new Response(JSON.stringify({ result: "task-evil" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.endsWith("/text-to-3d/task-evil")) {
      return new Response(
        JSON.stringify({ status: "SUCCEEDED", model_urls: { glb: "https://evil.example.com/x.glb" } }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url === "https://evil.example.com/x.glb") {
      throw new Error("download must not be attempted for a disallowed host");
    }
    throw new Error(`unexpected fetch ${url}`);
  }) as unknown as typeof fetch;

  await assert.rejects(
    runModelTask(meshyClient, "a golem", { ...MODEL_OPTS, model: "meshy" }, { fetchImpl, getKeyImpl: () => "fake-key" }),
    /not an allowed download domain/,
  );
});
