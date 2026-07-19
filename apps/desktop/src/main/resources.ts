import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";

export const RESOURCE_INVENTORY_KINDS = ["sources", "transcripts", "derivatives"] as const;

export type ResourceInventoryKind = (typeof RESOURCE_INVENTORY_KINDS)[number];

export interface ResourceInventory {
  schemaVersion: 1;
  kind: ResourceInventoryKind;
  count: number;
  items: Record<string, unknown>[];
  errors: string[];
  warnings: string[];
}

export interface ResourceValidation {
  ok: boolean;
  log: string;
  counts: {
    sources: number;
    transcripts: number;
    derivatives: number;
  } | null;
  errors: string[];
  warnings: string[];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function normalizeInventoryItem(
  kind: ResourceInventoryKind,
  item: Record<string, unknown>,
  index: number,
): Record<string, unknown> {
  const slug = stringValue(item.slug, `invalid-${kind}-${index}`);
  const base = {
    ...item,
    slug,
    title: stringValue(item.title, slug),
    path: stringValue(item.path, `invalid-${kind}-${index}`),
  };

  if (kind === "sources") {
    return {
      ...base,
      kind: stringValue(item.kind),
      priority: stringValue(item.priority),
      status: stringValue(item.status),
      url: stringValue(item.url),
      topics: stringArray(item.topics),
      desiredOutputs: stringArray(item.desiredOutputs),
      transcriptPolicy: stringValue(item.transcriptPolicy),
      storeRawTranscript: item.storeRawTranscript === true,
      transcriptCount: numberValue(item.transcriptCount),
    };
  }

  if (kind === "transcripts") {
    return {
      ...base,
      sourceSlug: stringValue(item.sourceSlug),
      sourceKind: stringValue(item.sourceKind),
      url: stringValue(item.url),
      capturedAt: stringValue(item.capturedAt),
      transcriptFormat: stringValue(item.transcriptFormat),
      transcriptPath: stringValue(item.transcriptPath),
      rightsStatus: stringValue(item.rightsStatus),
      tags: stringArray(item.tags),
      derivativeCount: numberValue(item.derivativeCount),
    };
  }

  const derivativeKind = ["rule", "skill", "app", "tool"].includes(stringValue(item.kind))
    ? stringValue(item.kind)
    : "rule";
  return {
    ...base,
    kind: derivativeKind,
    status: stringValue(item.status),
    summary: stringValue(item.summary),
    sourceTranscripts: stringArray(item.sourceTranscripts),
    sourceTranscriptCount: numberValue(item.sourceTranscriptCount),
    outputPath: stringValue(item.outputPath),
    tags: stringArray(item.tags),
  };
}

export function parseResourceInventory(kind: ResourceInventoryKind, stdout: string): ResourceInventory {
  let value: unknown;
  try {
    value = JSON.parse(stdout);
  } catch (error) {
    throw new Error(`ressources ${kind} returned invalid JSON: ${(error as Error).message}`);
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`ressources ${kind} returned a non-object inventory`);
  }

  const inventory = value as Record<string, unknown>;
  if (inventory.schemaVersion !== 1 || inventory.kind !== kind || !Array.isArray(inventory.items)) {
    throw new Error(`ressources ${kind} returned an unsupported inventory contract`);
  }

  const rawItems = inventory.items.filter(
    (item): item is Record<string, unknown> => !!item && typeof item === "object" && !Array.isArray(item),
  );
  if (rawItems.length !== inventory.items.length) {
    throw new Error(`ressources ${kind} returned an invalid inventory item`);
  }
  const items = rawItems.map((item, index) => normalizeInventoryItem(kind, item, index));

  return {
    schemaVersion: 1,
    kind,
    count: typeof inventory.count === "number" ? inventory.count : items.length,
    items,
    errors: stringArray(inventory.errors),
    warnings: stringArray(inventory.warnings),
  };
}

export function parseResourceValidation(code: number | null, log: string): ResourceValidation {
  const countMatch = log.match(/\[validate\]\s+sources=(\d+)\s+transcripts=(\d+)\s+derivatives=(\d+)/);
  const errors = log
    .split(/\r?\n/)
    .filter((line) => line.startsWith("[error] "))
    .map((line) => line.slice("[error] ".length));
  const warnings = log
    .split(/\r?\n/)
    .filter((line) => line.startsWith("[warn] "))
    .map((line) => line.slice("[warn] ".length));

  return {
    ok: code === 0 && !!countMatch && errors.length === 0,
    log,
    counts: countMatch
      ? {
          sources: Number(countMatch[1]),
          transcripts: Number(countMatch[2]),
          derivatives: Number(countMatch[3]),
        }
      : null,
    errors,
    warnings,
  };
}

export function resolveResourceDerivativePath(packageRoot: string, relativePath: unknown): string {
  if (typeof relativePath !== "string" || !relativePath.trim() || path.isAbsolute(relativePath)) {
    throw new Error("derivative path must be relative to the ressources package");
  }

  const root = path.resolve(packageRoot);
  const derivativeRoot = path.join(root, "derivatives");
  const resolved = path.resolve(root, relativePath);
  if (resolved !== derivativeRoot && !resolved.startsWith(`${derivativeRoot}${path.sep}`)) {
    throw new Error("derivative path must stay inside packages/ressources/derivatives");
  }
  return resolved;
}

export function resolveSkillCandidatePath(packageRoot: string, relativePath: unknown): string {
  const resolved = resolveResourceDerivativePath(packageRoot, relativePath);
  const skillsRoot = path.join(path.resolve(packageRoot), "derivatives", "skills");
  if (!resolved.startsWith(`${skillsRoot}${path.sep}`) || !resolved.endsWith(".resource.json")) {
    throw new Error("skill promotion requires a derivatives/skills/*.resource.json manifest");
  }
  return resolved;
}

export function resolveRealSkillCandidatePath(packageRoot: string, relativePath: unknown): string {
  const declaredPath = resolveSkillCandidatePath(packageRoot, relativePath);
  if (lstatSync(declaredPath).isSymbolicLink()) {
    throw new Error("skill candidate must not be a symbolic link");
  }

  const skillsRoot = realpathSync(path.join(path.resolve(packageRoot), "derivatives", "skills"));
  const candidatePath = realpathSync(declaredPath);
  if (!candidatePath.startsWith(`${skillsRoot}${path.sep}`) || !candidatePath.endsWith(".resource.json")) {
    throw new Error("skill candidate resolves outside derivatives/skills");
  }
  return candidatePath;
}

export function fingerprintResourceFile(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

type PromotionReview = {
  fingerprint: string;
  senderId: number;
};

export class SkillPromotionReviewGate {
  private readonly reviews = new Map<string, PromotionReview>();

  clear(candidatePath: string): void {
    this.reviews.delete(candidatePath);
  }

  record(candidatePath: string, fingerprint: string, senderId: number): void {
    this.reviews.set(candidatePath, { fingerprint, senderId });
  }

  consume(candidatePath: string, fingerprint: string, senderId: number): boolean {
    const review = this.reviews.get(candidatePath);
    this.reviews.delete(candidatePath);
    return review?.fingerprint === fingerprint && review.senderId === senderId;
  }
}
