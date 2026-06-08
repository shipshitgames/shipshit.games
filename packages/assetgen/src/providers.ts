import { readFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { runCodexCli } from "./codex.ts";
import { getKey } from "./keys.ts";

export type ProviderId = "codex" | "openai" | "fal" | "replicate" | "suno" | "mock";
export type AssetKind = "sprite" | "texture" | "icon" | "map" | "music" | "sfx" | "voice" | "model" | "3d" | string;

export interface ProviderOptions {
  size: string;
  model?: string;
  log?: (chunk: string) => void;
  timeoutMs?: number;
  pollIntervalMs?: number;
}

export type Provider = (prompt: string, opts: ProviderOptions) => Promise<Buffer>;

export interface ProviderKeyConfig {
  envName: string;
  service: string;
  label: string;
}

export interface GeneratedAsset {
  data: Buffer;
  mediaType: string;
  extension: string;
  model?: string;
}

export interface AssetProvider {
  id: ProviderId;
  label: string;
  supports: readonly string[];
  defaultModel?: string;
  key?: ProviderKeyConfig;
  generate(kind: AssetKind, prompt: string, opts: ProviderOptions): Promise<GeneratedAsset>;
}

export const DEFAULT_PROVIDER_BY_KIND: Record<string, ProviderId> = {
  sprite: "codex",
  "sprite-anim": "codex",
  texture: "openai",
  icon: "openai",
  map: "codex",
  music: "suno",
  sfx: "suno",
  voice: "suno",
  model: "replicate",
  "3d": "replicate",
};

const IMAGE_KINDS = ["sprite", "sprite-anim", "texture", "icon", "map"] as const;
const AUDIO_KINDS = ["music", "sfx", "voice"] as const;
const MODEL_KINDS = ["model", "3d"] as const;

function imageAsset(data: Buffer, model?: string): GeneratedAsset {
  return { data, mediaType: "image/png", extension: "png", model };
}

function providerKey(provider: AssetProvider): string | undefined {
  if (!provider.key) return undefined;
  return getKey(provider.key.envName, provider.key.service);
}

function missingKeyMessage(provider: AssetProvider): Error {
  const key = provider.key;
  if (!key) return new Error(`${provider.id} does not use an assetgen API key`);
  return new Error(
    `No ${key.label} key. Set ${key.envName}, or store it the shipcode way:\n` +
      `  security add-generic-password -a shipshit -s ${key.service} -w <KEY>`,
  );
}

/** OpenAI Images (gpt-image-2 by default) — transparent PNG. Key via env or keychain. */
async function generateOpenAi(prompt: string, opts: ProviderOptions): Promise<GeneratedAsset> {
  const provider = assetProviders.openai;
  const key = providerKey(provider);
  if (!key) throw missingKeyMessage(provider);
  const model = opts.model ?? provider.defaultModel ?? "gpt-image-2";
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      prompt,
      size: opts.size,
      background: "transparent",
      n: 1,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const json: any = await res.json();
  return imageAsset(Buffer.from(json.data[0].b64_json, "base64"), model);
}

/** fal.ai (FLUX) — key via env or keychain. */
async function generateFal(prompt: string, _opts: ProviderOptions): Promise<GeneratedAsset> {
  const provider = assetProviders.fal;
  const key = providerKey(provider);
  if (!key) throw missingKeyMessage(provider);
  const res = await fetch("https://fal.run/fal-ai/flux/dev", {
    method: "POST",
    headers: { authorization: `Key ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ prompt, image_size: "square_hd" }),
  });
  if (!res.ok) throw new Error(`fal ${res.status}: ${await res.text()}`);
  const json: any = await res.json();
  const url = json.images?.[0]?.url;
  if (!url) throw new Error("fal: no image in response");
  return imageAsset(Buffer.from(await (await fetch(url)).arrayBuffer()), "fal-ai/flux/dev");
}

/** Local Codex CLI — drives the authed `codex` agent on YOUR subscription (no API key). */
async function generateCodex(prompt: string, opts: ProviderOptions): Promise<GeneratedAsset> {
  const dir = await mkdtemp(join(tmpdir(), "assetgen-"));
  const out = join(dir, "out.png");
  await runCodexCli({ prompt, outPath: out, cwd: dir, log: opts.log });
  return imageAsset(await readFile(out), "codex-cli");
}

async function generateReplicate(kind: AssetKind, prompt: string, opts: ProviderOptions): Promise<GeneratedAsset> {
  const provider = assetProviders.replicate;
  const key = providerKey(provider);
  if (!key) throw missingKeyMessage(provider);
  const model = opts.model ?? (MODEL_KINDS.includes(kind as any) ? undefined : provider.defaultModel);
  if (!model) throw new Error("Replicate model assets require --model <owner/model> or a configured model id");
  const prediction = await createReplicatePrediction(model, key, prompt, opts);
  const completed = await waitForReplicatePrediction(prediction, key, opts);
  const url = outputUrl(completed.output);
  if (!url) throw new Error("replicate: prediction completed without a downloadable output URL");
  return downloadGeneratedAsset(url, model);
}

async function createReplicatePrediction(
  model: string,
  key: string,
  prompt: string,
  opts: ProviderOptions,
): Promise<any> {
  const res = await fetch(`https://api.replicate.com/v1/models/${model}/predictions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      prefer: "wait=60",
    },
    body: JSON.stringify({
      input: { prompt },
    }),
  });
  if (!res.ok) throw new Error(`replicate ${res.status}: ${await res.text()}`);
  const json: any = await res.json();
  opts.log?.(`[replicate] ${json.status ?? "created"} ${json.id ?? model}\n`);
  return json;
}

async function waitForReplicatePrediction(prediction: any, key: string, opts: ProviderOptions): Promise<any> {
  const done = new Set(["succeeded", "failed", "canceled"]);
  let current = prediction;
  const started = Date.now();
  const timeoutMs = opts.timeoutMs ?? 300_000;
  const intervalMs = opts.pollIntervalMs ?? 1_500;
  while (current?.status && !done.has(current.status)) {
    if (Date.now() - started > timeoutMs) throw new Error(`replicate: timed out after ${Math.round(timeoutMs / 1000)}s`);
    const pollUrl = current.urls?.get ?? current.urls?.self;
    if (!pollUrl) throw new Error("replicate: prediction has no polling URL");
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    const res = await fetch(pollUrl, { headers: { authorization: `Bearer ${key}` } });
    if (!res.ok) throw new Error(`replicate poll ${res.status}: ${await res.text()}`);
    current = await res.json();
    opts.log?.(`[replicate] ${current.status ?? "poll"}\n`);
  }
  if (current?.status !== "succeeded") throw new Error(`replicate: prediction ${current?.status ?? "failed"}`);
  return current;
}

async function generateSuno(kind: AssetKind, prompt: string, opts: ProviderOptions): Promise<GeneratedAsset> {
  const provider = assetProviders.suno;
  const key = providerKey(provider);
  if (!key) throw missingKeyMessage(provider);
  const endpoint = process.env.SUNO_API_BASE_URL;
  if (!endpoint) {
    throw new Error(
      "Suno provider needs SUNO_API_BASE_URL pointing at a licensed Suno-compatible API endpoint. " +
        "assetgen stores SUNO_API_KEY securely but does not hardcode an unofficial endpoint.",
    );
  }
  const model = opts.model ?? provider.defaultModel;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      prompt,
      model,
      make_instrumental: kind === "sfx",
      wait_audio: true,
    }),
  });
  if (!res.ok) throw new Error(`suno ${res.status}: ${await res.text()}`);
  const json: any = await res.json();
  const url = outputUrl(json);
  if (!url) throw new Error("suno: response did not include an audio URL");
  return downloadGeneratedAsset(url, model);
}

async function downloadGeneratedAsset(url: string, model?: string): Promise<GeneratedAsset> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${res.status}: ${await res.text()}`);
  const mediaType = res.headers.get("content-type")?.split(";")[0]?.trim() || mediaTypeFromUrl(url);
  return {
    data: Buffer.from(await res.arrayBuffer()),
    mediaType,
    extension: extensionForMediaType(mediaType, url),
    model,
  };
}

function outputUrl(output: unknown): string | undefined {
  if (typeof output === "string") return output;
  if (Array.isArray(output)) return output.find((item): item is string => typeof item === "string");
  if (output && typeof output === "object") {
    const obj = output as Record<string, unknown>;
    const direct = obj.audio_url ?? obj.audioUrl ?? obj.image_url ?? obj.imageUrl ?? obj.url;
    if (typeof direct === "string") return direct;
    if (Array.isArray(obj.data)) return outputUrl(obj.data);
    if (obj.output) return outputUrl(obj.output);
  }
  return undefined;
}

function mediaTypeFromUrl(url: string): string {
  if (url.endsWith(".webp")) return "image/webp";
  if (url.endsWith(".jpg") || url.endsWith(".jpeg")) return "image/jpeg";
  if (url.endsWith(".mp3")) return "audio/mpeg";
  if (url.endsWith(".ogg")) return "audio/ogg";
  if (url.endsWith(".webm")) return "audio/webm";
  if (url.endsWith(".wav")) return "audio/wav";
  if (url.endsWith(".glb")) return "model/gltf-binary";
  return "application/octet-stream";
}

export function extensionForMediaType(mediaType: string, url = ""): string {
  if (mediaType === "image/png") return "png";
  if (mediaType === "image/webp") return "webp";
  if (mediaType === "image/jpeg") return "jpg";
  if (mediaType === "audio/mpeg") return "mp3";
  if (mediaType === "audio/ogg") return "ogg";
  if (mediaType === "audio/webm") return "webm";
  if (mediaType === "audio/wav") return "wav";
  if (mediaType === "model/gltf-binary") return "glb";
  const match = url.match(/\.([a-z0-9]{2,5})(?:\?|#|$)/i);
  return match?.[1]?.toLowerCase() ?? "bin";
}

/** Offline placeholder for dry-runs / pipeline tests. */
async function generateMock(_kind: AssetKind, _prompt: string, opts: ProviderOptions): Promise<GeneratedAsset> {
  const n = parseInt(opts.size, 10) || 256;
  const data = await sharp({
    create: { width: n, height: n, channels: 4, background: { r: 26, g: 20, b: 20, alpha: 1 } },
  })
    .png()
    .toBuffer();
  return imageAsset(data, "mock");
}

export const assetProviders: Record<ProviderId, AssetProvider> = {
  codex: {
    id: "codex",
    label: "Codex CLI",
    supports: IMAGE_KINDS,
    defaultModel: "codex-cli",
    generate: (_kind, prompt, opts) => generateCodex(prompt, opts),
  },
  openai: {
    id: "openai",
    label: "OpenAI API",
    supports: IMAGE_KINDS,
    defaultModel: "gpt-image-2",
    key: { envName: "OPENAI_API_KEY", service: "shipshit-openai", label: "OpenAI" },
    generate: (_kind, prompt, opts) => generateOpenAi(prompt, opts),
  },
  fal: {
    id: "fal",
    label: "fal.ai",
    supports: IMAGE_KINDS,
    defaultModel: "fal-ai/flux/dev",
    key: { envName: "FAL_KEY", service: "shipshit-fal", label: "fal.ai" },
    generate: (_kind, prompt, opts) => generateFal(prompt, opts),
  },
  replicate: {
    id: "replicate",
    label: "Replicate",
    supports: [...IMAGE_KINDS, ...MODEL_KINDS],
    defaultModel: "black-forest-labs/flux-schnell",
    key: { envName: "REPLICATE_API_TOKEN", service: "shipshit-replicate", label: "Replicate" },
    generate: (kind, prompt, opts) => generateReplicate(kind, prompt, opts),
  },
  suno: {
    id: "suno",
    label: "Suno-compatible audio",
    supports: AUDIO_KINDS,
    defaultModel: "suno",
    key: { envName: "SUNO_API_KEY", service: "shipshit-suno", label: "Suno" },
    generate: (kind, prompt, opts) => generateSuno(kind, prompt, opts),
  },
  mock: {
    id: "mock",
    label: "Mock",
    supports: ["*"],
    defaultModel: "mock",
    generate: generateMock,
  },
};

export function providerSupportsKind(provider: AssetProvider, kind: AssetKind): boolean {
  return provider.supports.includes("*") || provider.supports.includes(kind);
}

export function defaultProviderForKind(kind: AssetKind): ProviderId {
  return DEFAULT_PROVIDER_BY_KIND[kind] ?? "codex";
}

export function resolveProvider(kind: AssetKind, providerId?: string): AssetProvider {
  const id = (providerId || defaultProviderForKind(kind)) as ProviderId;
  const provider = assetProviders[id];
  if (!provider) throw new Error(`unknown provider: ${providerId}`);
  if (!providerSupportsKind(provider, kind)) {
    throw new Error(`${id} does not support ${kind} assets (supported: ${provider.supports.join(", ")})`);
  }
  return provider;
}

export async function generateAsset(
  kind: AssetKind,
  prompt: string,
  opts: ProviderOptions & { provider?: string },
): Promise<GeneratedAsset & { provider: ProviderId }> {
  const provider = resolveProvider(kind, opts.provider);
  const asset = await provider.generate(kind, prompt, opts);
  return { ...asset, provider: provider.id, model: asset.model ?? opts.model ?? provider.defaultModel };
}

export const openai: Provider = async (prompt, opts) => (await generateAsset("sprite", prompt, { ...opts, provider: "openai" })).data;
export const fal: Provider = async (prompt, opts) => (await generateAsset("sprite", prompt, { ...opts, provider: "fal" })).data;
export const codex: Provider = async (prompt, opts) => (await generateAsset("sprite", prompt, { ...opts, provider: "codex" })).data;
export const mock: Provider = async (prompt, opts) => (await generateAsset("sprite", prompt, { ...opts, provider: "mock" })).data;

export const providers: Record<string, Provider> = Object.fromEntries(
  Object.entries(assetProviders).map(([id]) => [
    id,
    async (prompt: string, opts: ProviderOptions) => (await generateAsset("sprite", prompt, { ...opts, provider: id })).data,
  ]),
);
