import { getKey } from "./keys.ts";
import { downloadGeneratedAsset } from "./media.ts";
import type { GeneratedAsset, GeneratedAssetMeta } from "./media.ts";

/**
 * fal.ai image generation client (FLUX family) with a per-asset-kind model
 * picker. BYO key: FAL_KEY env var or the shipshit keychain entry.
 *
 * No sharp / node-pty / providers.ts imports here — the desktop main process
 * imports this module directly for the model catalog, and the renderer gets it
 * over IPC.
 */

export interface FalModel {
  id: string;
  label: string;
  kinds: readonly string[];
}

export const FAL_IMAGE_KINDS = ["sprite", "sprite-anim", "texture", "icon", "map"] as const;

/** Curated FLUX-family models — all share the same request/response contract. */
export const FAL_MODELS: readonly FalModel[] = [
  { id: "fal-ai/flux/dev", label: "FLUX.1 dev — quality", kinds: FAL_IMAGE_KINDS },
  { id: "fal-ai/flux/schnell", label: "FLUX.1 schnell — fast drafts", kinds: FAL_IMAGE_KINDS },
  { id: "fal-ai/flux-pro/v1.1", label: "FLUX 1.1 pro — production", kinds: FAL_IMAGE_KINDS },
];

export const DEFAULT_FAL_MODEL = "fal-ai/flux/dev";

export const DEFAULT_FAL_MODEL_BY_KIND: Record<string, string> = {
  sprite: "fal-ai/flux/dev",
  "sprite-anim": "fal-ai/flux/dev",
  texture: "fal-ai/flux/dev",
  icon: "fal-ai/flux/dev",
  map: "fal-ai/flux/dev",
};

export const FAL_KEY_CONFIG = { envName: "FAL_KEY", service: "shipshit-fal", label: "fal.ai" } as const;

/** Explicit model wins, then the per-kind default, then the provider default. */
export function resolveFalModel(kind: string, model?: string): string {
  return model || DEFAULT_FAL_MODEL_BY_KIND[kind] || DEFAULT_FAL_MODEL;
}

/** Overridable for tests and self-hosted proxies, like SUNO_API_BASE_URL. */
export function falApiBase(): string {
  return process.env.FAL_API_BASE_URL?.replace(/\/+$/, "") || "https://fal.run";
}

// fal accepts a custom {width, height} image_size; FLUX endpoints validate
// dimensions in roughly the 256–1440 per-side range.
const FAL_MIN_DIM = 256;
const FAL_MAX_DIM = 1440;

export function falImageSize(size: string): { width: number; height: number } {
  const match = String(size).match(/^\s*(\d+)\s*[xX]\s*(\d+)\s*$/);
  const width = match ? Number.parseInt(match[1]!, 10) : Number.parseInt(String(size), 10);
  const height = match ? Number.parseInt(match[2]!, 10) : width;
  return { width: clampDim(width), height: clampDim(height) };
}

function clampDim(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 1024;
  return Math.min(FAL_MAX_DIM, Math.max(FAL_MIN_DIM, Math.round(n)));
}

/** Structural subset of ProviderOptions so providers.ts can pass its opts straight through. */
export interface FalRequestOptions {
  size: string;
  model?: string;
  timeoutMs?: number;
  log?: (chunk: string) => void;
  /** When set, FLUX runs deterministically and echoes the honored seed back. */
  seed?: number;
}

export interface FalDeps {
  fetchImpl?: typeof fetch;
  resolveKey?: () => string | undefined;
}

/**
 * Pure builder for the FLUX request body (no IO; unit-testable). The seed key is
 * only added when supplied, so the unseeded body stays byte-identical to the
 * pre-#55 contract.
 */
export function falRequestBody(
  prompt: string,
  imageSize: { width: number; height: number },
  seed?: number,
): Record<string, unknown> {
  const body: Record<string, unknown> = { prompt, image_size: imageSize, num_images: 1 };
  if (seed !== undefined) body.seed = seed;
  return body;
}

/**
 * Reproducibility meta for a fal generation: prefer the seed fal echoes back,
 * fall back to the requested seed, and mark reproducible only when a seed was
 * actually honored.
 */
export function falAssetMeta(model: string, requestedSeed: number | undefined, json: any): GeneratedAssetMeta {
  const honored = typeof json?.seed === "number" ? json.seed : requestedSeed;
  const requestId = typeof json?.request_id === "string" ? json.request_id : undefined;
  const meta: GeneratedAssetMeta = { model, reproducible: honored !== undefined };
  if (honored !== undefined) meta.seed = honored;
  if (requestId) meta.requestId = requestId;
  return meta;
}

export async function generateFalAsset(
  kind: string,
  prompt: string,
  opts: FalRequestOptions,
  deps: FalDeps = {},
): Promise<GeneratedAsset> {
  const resolveKey = deps.resolveKey ?? (() => getKey(FAL_KEY_CONFIG.envName, FAL_KEY_CONFIG.service));
  const key = resolveKey();
  if (!key) {
    throw new Error(
      `No ${FAL_KEY_CONFIG.label} key. Set ${FAL_KEY_CONFIG.envName}, or store it the shipcode way:\n` +
        `  security add-generic-password -a shipshit -s ${FAL_KEY_CONFIG.service} -w <KEY>`,
    );
  }
  const fetchImpl = deps.fetchImpl ?? fetch;
  const model = resolveFalModel(kind, opts.model);
  const imageSize = falImageSize(opts.size);
  const timeoutMs = opts.timeoutMs ?? 120_000;
  opts.log?.(`[fal] ${model} ${imageSize.width}x${imageSize.height}\n`);

  let res: Response;
  try {
    res = await fetchImpl(`${falApiBase()}/${model}`, {
      method: "POST",
      headers: { authorization: `Key ${key}`, "content-type": "application/json" },
      body: JSON.stringify(falRequestBody(prompt, imageSize, opts.seed)),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const name = (error as Error)?.name;
    if (name === "TimeoutError" || name === "AbortError") {
      throw new Error(`fal: ${model} timed out after ${Math.round(timeoutMs / 1000)}s`);
    }
    throw error;
  }
  if (!res.ok) throw new Error(`fal ${res.status}: ${await res.text()}`);

  const json: any = await res.json();
  const image = json?.images?.[0] ?? json?.image;
  const url = typeof image === "string" ? image : image?.url;
  if (!url) throw new Error(`fal: no image in ${model} response`);

  const asset = await downloadGeneratedAsset(url, model, fetchImpl);
  const meta = falAssetMeta(model, opts.seed, json);
  // The response's declared content type beats extension sniffing on the URL.
  const declared = typeof image === "object" ? image?.content_type?.split(";")[0]?.trim() : undefined;
  if (declared && declared !== asset.mediaType) {
    return { ...asset, mediaType: declared, meta };
  }
  return { ...asset, meta };
}
