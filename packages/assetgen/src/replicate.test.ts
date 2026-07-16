import assert from "node:assert/strict";
import { test } from "node:test";

import {
  generateReplicateAsset,
  replicatePredictionBody,
  uploadReplicateFile,
  waitForReplicatePrediction,
} from "./replicate";

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

test("uploadReplicateFile posts multipart bytes and returns the Files API URL", async () => {
  const { fetchImpl, calls } = fakeFetch(() =>
    new Response(JSON.stringify({ urls: { get: "https://files.replicate.com/reference.png" } }), {
      headers: { "content-type": "application/json" },
    }),
  );

  const url = await uploadReplicateFile(Buffer.from([0x89, 0x50, 0x4e, 0x47]), {
    fetchImpl,
    resolveKey: () => "unit-key",
  });

  assert.equal(url, "https://files.replicate.com/reference.png");
  assert.equal(calls[0]?.url, "https://api.replicate.com/v1/files");
  assert.equal(calls[0]?.init?.method, "POST");
  assert.equal((calls[0]?.init?.headers as Record<string, string>).authorization, "Bearer unit-key");
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
          urls: { get: "https://api.replicate.com/v1/predictions/prediction-1" },
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

  const asset = await generateReplicateAsset(
    "parasite-taken host",
    {
      model: "google/nano-banana-2",
      input: {
        aspect_ratio: "21:9",
        image_input: ["https://files.replicate.com/reference.png"],
      },
      pollIntervalMs: 25,
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
  assert.equal((calls[0]?.init?.headers as Record<string, string>).prefer, "wait=60");
  assert.deepEqual(sleeps, [25]);
  assert.deepEqual(asset.data, png);
  assert.equal(asset.model, "google/nano-banana-2");
  assert.equal(asset.mediaType, "image/png");
});

test("generateReplicateAsset reports missing credentials with setup guidance", async () => {
  await assert.rejects(
    generateReplicateAsset("a husk", { model: "google/nano-banana-2" }, { resolveKey: () => undefined }),
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
        }) as typeof fetch,
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
