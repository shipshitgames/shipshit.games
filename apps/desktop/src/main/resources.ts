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

  const items = inventory.items.filter(
    (item): item is Record<string, unknown> => !!item && typeof item === "object" && !Array.isArray(item),
  );
  if (items.length !== inventory.items.length) {
    throw new Error(`ressources ${kind} returned an invalid inventory item`);
  }

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
