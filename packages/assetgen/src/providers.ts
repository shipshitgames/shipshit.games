import { readFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { isAudioKind } from "./audio.ts";
import { runCodexCli } from "./codex.ts";
import { DEFAULT_FAL_MODEL, FAL_KEY_CONFIG, FAL_MODELS, generateFalAsset } from "./fal.ts";
import type { FalModel } from "./fal.ts";
import { getKey } from "./keys.ts";
import { downloadGeneratedAsset, outputUrl } from "./media.ts";
import type { GeneratedAsset, GeneratedAssetMeta } from "./media.ts";

export type { GeneratedAsset } from "./media.ts";
export { extensionForMediaType } from "./media.ts";

export type ProviderId = "codex" | "openai" | "fal" | "replicate" | "suno" | "elevenlabs" | "beatoven" | "mock";
export type AssetKind = "sprite" | "texture" | "icon" | "map" | "music" | "sfx" | "voice" | "model" | "3d" | string;

export interface ProviderOptions {
  size: string;
  model?: string;
  log?: (chunk: string) => void;
  timeoutMs?: number;
  pollIntervalMs?: number;
  /** Reproducibility seed; only the seedable providers (openai/fal) honor it. */
  seed?: number;
}

export type Provider = (prompt: string, opts: ProviderOptions) => Promise<Buffer>;

export interface ProviderKeyConfig {
  envName: string;
  service: string;
  label: string;
}

export interface AssetProvider {
  id: ProviderId;
  label: string;
  supports: readonly string[];
  defaultModel?: string;
  models?: readonly FalModel[];
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

function imageAsset(data: Buffer, model?: string, meta?: GeneratedAssetMeta): GeneratedAsset {
  return { data, mediaType: "image/png", extension: "png", model, meta };
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

/** Pure builder for the OpenAI Images request body (no IO; unit-testable). */
export function openAiImageBody(
  prompt: string,
  model: string,
  size: string,
  seed?: number,
): Record<string, unknown> {
  const body: Record<string, unknown> = { model, prompt, size, background: "transparent", n: 1 };
  // Only sent when supplied, so the default (seedless) request stays byte-identical.
  if (seed !== undefined) body.seed = seed;
  return body;
}

/** Pure builder for OpenAI asset meta: a supplied seed is honored → reproducible. */
export function openAiAssetMeta(model: string, seed?: number): GeneratedAssetMeta {
  const meta: GeneratedAssetMeta = { model, reproducible: seed !== undefined };
  if (seed !== undefined) meta.seed = seed;
  return meta;
}

/** OpenAI Images (gpt-image-2 by default) — transparent PNG. Key via env or keychain. */
export async function generateOpenAi(
  prompt: string,
  opts: ProviderOptions,
  deps: { fetchImpl?: typeof fetch; getKeyImpl?: typeof getKey } = {},
): Promise<GeneratedAsset> {
  const provider = assetProviders.openai;
  const keyCfg = provider.key!;
  const key = (deps.getKeyImpl ?? getKey)(keyCfg.envName, keyCfg.service);
  if (!key) throw missingKeyMessage(provider);
  const model = opts.model ?? provider.defaultModel ?? "gpt-image-2";
  const res = await (deps.fetchImpl ?? fetch)("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify(openAiImageBody(prompt, model, opts.size, opts.seed)),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const json: any = await res.json();
  return imageAsset(Buffer.from(json.data[0].b64_json, "base64"), model, openAiAssetMeta(model, opts.seed));
}

/** Local Codex CLI — drives the authed `codex` agent on YOUR subscription (no API key). */
export async function generateCodex(
  prompt: string,
  opts: ProviderOptions,
  deps: { runCodexCliImpl?: typeof runCodexCli } = {},
): Promise<GeneratedAsset> {
  const dir = await mkdtemp(join(tmpdir(), "assetgen-"));
  const out = join(dir, "out.png");
  await (deps.runCodexCliImpl ?? runCodexCli)({ prompt, outPath: out, cwd: dir, log: opts.log });
  // The local Codex agent isn't seed-driven, so a render is never reproducible.
  return imageAsset(await readFile(out), "codex-cli", { model: "codex-cli", reproducible: false });
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

/** Pure builder for the ElevenLabs text-to-sound request (no IO; unit-testable). */
export function elevenLabsSfxRequest(
  prompt: string,
  key: string,
  _opts: ProviderOptions,
): { url: string; headers: Record<string, string>; body: string } {
  return {
    url: "https://api.elevenlabs.io/v1/sound-generation",
    headers: { "xi-api-key": key, "content-type": "application/json", accept: "audio/mpeg" },
    body: JSON.stringify({ text: prompt }),
  };
}

/** ElevenLabs SFX (perpetual commercial on a paid plan). Returns audio/mpeg. */
export async function generateElevenLabs(
  _kind: AssetKind,
  prompt: string,
  opts: ProviderOptions,
  deps: { fetchImpl?: typeof fetch; getKeyImpl?: typeof getKey } = {},
): Promise<GeneratedAsset> {
  const key = (deps.getKeyImpl ?? getKey)("ELEVENLABS_API_KEY", "shipshit-elevenlabs");
  if (!key) throw missingKeyMessage(assetProviders.elevenlabs);
  const req = elevenLabsSfxRequest(prompt, key, opts);
  const res = await (deps.fetchImpl ?? fetch)(req.url, { method: "POST", headers: req.headers, body: req.body });
  if (!res.ok) throw new Error(`elevenlabs ${res.status}: ${await res.text()}`);
  return {
    data: Buffer.from(await res.arrayBuffer()),
    mediaType: "audio/mpeg",
    extension: "mp3",
    model: opts.model ?? assetProviders.elevenlabs.defaultModel,
  };
}

/** Beatoven (perpetual-commercial music). Mirrors generateSuno's endpoint guard. */
export async function generateBeatoven(
  _kind: AssetKind,
  prompt: string,
  opts: ProviderOptions,
  deps: { fetchImpl?: typeof fetch; getKeyImpl?: typeof getKey } = {},
): Promise<GeneratedAsset> {
  const key = (deps.getKeyImpl ?? getKey)("BEATOVEN_API_KEY", "shipshit-beatoven");
  if (!key) throw missingKeyMessage(assetProviders.beatoven);
  const endpoint = process.env.BEATOVEN_API_BASE_URL;
  if (!endpoint) {
    throw new Error(
      "Beatoven provider needs BEATOVEN_API_BASE_URL pointing at a licensed perpetual-commercial Beatoven API endpoint. " +
        "assetgen stores BEATOVEN_API_KEY securely but does not hardcode an unofficial endpoint.",
    );
  }
  const model = opts.model ?? assetProviders.beatoven.defaultModel;
  const res = await (deps.fetchImpl ?? fetch)(endpoint, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ prompt, model }),
  });
  if (!res.ok) throw new Error(`beatoven ${res.status}: ${await res.text()}`);
  const json: any = await res.json();
  const url = outputUrl(json);
  if (!url) throw new Error("beatoven: response did not include an audio URL");
  return downloadGeneratedAsset(url, model, deps.fetchImpl);
}

/** Deterministic silent 16-bit mono PCM WAV (RIFF/WAVE) — no randomness, no Date. */
function makeSilentWav(seconds = 1, sampleRate = 8000): Buffer {
  const dataSize = sampleRate * 2 * seconds; // 16-bit mono => 2 bytes/sample
  const buf = Buffer.alloc(44 + dataSize); // header + silent (zero) PCM data
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8, "ascii");
  buf.write("fmt ", 12, "ascii");
  buf.writeUInt32LE(16, 16); // fmt chunk size
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28); // byteRate
  buf.writeUInt16LE(2, 32); // blockAlign
  buf.writeUInt16LE(16, 34); // bits per sample
  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(dataSize, 40);
  return buf;
}

/** Offline placeholder for dry-runs / pipeline tests. Audio-aware (issue #21). */
async function generateMock(kind: AssetKind, _prompt: string, opts: ProviderOptions): Promise<GeneratedAsset> {
  // The offline placeholder is never a real render, so it is never reproducible
  // — but it echoes any requested seed so tests can assert the seed threaded through.
  const meta: GeneratedAssetMeta = { model: "mock", reproducible: false };
  if (opts.seed !== undefined) meta.seed = opts.seed;
  if (isAudioKind(kind)) {
    return { data: makeSilentWav(), mediaType: "audio/wav", extension: "wav", model: "mock", meta };
  }
  const n = parseInt(opts.size, 10) || 256;
  const data = await sharp({
    create: { width: n, height: n, channels: 4, background: { r: 26, g: 20, b: 20, alpha: 1 } },
  })
    .png()
    .toBuffer();
  return imageAsset(data, "mock", meta);
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
    defaultModel: DEFAULT_FAL_MODEL,
    models: FAL_MODELS,
    key: FAL_KEY_CONFIG,
    generate: (kind, prompt, opts) => generateFalAsset(kind, prompt, opts),
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
  elevenlabs: {
    id: "elevenlabs",
    label: "ElevenLabs SFX",
    supports: ["sfx"],
    defaultModel: "eleven_text_to_sound_v2",
    key: { envName: "ELEVENLABS_API_KEY", service: "shipshit-elevenlabs", label: "ElevenLabs" },
    generate: (kind, prompt, opts) => generateElevenLabs(kind, prompt, opts),
  },
  beatoven: {
    id: "beatoven",
    label: "Beatoven (perpetual-commercial music)",
    supports: ["music"],
    defaultModel: "beatoven",
    key: { envName: "BEATOVEN_API_KEY", service: "shipshit-beatoven", label: "Beatoven" },
    generate: (kind, prompt, opts) => generateBeatoven(kind, prompt, opts),
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
): Promise<GeneratedAsset & { provider: ProviderId; meta: GeneratedAssetMeta }> {
  const provider = resolveProvider(kind, opts.provider);
  const asset = await provider.generate(kind, prompt, opts);
  const model = asset.model ?? opts.model ?? provider.defaultModel;
  // Every asset carries a meta: providers that opt out still record reproducible:false.
  const meta: GeneratedAssetMeta = {
    reproducible: false,
    ...asset.meta,
    model: asset.meta?.model ?? model,
  };
  return { ...asset, provider: provider.id, model, meta };
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
