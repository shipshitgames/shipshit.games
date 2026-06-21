// Build Plan engine core (#257).
//
// The keystone of the Studio cockpit: given a selected project + game, fold the
// three merged signals into one MVP-ordered worklist that tells the agent what to
// build next.
//
//   - WHAT THE TYPE NEEDS  — a per-game-type blueprint (a game-type skill's
//     `blueprint.json` in the shipshitgames/skills repo): required asset classes
//     + the MVP slice.
//   - WHAT IS MISSING      — catalog variant nulls (`computeVariantGaps`, #259).
//   - WHAT IS BROKEN       — `check --game` failures (`brokenAssetsFromReport`, #259).
//   - DESIGN CONTEXT       — genre + core loop + MVP requirements (`ingest-docs`, #260).
//
// This module is the pure core: `buildPlan` takes already-loaded inputs and
// assembles the plan — no filesystem, no exits. `loadBlueprints` is the only IO
// (reading blueprint skills); `commands/build-plan.ts` owns project/catalog
// resolution, presentation, and exit codes (mirroring gap-map.ts / doc-ingestion.ts).

import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import { assetTypePriority, type AssetType, type BrokenAssetGap, type VariantGap } from "./gap-map.ts";
import type { DesignMetadata } from "./doc-ingestion.ts";

export const BUILD_PLAN_VERSION = 1;

// ── blueprints (a `build-<type>-game` skill's blueprint.json) ─────────────────

/** One required class of assets for a game type, with whether it's MVP-critical. */
export interface BlueprintAssetClass {
  category: AssetType;
  items: string[];
  mvp: boolean;
}

/** The structured framework for a game type, loaded from a blueprint skill. */
export interface Blueprint {
  gameType: string;
  genreAliases: string[];
  assetClasses: BlueprintAssetClass[];
  mvpSlice: string[];
  /** Skill directory name the blueprint was loaded from (set by loadBlueprints). */
  skill?: string;
}

/** Normalize a genre/type label for slug-insensitive matching. */
function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Discover blueprints under `skillsDir` — every `<skill>/blueprint.json`. The
 * skill directory name is free-form (e.g. `fps-arena`); a blueprint is keyed by
 * its own `gameType`/`genreAliases`, so any game skill in the shipshitgames/skills
 * repo can carry one. Pure-ish IO: never throws; malformed blueprints are skipped.
 */
export async function loadBlueprints(skillsDir: string): Promise<Blueprint[]> {
  if (!existsSync(skillsDir)) return [];
  let entries: string[];
  try {
    entries = await readdir(skillsDir);
  } catch {
    return [];
  }
  const out: Blueprint[] = [];
  for (const name of entries) {
    const file = join(skillsDir, name, "blueprint.json");
    if (!existsSync(file)) continue;
    try {
      const parsed = JSON.parse(await readFile(file, "utf8")) as Partial<Blueprint>;
      if (parsed && typeof parsed.gameType === "string" && Array.isArray(parsed.assetClasses)) {
        out.push({
          gameType: parsed.gameType,
          genreAliases: Array.isArray(parsed.genreAliases) ? parsed.genreAliases : [],
          assetClasses: parsed.assetClasses as BlueprintAssetClass[],
          mvpSlice: Array.isArray(parsed.mvpSlice) ? parsed.mvpSlice : [],
          skill: name,
        });
      }
    } catch {
      // skip malformed blueprint.json
    }
  }
  return out;
}

/** Match a game's genre to a blueprint by gameType or any genreAlias (slug-insensitive). */
export function selectBlueprint(blueprints: Blueprint[], genre: string | null | undefined): Blueprint | null {
  if (!genre) return null;
  const g = norm(genre);
  if (!g) return null;
  for (const bp of blueprints) {
    for (const key of [bp.gameType, ...(bp.genreAliases ?? [])]) {
      const k = norm(key);
      if (k && (g === k || g.includes(k) || k.includes(g))) return bp;
    }
  }
  return null;
}

// ── the plan ─────────────────────────────────────────────────────────────────

export interface WorklistItem {
  order: number;
  assetType: AssetType;
  status: "missing" | "broken";
  /** Entity id (missing) or the failing detail (broken). */
  target: string;
  game: string;
  /** True when this asset type is part of the blueprint's MVP slice. */
  mvp: boolean;
  priority: number;
  detail: string;
}

export interface CoverageRow {
  category: AssetType;
  mvp: boolean;
  items: string[];
  /** Open worklist gaps of this asset type. */
  gaps: number;
}

export interface BuildPlan {
  version: number;
  project: string;
  game: string;
  genre: string | null;
  /** Matched blueprint gameType, or null when no blueprint fits the genre. */
  blueprint: string | null;
  design: { coreLoop: string | null; mvpRequirements: string[] };
  summary: {
    totalTasks: number;
    mvpTasks: number;
    missing: number;
    broken: number;
    blueprintMatched: boolean;
  };
  blueprintCoverage: CoverageRow[];
  worklist: WorklistItem[];
}

export interface BuildPlanInput {
  project: string;
  game: string;
  genre: string | null;
  design: DesignMetadata;
  missing: VariantGap[];
  broken: BrokenAssetGap[];
  blueprint: Blueprint | null;
}

const STATUS_RANK: Record<WorklistItem["status"], number> = { missing: 0, broken: 1 };

/**
 * Assemble the MVP-ordered build plan. Pure: no IO, no exits.
 * Ordering: MVP first → asset-type priority (sprite→music→ui→vfx→model→other) →
 * missing before broken → game → target. Deterministic.
 */
export function buildPlan(input: BuildPlanInput): BuildPlan {
  const { blueprint } = input;
  const mvpCategories = new Set<AssetType>();
  if (blueprint) for (const c of blueprint.assetClasses) if (c.mvp) mvpCategories.add(c.category);

  const items: WorklistItem[] = [];
  for (const m of input.missing) {
    items.push({
      order: 0,
      assetType: m.assetType,
      status: "missing",
      target: m.entity,
      game: m.game,
      mvp: mvpCategories.has(m.assetType),
      priority: assetTypePriority(m.assetType),
      detail: `${m.name} (${m.kind})`,
    });
  }
  for (const b of input.broken) {
    items.push({
      order: 0,
      assetType: b.assetType,
      status: "broken",
      target: b.detail,
      game: b.game,
      mvp: mvpCategories.has(b.assetType),
      priority: assetTypePriority(b.assetType),
      detail: `${b.check}: ${b.detail}`,
    });
  }

  items.sort(
    (a, b) =>
      Number(b.mvp) - Number(a.mvp) ||
      a.priority - b.priority ||
      STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
      a.game.localeCompare(b.game) ||
      a.target.localeCompare(b.target),
  );
  items.forEach((it, i) => {
    it.order = i + 1;
  });

  const blueprintCoverage: CoverageRow[] = (blueprint?.assetClasses ?? []).map((c) => ({
    category: c.category,
    mvp: c.mvp,
    items: c.items,
    gaps: items.filter((it) => it.assetType === c.category).length,
  }));

  return {
    version: BUILD_PLAN_VERSION,
    project: input.project,
    game: input.game,
    genre: input.genre,
    blueprint: blueprint?.gameType ?? null,
    design: { coreLoop: input.design.coreLoop, mvpRequirements: input.design.mvpRequirements },
    summary: {
      totalTasks: items.length,
      mvpTasks: items.filter((it) => it.mvp).length,
      missing: input.missing.length,
      broken: input.broken.length,
      blueprintMatched: !!blueprint,
    },
    blueprintCoverage,
    worklist: items,
  };
}

/** Stable, newline-terminated JSON for `--out` file output. */
export function serializeBuildPlan(plan: BuildPlan): string {
  return `${JSON.stringify(plan, null, 2)}\n`;
}
