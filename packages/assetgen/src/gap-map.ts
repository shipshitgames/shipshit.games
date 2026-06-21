// Asset gap map core (#259).
//
// `assetgen gap-map` answers one question for the Build Plan engine (#257):
// "what is missing or broken for the project I'm about to build?" It folds two
// independent signals into one structured, priority-ordered report:
//
//   1. CATALOG GAPS — entities in `assets-catalog.json` whose per-game `variants`
//      matrix still has a `null` for a game the entity is meant to ship in
//      (`entity.games`). These are sprites that have never been rendered.
//   2. BROKEN ASSETS — the failures `assetgen check --game <slug>` surfaces:
//      unresolved manifest references, orphan webps, unlicensed entries, banned
//      sources, and stale codegen.
//
// Both are bucketed by asset type and a Build-Plan fill priority
// (sprites → music → UI → VFX) and grouped by game, so the planner can decide
// what to generate next without re-deriving any of it.
//
// This module is the pure core: `buildGapReport` takes already-read catalog data
// and already-run per-game check reports and assembles the report. It never
// touches the filesystem or exits — `commands/gap-map.ts` owns resolution,
// presentation, and exit codes (mirroring asset-index.ts / game-check.ts).

import {
  GAME_SLUGS,
  type AssetCatalog,
  type EntityAsset,
  type Faction,
  type GameSlug,
} from "./assets-package.ts";
import type { GameCheckName, GameCheckReport } from "./game-check.ts";

export const GAP_MAP_VERSION = 1;

/** Asset buckets a gap can fall into. `other` is the catch-all for unclassifiable refs. */
export type AssetType = "sprite" | "music" | "ui" | "vfx" | "model" | "other";

/**
 * Build-Plan fill priority (card #259: sprites → music → UI → VFX). Lower number
 * = filled first. `model` and `other` trail the four named buckets so they never
 * outrank a sprite the planner actually cares about.
 */
export const ASSET_TYPE_PRIORITY: Record<AssetType, number> = {
  sprite: 1,
  music: 2,
  ui: 3,
  vfx: 4,
  model: 5,
  other: 6,
};

export function assetTypePriority(type: AssetType): number {
  return ASSET_TYPE_PRIORITY[type] ?? ASSET_TYPE_PRIORITY.other;
}

/** Map a manifest/catalog `kind` token (sprite, music, ui, fx, …) to a gap bucket. */
export function classifyAssetType(kind: string | null | undefined): AssetType {
  const k = (kind ?? "").toLowerCase();
  if (!k) return "other";
  if (/sprite|portrait|tile|sheet|anim|texture|entity|boss/.test(k)) return "sprite";
  if (/music|sfx|sound|audio|voice|song|track/.test(k)) return "music";
  if (/(^|[^a-z])ui([^a-z]|$)|hud|icon|menu|font/.test(k)) return "ui";
  if (/vfx|particle|effect|\bfx\b/.test(k)) return "vfx";
  if (/model|mesh|\b3d\b|glb|gltf/.test(k)) return "model";
  return "other";
}

/** Best-effort asset-type guess from a file path (used for path-only check messages). */
export function classifyAssetTypeFromPath(p: string): AssetType {
  const s = p.toLowerCase();
  if (/\.(glb|gltf)\b/.test(s)) return "model";
  if (/(^|\/)(music|audio|sfx|sound)(\/|$)|\.(mp3|wav|ogg|m4a)\b/.test(s)) return "music";
  // `fonts?` is dir-anchored and font files are matched by extension; a bare
  // `font` substring would mis-bucket sprite paths like `sprites/fontaine.webp`.
  if (/(^|\/)(ui|hud|fonts?)(\/|$)|\.(woff2?|ttf|otf)\b/.test(s)) return "ui";
  if (/(^|\/)(fx|vfx|particles?|effects?)(\/|$)/.test(s)) return "vfx";
  if (/\.(webp|png|jpe?g|gif)\b/.test(s)) return "sprite";
  return "other";
}

// ── catalog (missing variant) gaps ───────────────────────────────────────────

/** One entity sprite that should exist for a game but is still `null` in the catalog. */
export interface VariantGap {
  /** Entity catalog id, e.g. "scourge-swarm". */
  entity: string;
  name: string;
  kind: EntityAsset["kind"];
  faction: Faction;
  game: GameSlug;
  /** Always "sprite": entity variants are per-game sprite renders. */
  assetType: "sprite";
  priority: number;
}

/**
 * Games an entity is *meant* to ship in (`entity.games`) whose variant render is
 * still `null`. A variant present for a game NOT in `entity.games` is an extra,
 * not a gap, so it is intentionally ignored.
 */
export function pendingGames(entity: EntityAsset): GameSlug[] {
  const variants = entity.variants ?? ({} as EntityAsset["variants"]);
  return (entity.games ?? []).filter((game) => variants[game] == null);
}

/**
 * Every (entity, game) sprite that the catalog says should exist but does not.
 * `games`, when given, restricts the report to those game slugs.
 */
export function computeVariantGaps(catalog: AssetCatalog, games?: readonly GameSlug[]): VariantGap[] {
  const allow = games ? new Set<GameSlug>(games) : null;
  const gaps: VariantGap[] = [];
  for (const entity of catalog.entities ?? []) {
    for (const game of pendingGames(entity)) {
      if (allow && !allow.has(game)) continue;
      gaps.push({
        entity: entity.id,
        name: entity.name,
        kind: entity.kind,
        faction: entity.faction,
        game,
        assetType: "sprite",
        priority: assetTypePriority("sprite"),
      });
    }
  }
  gaps.sort((a, b) => a.game.localeCompare(b.game) || a.entity.localeCompare(b.entity));
  return gaps;
}

// ── broken-asset gaps (from `check --game`) ───────────────────────────────────

/** One failing item pulled out of a per-game `check --game` report. */
export interface BrokenAssetGap {
  game: string;
  check: GameCheckName;
  assetType: AssetType;
  priority: number;
  /** The specific failure line (entry label + reason, or a path). */
  detail: string;
}

/** `id:kind` entry-label prefix the game-check messages emit (game-check.ts `entryLabel`). */
const ENTRY_LABEL = /^([a-z0-9][a-z0-9-]*):([a-z0-9?][a-z0-9-]*)/i;

/** Derive the asset type of a single check-failure message. */
export function brokenMessageAssetType(message: string): AssetType {
  const labelled = ENTRY_LABEL.exec(message);
  if (labelled) {
    const kindToken = labelled[2] ?? "";
    if (kindToken && kindToken !== "?") return classifyAssetType(kindToken);
  }
  return classifyAssetTypeFromPath(message);
}

/**
 * Flatten a per-game check report into broken-asset gaps: one entry per failure
 * message of every failing check. `skipped`/`ok` checks contribute nothing.
 */
export function brokenAssetsFromReport(report: GameCheckReport): BrokenAssetGap[] {
  const out: BrokenAssetGap[] = [];
  for (const result of report.results) {
    if (result.status !== "fail") continue;
    const messages = result.messages.length > 0 ? result.messages : [result.summary];
    for (const detail of messages) {
      const assetType = brokenMessageAssetType(detail);
      out.push({
        game: report.game,
        check: result.check,
        assetType,
        priority: assetTypePriority(assetType),
        detail,
      });
    }
  }
  return out;
}

// ── report assembly ───────────────────────────────────────────────────────────

/** Per-game slice of the report: its catalog gaps and its check failures. */
export interface GameGapSection {
  game: GameSlug;
  /** Whether `check --game` actually ran (a manifest was resolvable). */
  checked: boolean;
  /** Resolved manifest path when `checked`, else null. */
  manifest: string | null;
  /** Why the per-game check did not run (only set when `checked` is false). */
  reason: string | null;
  /**
   * Which `check --game` sub-checks actually ran for this game. `codegen-current`
   * only appears when `--codegen` was passed, so a planner can tell a clean game
   * apart from one whose codegen staleness was simply never evaluated.
   */
  checks: GameCheckName[];
  missingVariants: VariantGap[];
  brokenAssets: BrokenAssetGap[];
}

/** Missing variants rolled up per entity — the "grouped by entity" view (#259). */
export interface EntityGapSummary {
  entity: string;
  name: string;
  kind: EntityAsset["kind"];
  faction: Faction;
  /** Games the entity is meant to ship in but has not been rendered for. */
  missingGames: GameSlug[];
}

/** One (assetType, game) bucket with its gap counts — the priority-ordered view. */
export interface TypePriorityGroup {
  assetType: AssetType;
  priority: number;
  game: string;
  missingVariants: number;
  brokenAssets: number;
  total: number;
}

export interface GapReportSummary {
  missingVariants: number;
  brokenAssets: number;
  totalGaps: number;
  gamesTotal: number;
  gamesChecked: number;
}

/** The structured gap report emitted for the Build Plan engine. */
export interface GapReport {
  version: number;
  /** Project/IP id this maps, e.g. "deadrot", or "default" when unselected. */
  project: string;
  assetsDir: string;
  /** Catalog `version` string, or null when the catalog omits it. */
  catalogVersion: string | null;
  games: GameSlug[];
  summary: GapReportSummary;
  byEntity: EntityGapSummary[];
  byGame: GameGapSection[];
  byTypeAndPriority: TypePriorityGroup[];
}

/** Per-game check result the command feeds in (one per requested game). */
export interface GameCheckSlot {
  report: GameCheckReport | null;
  manifest: string | null;
  reason: string | null;
}

export interface GapReportInput {
  project: string;
  assetsDir: string;
  catalog: AssetCatalog;
  games: readonly GameSlug[];
  /** Per-game check outcome; a game absent from the map is treated as not checked. */
  gameChecks: Map<GameSlug, GameCheckSlot>;
}

function rollupByEntity(catalog: AssetCatalog, gaps: VariantGap[]): EntityGapSummary[] {
  const byEntity = new Map<string, EntityGapSummary>();
  const order: string[] = [];
  for (const entity of catalog.entities ?? []) {
    byEntity.set(entity.id, {
      entity: entity.id,
      name: entity.name,
      kind: entity.kind,
      faction: entity.faction,
      missingGames: [],
    });
  }
  for (const gap of gaps) {
    let summary = byEntity.get(gap.entity);
    if (!summary) {
      summary = { entity: gap.entity, name: gap.name, kind: gap.kind, faction: gap.faction, missingGames: [] };
      byEntity.set(gap.entity, summary);
    }
    if (summary.missingGames.length === 0) order.push(gap.entity);
    if (!summary.missingGames.includes(gap.game)) summary.missingGames.push(gap.game);
  }
  return order
    .map((id) => byEntity.get(id)!)
    .map((summary) => ({ ...summary, missingGames: [...summary.missingGames].sort() }))
    .sort((a, b) => a.entity.localeCompare(b.entity));
}

function rollupByTypeAndPriority(
  variantGaps: VariantGap[],
  brokenGaps: BrokenAssetGap[],
): TypePriorityGroup[] {
  const groups = new Map<string, TypePriorityGroup>();
  const bump = (assetType: AssetType, game: string, kind: "missing" | "broken") => {
    const key = `${assetType}::${game}`;
    let group = groups.get(key);
    if (!group) {
      group = { assetType, priority: assetTypePriority(assetType), game, missingVariants: 0, brokenAssets: 0, total: 0 };
      groups.set(key, group);
    }
    if (kind === "missing") group.missingVariants++;
    else group.brokenAssets++;
    group.total++;
  };
  for (const gap of variantGaps) bump(gap.assetType, gap.game, "missing");
  for (const gap of brokenGaps) bump(gap.assetType, gap.game, "broken");
  return [...groups.values()].sort(
    (a, b) => a.priority - b.priority || a.game.localeCompare(b.game) || a.assetType.localeCompare(b.assetType),
  );
}

/**
 * Assemble the full gap report from already-read catalog data and already-run
 * per-game check reports. Pure: no filesystem, no process exit.
 */
export function buildGapReport(input: GapReportInput): GapReport {
  const { project, assetsDir, catalog, games, gameChecks } = input;
  const allVariantGaps = computeVariantGaps(catalog, games);

  const byGame: GameGapSection[] = [];
  const allBrokenGaps: BrokenAssetGap[] = [];
  let gamesChecked = 0;

  for (const game of games) {
    const slot = gameChecks.get(game);
    const missingVariants = allVariantGaps.filter((gap) => gap.game === game);
    const brokenAssets = slot?.report ? brokenAssetsFromReport(slot.report) : [];
    if (slot?.report) gamesChecked++;
    allBrokenGaps.push(...brokenAssets);
    byGame.push({
      game,
      checked: Boolean(slot?.report),
      manifest: slot?.manifest ?? null,
      reason: slot?.report ? null : slot?.reason ?? "no per-game check ran",
      checks: slot?.report ? slot.report.results.map((r) => r.check) : [],
      missingVariants,
      brokenAssets,
    });
  }

  const summary: GapReportSummary = {
    missingVariants: allVariantGaps.length,
    brokenAssets: allBrokenGaps.length,
    totalGaps: allVariantGaps.length + allBrokenGaps.length,
    gamesTotal: games.length,
    gamesChecked,
  };

  return {
    version: GAP_MAP_VERSION,
    project,
    assetsDir,
    catalogVersion: typeof catalog.version === "string" ? catalog.version : null,
    games: [...games],
    summary,
    byEntity: rollupByEntity(catalog, allVariantGaps),
    byGame,
    byTypeAndPriority: rollupByTypeAndPriority(allVariantGaps, allBrokenGaps),
  };
}

/** Stable, newline-terminated JSON for deterministic `--out` files. */
export function serializeGapReport(report: GapReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export { GAME_SLUGS };
