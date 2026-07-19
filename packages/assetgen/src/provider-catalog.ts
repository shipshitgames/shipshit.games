import { DEFAULT_FAL_MODEL, FAL_KEY_CONFIG, FAL_MODELS } from "./fal.ts";
import type { FalModel } from "./fal.ts";
import type { ProviderKeyConfig } from "./keys.ts";
import { REPLICATE_KEY_CONFIG } from "./replicate.ts";

/**
 * The pure provider catalog — every fact about a provider that does NOT need its
 * heavy implementation: ids, labels, supported kinds, default models, key configs,
 * and the kind→provider routing table.
 *
 * Same bundle-safety contract as media.ts / fal.ts: zero sharp / node-pty / codex
 * imports (the only `import` is the fal model constants and the `ProviderKeyConfig`
 * *type*, both bundle-safe). The Electron main process imports this module directly
 * and the renderer receives it over IPC, so the catalog no longer has to be
 * hand-copied into desktop (where the copies had already drifted — the desktop
 * mirrors were missing the `sprite-anim` → codex routing this table carries).
 *
 * providers.ts zips {@link PROVIDER_CATALOG} with the generate functions to build
 * the runnable `assetProviders` registry and re-exports these symbols, so every
 * existing import site keeps compiling against `./providers.ts`.
 */

export type { ProviderKeyConfig } from "./keys.ts";

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

export const IMAGE_KINDS = ["sprite", "sprite-anim", "texture", "icon", "map"] as const;
export const AUDIO_KINDS = ["music", "sfx", "voice"] as const;
export const MODEL_KINDS = ["model", "3d"] as const;

/**
 * Default provider per asset kind. THE canonical routing table — the source the
 * desktop copies had drifted from (both were missing `sprite-anim`, so desktop
 * routed it to the fallback provider instead of codex).
 */
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

/**
 * Pure descriptor for a provider: everything `AssetProvider` carries except the
 * `generate` function (which lives behind the heavy import chain in providers.ts).
 */
export interface ProviderDescriptor {
  id: ProviderId;
  label: string;
  supports: readonly string[];
  defaultModel?: string;
  models?: readonly FalModel[];
  key?: ProviderKeyConfig;
  /** The adapter consumes referenceImages instead of silently ignoring them. */
  referenceImages?: boolean;
}

export const PROVIDER_CATALOG: Record<ProviderId, ProviderDescriptor> = {
  codex: {
    id: "codex",
    label: "Codex CLI",
    supports: IMAGE_KINDS,
    defaultModel: "codex-cli",
    referenceImages: true,
  },
  openai: {
    id: "openai",
    label: "OpenAI API",
    supports: IMAGE_KINDS,
    defaultModel: "gpt-image-2",
    referenceImages: true,
    key: { envName: "OPENAI_API_KEY", service: "shipshit-openai", label: "OpenAI" },
  },
  fal: {
    id: "fal",
    label: "fal.ai",
    supports: IMAGE_KINDS,
    defaultModel: DEFAULT_FAL_MODEL,
    models: FAL_MODELS,
    key: FAL_KEY_CONFIG,
    referenceImages: true,
  },
  replicate: {
    id: "replicate",
    label: "Replicate",
    supports: [...IMAGE_KINDS, ...MODEL_KINDS],
    defaultModel: "black-forest-labs/flux-schnell",
    key: REPLICATE_KEY_CONFIG,
  },
  meshy: {
    id: "meshy",
    label: "Meshy (text → 3D)",
    supports: MODEL_KINDS,
    defaultModel: "meshy",
    key: { envName: "MESHY_API_KEY", service: "shipshit-meshy", label: "Meshy" },
  },
  tripo: {
    id: "tripo",
    label: "Tripo (text → 3D)",
    supports: MODEL_KINDS,
    defaultModel: "tripo",
    key: { envName: "TRIPO_API_KEY", service: "shipshit-tripo", label: "Tripo" },
  },
  suno: {
    id: "suno",
    label: "Suno-compatible audio",
    supports: AUDIO_KINDS,
    defaultModel: "suno",
    key: { envName: "SUNO_API_KEY", service: "shipshit-suno", label: "Suno" },
  },
  elevenlabs: {
    id: "elevenlabs",
    label: "ElevenLabs SFX",
    supports: ["sfx"],
    defaultModel: "eleven_text_to_sound_v2",
    key: { envName: "ELEVENLABS_API_KEY", service: "shipshit-elevenlabs", label: "ElevenLabs" },
  },
  beatoven: {
    id: "beatoven",
    label: "Beatoven (perpetual-commercial music)",
    supports: ["music"],
    defaultModel: "beatoven",
    key: { envName: "BEATOVEN_API_KEY", service: "shipshit-beatoven", label: "Beatoven" },
  },
  mock: {
    id: "mock",
    label: "Mock",
    supports: ["*"],
    defaultModel: "mock",
    referenceImages: true,
  },
};

/** The default provider for a kind, falling back to codex for unknown kinds. */
export function defaultProviderForKind(kind: AssetKind): ProviderId {
  return DEFAULT_PROVIDER_BY_KIND[kind] ?? "codex";
}

/**
 * Whether a provider can render a kind. Structural in its argument (just needs
 * `supports`) so it works for both a {@link ProviderDescriptor} and a full
 * `AssetProvider`. `"*"` matches every kind (the mock provider).
 */
export function providerSupportsKind(provider: { supports: readonly string[] }, kind: AssetKind): boolean {
  return provider.supports.includes("*") || provider.supports.includes(kind);
}
