import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";

import { getKey, missingKeyMessage } from "./keys";
import { downloadGeneratedAsset, outputUrl } from "./media";
import type { GeneratedAsset } from "./media";

/**
 * Dependency-light Replicate client shared by assetgen and server routes.
 *
 * Keep this module free of providers.ts, sharp, and node-pty imports so Next.js
 * and Electron callers can consume the canonical Replicate implementation
 * without pulling in the full assetgen provider graph.
 */

export const REPLICATE_KEY_CONFIG = {
  envName: "REPLICATE_API_TOKEN",
  service: "shipshit-replicate",
  label: "Replicate",
} as const;

export const HUNYUAN_3D_MODEL = "tencent/hunyuan-3d-3.1";
export const HUNYUAN_3D_DEFAULT_FACE_COUNT = 300_000;
export const HUNYUAN_3D_MAX_IMAGE_BYTES = 6_000_000;

export interface ReplicateRequestOptions {
  model: string;
  /** Extra model input merged with the canonical prompt. */
  input?: Readonly<Record<string, unknown>>;
  timeoutMs?: number;
  pollIntervalMs?: number;
  requestTimeoutMs?: number;
  log?: (chunk: string) => void;
  /**
   * Durable callers persist each lifecycle snapshot before continuing. This
   * keeps the canonical provider client usable by reclaimable workers without
   * forking Replicate create/poll behavior in the API.
   */
  onPrediction?: (
    prediction: Readonly<ReplicatePrediction>,
  ) => void | Promise<void>;
}

export interface Hunyuan3dRequestOptions extends Omit<ReplicateRequestOptions, "input"> {
  referenceImage?: string;
  enablePbr?: boolean;
  faceCount?: number;
  generateType?: "Normal" | "Geometry";
}

export interface ReplicateDeps {
  fetchImpl?: typeof fetch;
  resolveKey?: () => string | undefined;
  sleep?: (milliseconds: number) => Promise<void>;
}

export interface ReplicatePrediction {
  id?: string;
  status?: string;
  error?: unknown;
  output?: unknown;
  urls?: {
    get?: string;
    self?: string;
  };
}

export function resolveReplicateKey(): string | undefined {
  return getKey(REPLICATE_KEY_CONFIG.envName, REPLICATE_KEY_CONFIG.service);
}

export function missingReplicateKeyMessage(): Error {
  return missingKeyMessage(REPLICATE_KEY_CONFIG);
}

export function replicatePredictionBody(
  prompt: string,
  input: Readonly<Record<string, unknown>> = {},
): { input: Record<string, unknown> } {
  return { input: { ...input, prompt } };
}

export function hunyuan3dPredictionInput(options: {
  prompt: string;
  image?: string;
  enablePbr?: boolean;
  faceCount?: number;
  generateType?: "Normal" | "Geometry";
}): Record<string, unknown> {
  const faceCount = options.faceCount ?? HUNYUAN_3D_DEFAULT_FACE_COUNT;
  if (!Number.isInteger(faceCount) || faceCount < 40_000 || faceCount > 1_500_000) {
    throw new Error("Hunyuan 3D face count must be an integer between 40000 and 1500000");
  }
  const generateType = options.generateType ?? "Normal";
  if (generateType !== "Normal" && generateType !== "Geometry") {
    throw new Error('Hunyuan 3D generate type must be "Normal" or "Geometry"');
  }
  const prompt = options.prompt.trim();
  if (!options.image && !prompt) {
    throw new Error("Hunyuan 3D requires a prompt or one reference image");
  }
  return {
    ...(options.image ? { image: options.image } : { prompt }),
    enable_pbr: options.enablePbr ?? true,
    face_count: faceCount,
    generate_type: generateType,
  };
}

export async function uploadReplicateFile(
  image: Buffer,
  deps: ReplicateDeps = {},
): Promise<string> {
  const key = requireReplicateKey(deps.resolveKey);
  const form = new FormData();
  form.append(
    "content",
    new Blob([new Uint8Array(image)], { type: "image/png" }),
    "reference.png",
  );
  const res = await (deps.fetchImpl ?? fetch)(
    "https://api.replicate.com/v1/files",
    {
      method: "POST",
      headers: { authorization: `Bearer ${key}` },
      body: form,
    },
  );
  if (!res.ok)
    throw new Error(`Replicate file upload ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { urls?: { get?: unknown } };
  const url = json.urls?.get;
  if (typeof url !== "string" || !url) {
    throw new Error("Replicate file upload returned no URL");
  }
  return url;
}

async function createReplicatePredictionForInput(
  key: string,
  input: Readonly<Record<string, unknown>>,
  opts: ReplicateRequestOptions,
  fetchImpl: typeof fetch = fetch,
): Promise<ReplicatePrediction> {
  const res = await fetchImpl(
    `https://api.replicate.com/v1/models/${opts.model}/predictions`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
        prefer: "wait=60",
      },
      body: JSON.stringify({ input }),
      signal: AbortSignal.timeout(opts.requestTimeoutMs ?? 120_000),
    },
  );
  if (!res.ok) throw new Error(`replicate ${res.status}: ${await res.text()}`);
  const prediction = (await res.json()) as ReplicatePrediction;
  opts.log?.(
    `[replicate] ${prediction.status ?? "created"} ${prediction.id ?? opts.model}\n`,
  );
  await opts.onPrediction?.(prediction);
  return prediction;
}

export async function createReplicatePrediction(
  key: string,
  prompt: string,
  opts: ReplicateRequestOptions,
  fetchImpl: typeof fetch = fetch,
): Promise<ReplicatePrediction> {
  return createReplicatePredictionForInput(key, replicatePredictionBody(prompt, opts.input).input, opts, fetchImpl);
}

export async function waitForReplicatePrediction(
  prediction: ReplicatePrediction,
  key: string,
  opts: ReplicateRequestOptions,
  deps: Pick<ReplicateDeps, "fetchImpl" | "sleep"> = {},
): Promise<ReplicatePrediction> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const sleep =
    deps.sleep ??
    ((milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const done = new Set(["succeeded", "failed", "canceled"]);
  let current = prediction;
  const started = Date.now();
  const timeoutMs = opts.timeoutMs ?? 300_000;
  const intervalMs = opts.pollIntervalMs ?? 1_500;

  while (current.status && !done.has(current.status)) {
    if (Date.now() - started > timeoutMs) {
      throw new Error(
        `replicate: timed out after ${Math.round(timeoutMs / 1000)}s`,
      );
    }
    const pollUrl = current.urls?.get ?? current.urls?.self;
    if (!pollUrl) throw new Error("replicate: prediction has no polling URL");
    await sleep(intervalMs);
    const res = await fetchImpl(pollUrl, {
      headers: { authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(opts.requestTimeoutMs ?? 120_000),
    });
    if (!res.ok)
      throw new Error(`replicate poll ${res.status}: ${await res.text()}`);
    current = (await res.json()) as ReplicatePrediction;
    opts.log?.(`[replicate] ${current.status ?? "poll"}\n`);
    await opts.onPrediction?.(current);
  }

  if (current.status !== "succeeded") {
    const detail =
      typeof current.error === "string" && current.error
        ? `: ${current.error}`
        : "";
    throw new Error(
      `replicate: prediction ${current.status ?? "failed"}${detail}`,
    );
  }
  return current;
}

export async function generateReplicateAsset(
  prompt: string,
  opts: ReplicateRequestOptions,
  deps: ReplicateDeps = {},
): Promise<GeneratedAsset> {
  const key = requireReplicateKey(deps.resolveKey);
  const fetchImpl = deps.fetchImpl ?? fetch;
  const prediction = await createReplicatePrediction(
    key,
    prompt,
    opts,
    fetchImpl,
  );
  return resumeReplicateAsset(prediction, opts, deps);
}

/**
 * Continue an already-created prediction. Durable workers pass the last
 * persisted snapshot here after a lease is reclaimed, avoiding a second paid
 * provider request.
 */
export async function resumeReplicateAsset(
  prediction: ReplicatePrediction,
  opts: ReplicateRequestOptions,
  deps: ReplicateDeps = {},
): Promise<GeneratedAsset> {
  const key = requireReplicateKey(deps.resolveKey);
  const fetchImpl = deps.fetchImpl ?? fetch;
  const completed = await waitForReplicatePrediction(
    prediction,
    key,
    opts,
    deps,
  );
  const url = outputUrl(completed.output);
  if (!url)
    throw new Error(
      "replicate: prediction completed without a downloadable output URL",
    );
  const downloaded = await downloadGeneratedAsset(url, opts.model, fetchImpl, {
    timeoutMs: opts.requestTimeoutMs,
  });
  return {
    ...downloaded,
    meta: {
      model: opts.model,
      requestId: completed.id,
      reproducible: false,
    },
    providerRecord: completed,
  };
}

export async function generateHunyuan3dAsset(
  prompt: string,
  opts: Hunyuan3dRequestOptions,
  deps: ReplicateDeps = {},
): Promise<GeneratedAsset> {
  const key = requireReplicateKey(deps.resolveKey);
  const fetchImpl = deps.fetchImpl ?? fetch;
  const reference = opts.referenceImage ? await hunyuanReferenceImage(opts.referenceImage) : undefined;
  const input = hunyuan3dPredictionInput({
    prompt,
    image: reference?.dataUri,
    enablePbr: opts.enablePbr,
    faceCount: opts.faceCount,
    generateType: opts.generateType,
  });
  const prediction = await createReplicatePredictionForInput(key, input, opts, fetchImpl);
  const completed = await waitForReplicatePrediction(prediction, key, opts, deps);
  const url = outputUrl(completed.output);
  if (!url) throw new Error("replicate: Hunyuan 3D prediction completed without a downloadable GLB URL");
  const downloaded = await downloadGeneratedAsset(url, opts.model, fetchImpl, {
    timeoutMs: opts.requestTimeoutMs,
  });
  assertGlb(downloaded.data);
  return {
    ...downloaded,
    mediaType: "model/gltf-binary",
    extension: "glb",
    meta: {
      model: opts.model,
      requestId: completed.id,
      inputImageHash: reference?.hash,
      reproducible: false,
    },
    providerRecord: completed,
  };
}

async function hunyuanReferenceImage(path: string): Promise<{ dataUri: string; hash: string }> {
  const mediaType = imageMediaType(path);
  const data = await readFile(path);
  if (data.length > HUNYUAN_3D_MAX_IMAGE_BYTES) {
    throw new Error(
      `Hunyuan 3D reference image is ${data.length} bytes; maximum is ${HUNYUAN_3D_MAX_IMAGE_BYTES}`,
    );
  }
  return {
    dataUri: `data:${mediaType};base64,${data.toString("base64")}`,
    hash: createHash("sha256").update(data).digest("hex").slice(0, 16),
  };
}

function imageMediaType(path: string): string {
  switch (extname(path).toLowerCase()) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    default:
      throw new Error(`Hunyuan 3D reference image must be jpg, jpeg, png, or webp: ${path}`);
  }
}

function assertGlb(data: Buffer): void {
  if (data.length < 12 || data.readUInt32LE(0) !== 0x46546c67) {
    throw new Error(`replicate: Hunyuan 3D output is not a valid GLB (${data.length} bytes)`);
  }
}

function requireReplicateKey(resolveKey: ReplicateDeps["resolveKey"]): string {
  const key = resolveKey ? resolveKey() : resolveReplicateKey();
  if (!key) throw missingReplicateKeyMessage();
  return key;
}
