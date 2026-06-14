import { createHash } from "node:crypto";

/**
 * Reproducibility provenance for a generated asset (issue #55). Captured at
 * generation time so a maintainer can answer "what produced this, and can I
 * reproduce it?" straight from the manifest.
 *
 * Kept tiny and dependency-light (just node:crypto): pipeline.ts imports it at
 * runtime, while manifest.ts imports the *types only* so the desktop main
 * bundle never drags crypto in through its `register()` import.
 */
export interface AssetProvenance {
  /** Provider that produced the asset (codex/openai/fal/...). */
  provider: string;
  /** Model id the provider reported using. */
  model?: string;
  /** Finer-grained model version, when the provider distinguishes it. */
  modelVersion?: string;
  /** Seed the provider honored — present only when generation was seedable. */
  seed?: number;
  /** Whether re-running with the same inputs is expected to reproduce the asset. */
  reproducible: boolean;
  /** sha256/16 of the raw user prompt (style suffix excluded). */
  promptHash: string;
  /** sha256/16 of the style canon applied to the prompt ("" for non-styled kinds). */
  styleSuffixHash: string;
  /** Provider request id, when one is returned (fal exposes this). */
  requestId?: string;
  /** ISO calendar date the asset was generated. */
  date: string;
}

/** Human-authorship disclosure (issue #55): set when a person hand-authored or edited the asset. */
export interface AssetHumanAuthorship {
  authored: boolean;
  /** What the human did, e.g. "retouch", "recolor", "composite". */
  editKind?: string;
}

/** sha256 truncated to 16 hex chars — the repo's standard short content hash (mirrors usage.ts). */
export function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

/** Short hash of the raw user prompt. */
export function promptHash(prompt: string): string {
  return shortHash(prompt);
}

/** Short hash of the style canon applied to a prompt (empty string for non-styled kinds). */
export function styleSuffixHash(styleSuffix: string): string {
  return shortHash(styleSuffix);
}

/** Provider-reported reproducibility hints, threaded up from `GeneratedAsset.meta`. */
export interface ProvenanceMeta {
  model?: string;
  modelVersion?: string;
  seed?: number;
  requestId?: string;
  reproducible?: boolean;
}

export interface BuildProvenanceInput {
  provider: string;
  /** Raw user prompt (not the style-augmented one). */
  prompt: string;
  /** Style canon applied to the prompt; "" when the kind has none (e.g. audio). */
  styleSuffix: string;
  date: Date | string;
  meta?: ProvenanceMeta;
}

/** Assemble the manifest provenance record from the prompt, style canon, and provider meta. */
export function buildProvenance(input: BuildProvenanceInput): AssetProvenance {
  const meta = input.meta ?? {};
  const provenance: AssetProvenance = {
    provider: input.provider,
    reproducible: meta.reproducible ?? false,
    promptHash: promptHash(input.prompt),
    styleSuffixHash: styleSuffixHash(input.styleSuffix),
    date: isoDate(input.date),
  };
  if (meta.model) provenance.model = meta.model;
  if (meta.modelVersion) provenance.modelVersion = meta.modelVersion;
  if (meta.seed !== undefined) provenance.seed = meta.seed;
  if (meta.requestId) provenance.requestId = meta.requestId;
  return provenance;
}

function isoDate(value: Date | string): string {
  const iso = value instanceof Date ? value.toISOString() : value;
  return iso.includes("T") ? iso.slice(0, 10) : iso;
}
