import { getKey, missingKeyMessage } from "./keys.ts";
import { downloadGeneratedAsset, outputUrl } from "./media.ts";
import type { GeneratedAsset } from "./media.ts";

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

export interface ReplicateRequestOptions {
  model: string;
  /** Extra model input merged with the canonical prompt. */
  input?: Readonly<Record<string, unknown>>;
  timeoutMs?: number;
  pollIntervalMs?: number;
  requestTimeoutMs?: number;
  log?: (chunk: string) => void;
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

export async function uploadReplicateFile(image: Buffer, deps: ReplicateDeps = {}): Promise<string> {
  const key = requireReplicateKey(deps.resolveKey);
  const form = new FormData();
  form.append("content", new Blob([new Uint8Array(image)], { type: "image/png" }), "reference.png");
  const res = await (deps.fetchImpl ?? fetch)("https://api.replicate.com/v1/files", {
    method: "POST",
    headers: { authorization: `Bearer ${key}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Replicate file upload ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { urls?: { get?: unknown } };
  const url = json.urls?.get;
  if (typeof url !== "string" || !url) {
    throw new Error("Replicate file upload returned no URL");
  }
  return url;
}

export async function createReplicatePrediction(
  key: string,
  prompt: string,
  opts: ReplicateRequestOptions,
  fetchImpl: typeof fetch = fetch,
): Promise<ReplicatePrediction> {
  const res = await fetchImpl(`https://api.replicate.com/v1/models/${opts.model}/predictions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      prefer: "wait=60",
    },
    body: JSON.stringify(replicatePredictionBody(prompt, opts.input)),
    signal: AbortSignal.timeout(opts.requestTimeoutMs ?? 120_000),
  });
  if (!res.ok) throw new Error(`replicate ${res.status}: ${await res.text()}`);
  const prediction = (await res.json()) as ReplicatePrediction;
  opts.log?.(`[replicate] ${prediction.status ?? "created"} ${prediction.id ?? opts.model}\n`);
  return prediction;
}

export async function waitForReplicatePrediction(
  prediction: ReplicatePrediction,
  key: string,
  opts: ReplicateRequestOptions,
  deps: Pick<ReplicateDeps, "fetchImpl" | "sleep"> = {},
): Promise<ReplicatePrediction> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const sleep = deps.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const done = new Set(["succeeded", "failed", "canceled"]);
  let current = prediction;
  const started = Date.now();
  const timeoutMs = opts.timeoutMs ?? 300_000;
  const intervalMs = opts.pollIntervalMs ?? 1_500;

  while (current.status && !done.has(current.status)) {
    if (Date.now() - started > timeoutMs) {
      throw new Error(`replicate: timed out after ${Math.round(timeoutMs / 1000)}s`);
    }
    const pollUrl = current.urls?.get ?? current.urls?.self;
    if (!pollUrl) throw new Error("replicate: prediction has no polling URL");
    await sleep(intervalMs);
    const res = await fetchImpl(pollUrl, {
      headers: { authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(opts.requestTimeoutMs ?? 120_000),
    });
    if (!res.ok) throw new Error(`replicate poll ${res.status}: ${await res.text()}`);
    current = (await res.json()) as ReplicatePrediction;
    opts.log?.(`[replicate] ${current.status ?? "poll"}\n`);
  }

  if (current.status !== "succeeded") {
    const detail = typeof current.error === "string" && current.error ? `: ${current.error}` : "";
    throw new Error(`replicate: prediction ${current.status ?? "failed"}${detail}`);
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
  const prediction = await createReplicatePrediction(key, prompt, opts, fetchImpl);
  const completed = await waitForReplicatePrediction(prediction, key, opts, deps);
  const url = outputUrl(completed.output);
  if (!url) throw new Error("replicate: prediction completed without a downloadable output URL");
  return downloadGeneratedAsset(url, opts.model, fetchImpl, {
    timeoutMs: opts.requestTimeoutMs,
  });
}

function requireReplicateKey(resolveKey: ReplicateDeps["resolveKey"]): string {
  const key = resolveKey ? resolveKey() : resolveReplicateKey();
  if (!key) throw missingReplicateKeyMessage();
  return key;
}
