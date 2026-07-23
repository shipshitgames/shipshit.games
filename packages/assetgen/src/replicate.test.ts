import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import { test } from "node:test";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildMinimalGlb } from "./glb-fixture";
import {
  HUNYUAN_3D_MODEL,
  generateHunyuan3dAsset,
  generateReplicateAsset,
  hunyuan3dPredictionInput,
  replicatePredictionBody,
  resumeReplicateAsset,
  uploadReplicateFile,
  waitForReplicatePrediction,
} from "./replicate";

interface RecordedCall {
  url: string;
  init?: RequestInit;
}

function fakeFetch(
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
): {
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

test("replicatePredictionBody merges provider input without allowing prompt replacement", () => {
  assert.deepEqual(
    replicatePredictionBody("canonical prompt", {
      prompt: "stale prompt",
      aspect_ratio: "21:9",
      image_input: ["https://files.replicate.com/reference.png"],
    }),
    {
      input: {
        prompt: "canonical prompt",
        aspect_ratio: "21:9",
        image_input: ["https://files.replicate.com/reference.png"],
      },
    },
  );
});

test("hunyuan3dPredictionInput sends exactly one of prompt or image with game-ready defaults", () => {
  assert.deepEqual(hunyuan3dPredictionInput({ prompt: "a parasite host" }), {
    prompt: "a parasite host",
    enable_pbr: true,
    face_count: 300_000,
    generate_type: "Normal",
  });
  assert.deepEqual(
    hunyuan3dPredictionInput({
      prompt: "ignored for image lane",
      image: "data:image/png;base64,AAAA",
      enablePbr: false,
      faceCount: 120_000,
      generateType: "Geometry",
    }),
    {
      image: "data:image/png;base64,AAAA",
      enable_pbr: false,
      face_count: 120_000,
      generate_type: "Geometry",
    },
  );
});

test("generateHunyuan3dAsset records prediction and input-image provenance", async () => {
  const root = await mkdtemp(join(tmpdir(), "assetgen-hunyuan-"));
  const reference = join(root, "host.png");
  const referenceBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  await writeFile(reference, referenceBytes);
  const glb = buildMinimalGlb();
  let input: Record<string, unknown> | undefined;
  const { fetchImpl } = fakeFetch((url, init) => {
    if (url.endsWith(`/models/${HUNYUAN_3D_MODEL}/predictions`)) {
      input = JSON.parse(String(init?.body)).input;
      return Response.json({
        id: "hunyuan-prediction-1",
        status: "succeeded",
        output: "https://replicate.delivery/model.glb",
      });
    }
    if (url === "https://replicate.delivery/model.glb") {
      return new Response(new Uint8Array(glb), {
        headers: { "content-type": "model/gltf-binary" },
      });
    }
    throw new Error(`unexpected fetch ${url}`);
  });

  const asset = await generateHunyuan3dAsset(
    "parasite host",
    { model: HUNYUAN_3D_MODEL, referenceImage: reference },
    { fetchImpl, resolveKey: () => "unit-key" },
  );

  assert.equal("prompt" in input!, false);
  assert.match(String(input?.image), /^data:image\/png;base64,/);
  assert.equal(asset.mediaType, "model/gltf-binary");
  assert.equal(asset.extension, "glb");
  assert.equal(asset.meta?.requestId, "hunyuan-prediction-1");
  assert.equal(
    asset.meta?.inputImageHash,
    createHash("sha256").update(referenceBytes).digest("hex").slice(0, 16),
  );
  assert.equal((asset.providerRecord as { id: string }).id, "hunyuan-prediction-1");
});

test("uploadReplicateFile posts multipart bytes and returns the Files API URL", async () => {
  const { fetchImpl, calls } = fakeFetch(
    () =>
      new Response(
        JSON.stringify({
          urls: { get: "https://files.replicate.com/reference.png" },
        }),
        {
          headers: { "content-type": "application/json" },
        },
      ),
  );

  const url = await uploadReplicateFile(Buffer.from([0x89, 0x50, 0x4e, 0x47]), {
    fetchImpl,
    resolveKey: () => "unit-key",
  });

  assert.equal(url, "https://files.replicate.com/reference.png");
  assert.equal(calls[0]?.url, "https://api.replicate.com/v1/files");
  assert.equal(calls[0]?.init?.method, "POST");
  assert.equal(
    (calls[0]?.init?.headers as Record<string, string>).authorization,
    "Bearer unit-key",
  );
  assert.ok(calls[0]?.init?.body instanceof FormData);
});

test("generateReplicateAsset drives create, poll, and download with input passthrough", async () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  const { fetchImpl, calls } = fakeFetch((url, init) => {
    if (url.endsWith("/models/google/nano-banana-2/predictions")) {
      return new Response(
        JSON.stringify({
          id: "prediction-1",
          status: "processing",
          urls: {
            get: "https://api.replicate.com/v1/predictions/prediction-1",
          },
        }),
        { headers: { "content-type": "application/json" } },
      );
    }
    if (url.endsWith("/predictions/prediction-1")) {
      return new Response(
        JSON.stringify({
          id: "prediction-1",
          status: "succeeded",
          output: ["https://cdn.replicate.delivery/output.png"],
        }),
        { headers: { "content-type": "application/json" } },
      );
    }
    if (url === "https://cdn.replicate.delivery/output.png") {
      return new Response(png, { headers: { "content-type": "image/png" } });
    }
    throw new Error(`unexpected fetch ${url} ${init?.method ?? "GET"}`);
  });
  const sleeps: number[] = [];
  const snapshots: string[] = [];

  const asset = await generateReplicateAsset(
    "parasite-taken host",
    {
      model: "google/nano-banana-2",
      input: {
        aspect_ratio: "21:9",
        image_input: ["https://files.replicate.com/reference.png"],
      },
      pollIntervalMs: 25,
      onPrediction: (prediction) => {
        snapshots.push(`${prediction.id}:${prediction.status}`);
      },
    },
    {
      fetchImpl,
      resolveKey: () => "unit-key",
      sleep: async (milliseconds) => {
        sleeps.push(milliseconds);
      },
    },
  );

  assert.equal(calls.length, 3);
  assert.equal(calls[0]?.init?.method, "POST");
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), {
    input: {
      prompt: "parasite-taken host",
      aspect_ratio: "21:9",
      image_input: ["https://files.replicate.com/reference.png"],
    },
  });
  assert.equal(
    (calls[0]?.init?.headers as Record<string, string>).prefer,
    "wait=60",
  );
  assert.deepEqual(sleeps, [25]);
  assert.deepEqual(snapshots, [
    "prediction-1:processing",
    "prediction-1:succeeded",
  ]);
  assert.deepEqual(asset.data, png);
  assert.equal(asset.model, "google/nano-banana-2");
  assert.equal(asset.mediaType, "image/png");
});

test("resumeReplicateAsset downloads a persisted successful prediction without creating another", async () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  const { fetchImpl, calls } = fakeFetch((url) => {
    assert.equal(url, "https://cdn.replicate.delivery/resumed.png");
    return new Response(png, { headers: { "content-type": "image/png" } });
  });

  const asset = await resumeReplicateAsset(
    {
      id: "prediction-resumed",
      status: "succeeded",
      output: "https://cdn.replicate.delivery/resumed.png",
    },
    { model: "google/nano-banana-2" },
    { fetchImpl, resolveKey: () => "unit-key" },
  );

  assert.equal(calls.length, 1);
  assert.deepEqual(asset.data, png);
});

test("generateReplicateAsset reports missing credentials with setup guidance", async () => {
  await assert.rejects(
    generateReplicateAsset(
      "a husk",
      { model: "google/nano-banana-2" },
      { resolveKey: () => undefined },
    ),
    /No Replicate key[\s\S]*REPLICATE_API_TOKEN[\s\S]*shipshit-replicate/,
  );
});

test("waitForReplicatePrediction enforces the overall timeout before polling", async () => {
  let fetched = false;
  await assert.rejects(
    waitForReplicatePrediction(
      {
        status: "processing",
        urls: { get: "https://api.replicate.com/v1/predictions/prediction-1" },
      },
      "unit-key",
      { model: "google/nano-banana-2", timeoutMs: -1 },
      {
        fetchImpl: (async () => {
          fetched = true;
          return new Response();
        }) as unknown as typeof fetch,
      },
    ),
    /replicate: timed out after 0s/,
  );
  assert.equal(fetched, false);
});

test("waitForReplicatePrediction includes provider failure details", async () => {
  await assert.rejects(
    waitForReplicatePrediction(
      { status: "failed", error: "input image was rejected" },
      "unit-key",
      { model: "google/nano-banana-2" },
    ),
    /replicate: prediction failed: input image was rejected/,
  );
});
