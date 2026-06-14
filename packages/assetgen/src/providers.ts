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
import type { GeneratedAsset } from "./media.ts";

export type { GeneratedAsset } from "./media.ts";
export { extensionForMediaType } from "./media.ts";

export type ProviderId =
  | "codex"
  | "openai"
  | "fal"
  | "replicate"
  | "meshy"
  | "tripo"
  | "suno"
  | "elevenlabs"
  | "beatoven"
  | "mock";
export type AssetKind = "sprite" | "texture" | "icon" | "map" | "music" | "sfx" | "voice" | "model" | "3d" | string;

export interface ProviderOptions {
  size: string;
  model?: string;
  log?: (chunk: string) => void;
  timeoutMs?: number;
  pollIntervalMs?: number;
  /**
   * Per-HTTP-request timeout for polled task providers (Meshy/Tripo). The
   * `timeoutMs` deadline only bounds the *whole* task and is checked between
   * polls, so without this a single hung connection blocks indefinitely.
   */
  requestTimeoutMs?: number;
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
  model: "meshy",
  "3d": "meshy",
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

// ── Meshy / Tripo: text/image → raw GLB via an async task (issue #20) ────────
//
// Both vendors share the same shape: POST to create a generation task, then
// poll a task endpoint until it carries a downloadable GLB. The request/parse
// pieces are pure (unit-testable without network); `runModelTask` is the one
// generic poll loop that drives any client.

export interface ModelTaskRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
}

export interface ModelPollRequest {
  url: string;
  headers: Record<string, string>;
}

export interface ModelTaskStatus {
  /** Raw provider status string, surfaced in logs. */
  state: string;
  /** Whether the task has reached a terminal state (succeeded or failed). */
  done: boolean;
  /** Whether the task finished successfully. */
  succeeded: boolean;
  /** Downloadable GLB url, present once `succeeded`. */
  glbUrl?: string;
}

/** Pure, per-vendor description of how to start, poll, and read a model task. */
export interface ModelProviderClient {
  id: ProviderId;
  createTask(prompt: string, key: string, opts: ProviderOptions): ModelTaskRequest;
  parseTaskId(json: unknown): string;
  pollTask(taskId: string, key: string, opts: ProviderOptions): ModelPollRequest;
  parseStatus(json: unknown): ModelTaskStatus;
}

function trimBaseUrl(value: string | undefined, fallback: string): string {
  return (value ?? fallback).replace(/\/+$/, "");
}

/**
 * Meshy text-to-3D (https://docs.meshy.ai). Returns a raw GLB url on success.
 *
 * NOTE: this drives Meshy's `preview` mode, which yields a base (geometry-only,
 * untextured) mesh. Textured PBR output needs a second `refine` task that
 * references the preview id — a follow-up beyond this issue's scope — so in
 * practice the optimize's texture-compression path is exercised by Tripo's
 * `pbr_model`, not by Meshy preview output. The optimize still records the truth
 * (textureFormat "none" when no textures are present).
 */
export const meshyClient: ModelProviderClient = {
  id: "meshy",
  createTask(prompt, key, opts) {
    const base = trimBaseUrl(process.env.MESHY_API_BASE_URL, "https://api.meshy.ai");
    return {
      url: `${base}/openapi/v2/text-to-3d`,
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        mode: "preview",
        prompt,
        art_style: "realistic",
        should_remesh: true,
        ...(opts.model ? { ai_model: opts.model } : {}),
      }),
    };
  },
  parseTaskId(json) {
    const obj = json as Record<string, unknown> | null;
    const id = obj?.result ?? obj?.id;
    if (typeof id !== "string" || !id) throw new Error("meshy: create response missing task id");
    return id;
  },
  pollTask(taskId, key) {
    const base = trimBaseUrl(process.env.MESHY_API_BASE_URL, "https://api.meshy.ai");
    return { url: `${base}/openapi/v2/text-to-3d/${taskId}`, headers: { authorization: `Bearer ${key}` } };
  },
  parseStatus(json) {
    const obj = (json ?? {}) as Record<string, unknown>;
    const state = String(obj.status ?? "PENDING");
    const succeeded = state === "SUCCEEDED";
    const done = succeeded || ["FAILED", "CANCELED", "EXPIRED"].includes(state);
    const urls = obj.model_urls as Record<string, unknown> | undefined;
    const glbUrl = typeof urls?.glb === "string" ? urls.glb : undefined;
    return { state, done, succeeded, glbUrl };
  },
};

/** Tripo text-to-model (https://platform.tripo3d.ai). Returns a raw GLB url on success. */
export const tripoClient: ModelProviderClient = {
  id: "tripo",
  createTask(prompt, key, opts) {
    const base = trimBaseUrl(process.env.TRIPO_API_BASE_URL, "https://api.tripo3d.ai");
    return {
      url: `${base}/v2/openapi/task`,
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        type: "text_to_model",
        prompt,
        ...(opts.model ? { model_version: opts.model } : {}),
      }),
    };
  },
  parseTaskId(json) {
    const data = (json as Record<string, unknown> | null)?.data as Record<string, unknown> | undefined;
    const id = data?.task_id ?? (json as Record<string, unknown> | null)?.task_id;
    if (typeof id !== "string" || !id) throw new Error("tripo: create response missing task id");
    return id;
  },
  pollTask(taskId, key) {
    const base = trimBaseUrl(process.env.TRIPO_API_BASE_URL, "https://api.tripo3d.ai");
    return { url: `${base}/v2/openapi/task/${taskId}`, headers: { authorization: `Bearer ${key}` } };
  },
  parseStatus(json) {
    const data = ((json as Record<string, unknown> | null)?.data ?? {}) as Record<string, unknown>;
    const state = String(data.status ?? "queued");
    const succeeded = state === "success";
    const done = succeeded || ["failed", "cancelled", "banned", "expired", "unknown"].includes(state);
    const output = (data.output ?? {}) as Record<string, unknown>;
    const candidate = output.pbr_model ?? output.model;
    const glbUrl = typeof candidate === "string" ? candidate : undefined;
    return { state, done, succeeded, glbUrl };
  },
};

const GLB_MAGIC = 0x46546c67; // "glTF" little-endian uint32 at byte 0.

/**
 * Reject a provider download that returned 200 but is not a GLB (an HTML error
 * page, a JSON body, a truncated file). Without this the bad bytes fail later
 * with an opaque gltf-transform parse error far from the cause.
 */
function assertGlbBody(data: Buffer, providerId: string): void {
  if (data.length < 12 || data.readUInt32LE(0) !== GLB_MAGIC) {
    throw new Error(`${providerId}: downloaded model is not a valid GLB (bad magic, ${data.length} bytes)`);
  }
}

/** Drive any {@link ModelProviderClient} create→poll→download cycle to a raw GLB. */
export async function runModelTask(
  client: ModelProviderClient,
  prompt: string,
  opts: ProviderOptions,
  deps: { fetchImpl?: typeof fetch; getKeyImpl?: typeof getKey } = {},
): Promise<GeneratedAsset> {
  const provider = assetProviders[client.id];
  const key = (deps.getKeyImpl ?? getKey)(provider.key!.envName, provider.key!.service);
  if (!key) throw missingKeyMessage(provider);
  const fetchImpl = deps.fetchImpl ?? fetch;
  // Bound each HTTP request so a single hung connection can't stall the task —
  // the overall `timeoutMs` is only checked between polls.
  const requestTimeoutMs = opts.requestTimeoutMs ?? 120_000;

  const create = client.createTask(prompt, key, opts);
  const createRes = await fetchImpl(create.url, {
    method: "POST",
    headers: create.headers,
    body: create.body,
    signal: AbortSignal.timeout(requestTimeoutMs),
  });
  if (!createRes.ok) throw new Error(`${client.id} ${createRes.status}: ${await createRes.text()}`);
  const taskId = client.parseTaskId(await createRes.json());
  opts.log?.(`[${client.id}] task ${taskId} created\n`);

  const started = Date.now();
  const timeoutMs = opts.timeoutMs ?? 300_000;
  const intervalMs = opts.pollIntervalMs ?? 2_000;
  for (;;) {
    const poll = client.pollTask(taskId, key, opts);
    const pollRes = await fetchImpl(poll.url, { headers: poll.headers, signal: AbortSignal.timeout(requestTimeoutMs) });
    if (!pollRes.ok) throw new Error(`${client.id} poll ${pollRes.status}: ${await pollRes.text()}`);
    const status = client.parseStatus(await pollRes.json());
    opts.log?.(`[${client.id}] ${status.state}\n`);
    if (status.done) {
      if (!status.succeeded) throw new Error(`${client.id}: task ${status.state}`);
      if (!status.glbUrl) throw new Error(`${client.id}: task succeeded without a GLB url`);
      const asset = await downloadGeneratedAsset(status.glbUrl, opts.model ?? provider.defaultModel, deps.fetchImpl);
      assertGlbBody(asset.data, client.id);
      return asset;
    }
    if (Date.now() - started > timeoutMs) {
      throw new Error(`${client.id}: timed out after ${Math.round(timeoutMs / 1000)}s`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
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

/** Offline placeholder for dry-runs / pipeline tests. Audio- and model-aware (issues #20, #21). */
async function generateMock(kind: AssetKind, _prompt: string, opts: ProviderOptions): Promise<GeneratedAsset> {
  if (isAudioKind(kind)) {
    return { data: makeSilentWav(), mediaType: "audio/wav", extension: "wav", model: "mock" };
  }
  if (MODEL_KINDS.includes(kind as (typeof MODEL_KINDS)[number])) {
    // Lazy import keeps the dependency-free GLB builder out of the mock's hot path.
    const { buildMinimalGlb } = await import("./glb-fixture.ts");
    return { data: buildMinimalGlb(), mediaType: "model/gltf-binary", extension: "glb", model: "mock" };
  }
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
  meshy: {
    id: "meshy",
    label: "Meshy (text → 3D)",
    supports: MODEL_KINDS,
    defaultModel: "meshy",
    key: { envName: "MESHY_API_KEY", service: "shipshit-meshy", label: "Meshy" },
    generate: (_kind, prompt, opts) => runModelTask(meshyClient, prompt, opts),
  },
  tripo: {
    id: "tripo",
    label: "Tripo (text → 3D)",
    supports: MODEL_KINDS,
    defaultModel: "tripo",
    key: { envName: "TRIPO_API_KEY", service: "shipshit-tripo", label: "Tripo" },
    generate: (_kind, prompt, opts) => runModelTask(tripoClient, prompt, opts),
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
