// `assetgen legal` policy engine (issue #59): classify the assets in a game's
// registration manifest ("the ledger") for legal review and emit disclosures.
//
// HARD RULE — this module FLAGS assets for human review and records the
// provider-stated license terms it was told about. It NEVER asserts a copyright
// or protectability conclusion. Every `disposition` here is advisory input to a
// human, not a determination. See {@link LEGAL_DISCLAIMER}, which every report
// carries.
//
// Dependency-light on purpose (type-only import of AssetEntry): the desktop main
// bundle can import this without dragging node:fs/crypto in.

import type { AssetEntry } from "./manifest.ts";

/** Where a flagged asset would be used; the conservative default is `in-game`. */
export type UsageContext = "in-game" | "marketing";
export const USAGE_CONTEXTS = ["in-game", "marketing"] as const;

export function isUsageContext(value: string): value is UsageContext {
  return (USAGE_CONTEXTS as readonly string[]).includes(value);
}

/**
 * Advisory disposition for a source's commercial/shipped use:
 *  - `allow`  — provider-stated terms grant the use (still advisory, never asserted)
 *  - `deny`   — provider-stated terms do NOT grant the use → banned source
 *  - `review` — conditional or unknown → a human must review before relying on it
 */
export type Disposition = "allow" | "deny" | "review";

/** Worst-case precedence when rolling several dispositions into one. */
const DISPOSITION_RANK: Record<Disposition, number> = { allow: 0, review: 1, deny: 2 };

/** The most cautious disposition across a set (deny beats review beats allow). */
export function rollupDisposition(dispositions: readonly Disposition[]): Disposition {
  let worst: Disposition = "allow";
  for (const d of dispositions) if (DISPOSITION_RANK[d] > DISPOSITION_RANK[worst]) worst = d;
  return worst;
}

interface PolicyBranch {
  disposition: Disposition;
  basis: string;
  /** Per-usage disposition overrides (e.g. ElevenLabs Music: in-game deny / marketing allow). */
  usage?: Partial<Record<UsageContext, Disposition>>;
}

interface PolicyDef extends PolicyBranch {
  label: string;
  /** Whether this source is an AI generator (vs. a converter or a hand-authoring tool). */
  ai: boolean;
  /** Kind/category-specific overrides, e.g. ElevenLabs music vs. its default (sfx). */
  byKind?: Record<string, PolicyBranch>;
}

/**
 * The source license policy table. Keyed by normalized source id (the manifest's
 * `license.tool` / `provenance.provider`). The audio-rights rows encode the paths
 * the PRD names explicitly:
 *   Udio = DENY, ElevenLabs Music in-game = DENY / marketing = ALLOW,
 *   Soundraw / Beatoven = perpetual-ALLOW.
 * Image/3D generators default to `review` because we never assert protectability —
 * a human confirms the provider's terms and the human-authorship story per asset.
 */
const SOURCE_POLICIES: Record<string, PolicyDef> = {
  udio: {
    label: "Udio",
    ai: true,
    disposition: "deny",
    basis: "Udio's terms do not grant the commercial/redistribution rights a shipped game needs",
  },
  soundraw: {
    label: "Soundraw",
    ai: true,
    disposition: "allow",
    basis: "perpetual commercial license on a paid plan (provider-stated)",
  },
  beatoven: {
    label: "Beatoven",
    ai: true,
    disposition: "allow",
    basis: "perpetual commercial license (provider-stated)",
  },
  elevenlabs: {
    label: "ElevenLabs",
    ai: true,
    // ElevenLabs SFX is perpetual-commercial on a paid plan; Music is the gated case.
    disposition: "allow",
    basis: "ElevenLabs SFX is perpetual commercial use on a paid plan (provider-stated)",
    byKind: {
      music: {
        disposition: "deny",
        basis: "ElevenLabs Music is not licensed for in-game use; marketing use is allowed (provider-stated)",
        usage: { "in-game": "deny", marketing: "allow" },
      },
    },
  },
  suno: {
    label: "Suno-compatible",
    ai: true,
    disposition: "review",
    basis: "rights depend on the licensed Suno-compatible endpoint's terms — verify before shipping",
  },
  codex: {
    label: "Codex CLI",
    ai: true,
    disposition: "review",
    basis: "AI-generated image — confirm provider terms and the human-authorship story for protectability",
  },
  openai: {
    label: "OpenAI",
    ai: true,
    disposition: "review",
    basis: "AI-generated image — confirm provider terms and the human-authorship story for protectability",
  },
  fal: {
    label: "fal.ai",
    ai: true,
    disposition: "review",
    basis: "AI-generated image — confirm the specific model's license and the human-authorship story",
  },
  replicate: {
    label: "Replicate",
    ai: true,
    disposition: "review",
    basis: "AI-generated — per-model license varies on Replicate; confirm the specific model's terms",
  },
  meshy: {
    label: "Meshy",
    ai: true,
    disposition: "review",
    basis: "AI-generated 3D model — confirm provider terms for shipped use",
  },
  tripo: {
    label: "Tripo",
    ai: true,
    disposition: "review",
    basis: "AI-generated 3D model — confirm provider terms for shipped use",
  },
  ffmpeg: {
    label: "ffmpeg",
    ai: false,
    disposition: "allow",
    basis: "format conversion only — carries the source asset's license, adds no new rights claim",
  },
  aseprite: {
    label: "Aseprite (hand-authored)",
    ai: false,
    disposition: "allow",
    basis: "hand-authored by a person — not AI-generated",
  },
  mock: {
    label: "Mock",
    ai: false,
    disposition: "review",
    basis: "placeholder/dry-run asset — not a shippable source",
  },
};

/** Known source ids the policy table maps (exported for tests/tooling). */
export const KNOWN_SOURCES = Object.keys(SOURCE_POLICIES);

const SOURCE_ALIASES: Record<string, string> = {
  "codex-cli": "codex",
  "eleven labs": "elevenlabs",
  eleven_labs: "elevenlabs",
  "eleven-labs": "elevenlabs",
  "open-ai": "openai",
  "openai api": "openai",
  "fal.ai": "fal",
  "fal-ai": "fal",
};

/** Lowercase + trim + de-alias a raw `license.tool` / provider into a policy key. */
export function normalizeSource(raw: string | undefined): string {
  const key = (raw ?? "").trim().toLowerCase();
  return SOURCE_ALIASES[key] ?? key;
}

/** Reduce a kind/category to the bare audio/asset category used for policy + Steam buckets. */
export function normalizeKind(raw: string | undefined): string {
  const key = (raw ?? "").trim().toLowerCase();
  return key.startsWith("audio/") ? key.slice("audio/".length) : key;
}

/** The asset's effective category: explicit audio `category`, else its `kind`. */
export function assetCategory(entry: Pick<AssetEntry, "kind" | "category">): string {
  return normalizeKind(entry.category ?? entry.kind);
}

export interface ResolvedPolicy {
  /** Normalized source id. */
  source: string;
  /** Display label for reports/disclosure. */
  label: string;
  /** Whether the source is an AI generator. */
  ai: boolean;
  /** Disposition resolved for the given usage + kind. */
  disposition: Disposition;
  /** Neutral, provider-stated basis — not a legal conclusion. */
  basis: string;
  /** False when the source is unmapped (always flagged for review). */
  known: boolean;
}

/** Resolve the policy for a raw source under a usage context and optional kind. */
export function resolveSourcePolicy(
  rawSource: string | undefined,
  opts: { kind?: string; usage?: UsageContext } = {},
): ResolvedPolicy {
  const usage = opts.usage ?? "in-game";
  const source = normalizeSource(rawSource);
  const def = SOURCE_POLICIES[source];
  if (!def) {
    return {
      source: source || "(unknown)",
      label: (rawSource ?? "").trim() || "(unknown)",
      ai: true,
      disposition: "review",
      basis: "unmapped source — flag for a human to review the license terms",
      known: false,
    };
  }
  const kind = opts.kind ? normalizeKind(opts.kind) : undefined;
  const branch: PolicyBranch = (kind && def.byKind?.[kind]) || def;
  const disposition = branch.usage?.[usage] ?? branch.disposition;
  return { source, label: def.label, ai: def.ai, disposition, basis: branch.basis, known: true };
}

/** Why an asset was flagged. Neutral verbs only — these are review prompts, not verdicts. */
export type LegalFlag = "banned-source" | "needs-authorship" | "protectable-review" | "unknown-source";

export interface AssetLegalRecord {
  id: string;
  kind: string;
  path: string;
  source: string;
  label: string;
  model?: string;
  disposition: Disposition;
  basis: string;
  ai: boolean;
  humanAuthored: boolean;
  editKind?: string;
  flags: LegalFlag[];
}

/** Classify one manifest entry into its advisory legal record. */
export function classifyAsset(entry: AssetEntry, usage: UsageContext): AssetLegalRecord {
  const rawSource = entry.license?.tool?.trim() ? entry.license.tool : entry.provenance?.provider ?? "";
  const policy = resolveSourcePolicy(rawSource, { kind: assetCategory(entry), usage });
  const humanAuthored = entry.human?.authored === true;
  const model = entry.model ?? entry.provenance?.model ?? entry.license?.plan;

  const flags: LegalFlag[] = [];
  if (policy.disposition === "deny") flags.push("banned-source");
  // Every AI-generated asset is flagged for a protectability review (we never
  // assert it ourselves); the subset lacking a recorded human-authorship pass is
  // additionally flagged as needs-authorship.
  if (policy.ai) {
    flags.push("protectable-review");
    if (!humanAuthored) flags.push("needs-authorship");
  }
  if (!policy.known) flags.push("unknown-source");

  const record: AssetLegalRecord = {
    id: entry.id,
    kind: entry.kind,
    path: entry.path,
    source: policy.source,
    label: policy.label,
    disposition: policy.disposition,
    basis: policy.basis,
    ai: policy.ai,
    humanAuthored,
    flags,
  };
  if (model) record.model = model;
  if (entry.human?.editKind) record.editKind = entry.human.editKind;
  return record;
}

/** A `by-provider` rollup: one row per distinct source. */
export interface ProviderGroup {
  source: string;
  label: string;
  ai: boolean;
  /** Worst-case disposition across the group's assets for the chosen usage. */
  disposition: Disposition;
  basis: string;
  count: number;
  /** Distinct kinds/categories, sorted. */
  kinds: string[];
  /** Asset ids in the group, sorted. */
  assetIds: string[];
}

/** Map sprite/audio/model kinds onto human-readable Steam disclosure buckets. */
export function steamCategory(kind: string): string {
  switch (normalizeKind(kind)) {
    case "sprite":
    case "sprite-anim":
    case "texture":
    case "icon":
    case "map":
      return "Art";
    case "music":
      return "Music";
    case "sfx":
      return "Sound Effects";
    case "voice":
      return "Voice";
    case "model":
    case "3d":
      return "3D Models";
    default:
      return "Other";
  }
}

/**
 * The Steam AI-content disclosure string, derived from the ledger. Steam asks
 * developers to describe their AI use in free text; we enumerate the content
 * categories that actually carry AI assets and the tools that produced them, and
 * state the content is pre-generated (baked at build time, not live).
 */
export function buildSteamDisclosure(records: readonly AssetLegalRecord[]): string {
  const ai = records.filter((r) => r.ai);
  if (ai.length === 0) {
    return "AI-generated content disclosure (Steam): this build ships no AI-generated assets from the asset pipeline.";
  }
  const categories = [...new Set(ai.map((r) => steamCategory(r.kind)))].sort();
  const tools = [...new Set(ai.map((r) => r.label))].sort();
  return [
    "AI-generated content disclosure (Steam):",
    `This game includes pre-generated AI content in the following categories: ${categories.join(", ")}.`,
    `Generation tools used: ${tools.join(", ")}.`,
    "All AI-generated assets are produced ahead of release (pre-generated, not live)",
    "and reviewed by the team before shipping.",
  ].join(" ");
}

/** The standing disclaimer — present on every report, in JSON and human output. */
export const LEGAL_DISCLAIMER =
  "This report flags assets for human review and records provider-stated license terms. " +
  "It is not legal advice and makes no copyright or protectability determination. " +
  "A qualified person must review every flagged asset before relying on it.";

export interface LegalReport {
  version: 1;
  game: string;
  usage: UsageContext;
  summary: {
    totalAssets: number;
    aiAssets: number;
    bannedSource: number;
    needsAuthorship: number;
    protectableReview: number;
    unknownSource: number;
    providers: number;
  };
  reports: {
    "protectable-flag-for-review": AssetLegalRecord[];
    "needs-authorship": AssetLegalRecord[];
    "banned-source": AssetLegalRecord[];
    "by-provider": ProviderGroup[];
  };
  steamDisclosure: string;
  disclaimer: string;
}

/** The four report names a caller can narrow to with `--report`. */
export const REPORT_NAMES = [
  "protectable-flag-for-review",
  "needs-authorship",
  "banned-source",
  "by-provider",
] as const;
export type ReportName = (typeof REPORT_NAMES)[number];

function distinctGame(entries: readonly AssetEntry[]): string {
  const games = [...new Set(entries.map((e) => e.game).filter((g): g is string => !!g))];
  if (games.length === 0) return "(unknown)";
  if (games.length === 1) return games[0] as string;
  return "(mixed)";
}

function buildProviderGroups(records: readonly AssetLegalRecord[]): ProviderGroup[] {
  const groups = new Map<string, { records: AssetLegalRecord[]; sample: AssetLegalRecord }>();
  for (const r of records) {
    const existing = groups.get(r.source);
    if (existing) existing.records.push(r);
    else groups.set(r.source, { records: [r], sample: r });
  }
  const out: ProviderGroup[] = [];
  for (const [source, { records: members, sample }] of groups) {
    out.push({
      source,
      label: sample.label,
      ai: sample.ai,
      disposition: rollupDisposition(members.map((m) => m.disposition)),
      basis: sample.basis,
      count: members.length,
      kinds: [...new Set(members.map((m) => normalizeKind(m.kind)))].sort(),
      assetIds: members.map((m) => m.id).sort(),
    });
  }
  // Deterministic order: most cautious sources first, then by source id.
  out.sort(
    (a, b) =>
      DISPOSITION_RANK[b.disposition] - DISPOSITION_RANK[a.disposition] || a.source.localeCompare(b.source),
  );
  return out;
}

/** Build the full advisory legal report from a manifest's assets. */
export function buildLegalReport(
  entries: readonly AssetEntry[],
  opts: { game?: string; usage?: UsageContext } = {},
): LegalReport {
  const usage = opts.usage ?? "in-game";
  const records = entries.map((e) => classifyAsset(e, usage));

  const banned = records.filter((r) => r.flags.includes("banned-source"));
  const needsAuthorship = records.filter((r) => r.flags.includes("needs-authorship"));
  const protectable = records.filter((r) => r.flags.includes("protectable-review"));
  const unknown = records.filter((r) => r.flags.includes("unknown-source"));
  const providerGroups = buildProviderGroups(records);

  return {
    version: 1,
    game: opts.game ?? distinctGame(entries),
    usage,
    summary: {
      totalAssets: records.length,
      aiAssets: records.filter((r) => r.ai).length,
      bannedSource: banned.length,
      needsAuthorship: needsAuthorship.length,
      protectableReview: protectable.length,
      unknownSource: unknown.length,
      providers: providerGroups.length,
    },
    reports: {
      "protectable-flag-for-review": protectable,
      "needs-authorship": needsAuthorship,
      "banned-source": banned,
      "by-provider": providerGroups,
    },
    steamDisclosure: buildSteamDisclosure(records),
    disclaimer: LEGAL_DISCLAIMER,
  };
}

/** Stable JSON for `--out` (trailing newline, mirrors the repo's other reports). */
export function serializeLegalReport(report: LegalReport): string {
  return JSON.stringify(report, null, 2) + "\n";
}
