/**
 * Shared labels and normalizers for the asset showcase. The asset index is the
 * committed snapshot in `content/asset-index.json` (see lib/content) — these
 * helpers only translate its raw values into player-facing copy.
 */
import type { AssetIndexEntry, AssetKind } from "@/lib/content/types";

/** Friendly filter-pill labels per asset kind. */
export const KIND_LABELS: Record<AssetKind, string> = {
  "entity-variant": "Cross-game renders",
  "runtime-sprite": "Runtime sprites",
  portrait: "Portraits",
  cover: "Covers",
};

/** Singular kind label for cards and the provenance panel. */
export const KIND_SINGULAR: Record<AssetKind, string> = {
  "entity-variant": "Cross-game render",
  "runtime-sprite": "Runtime sprite",
  portrait: "Portrait",
  cover: "Cover",
};

export const KIND_ORDER: AssetKind[] = [
  "entity-variant",
  "runtime-sprite",
  "portrait",
  "cover",
];

/** Normalized faction buckets used by the faction filter. */
export type FactionGroup = "the-pyre" | "the-wardens" | "scourge" | "other";

export const FACTION_LABELS: Record<FactionGroup, string> = {
  "the-pyre": "The Pyre",
  "the-wardens": "The Wardens",
  scourge: "Scourge",
  other: "Other",
};

export const FACTION_ORDER: FactionGroup[] = [
  "the-pyre",
  "the-wardens",
  "scourge",
  "other",
];

/**
 * Bucket a raw `entry.faction` value. The snapshot carries both lore slugs
 * ("the-pyre"/"the-wardens") and short runtime tags ("pyre"/"wardens"), so
 * both spellings collapse into the same pill; null and anything unknown is
 * "Other".
 */
export function factionGroup(faction: string | null): FactionGroup {
  if (faction === "the-pyre" || faction === "pyre") return "the-pyre";
  if (faction === "the-wardens" || faction === "wardens") return "the-wardens";
  if (faction === "scourge") return "scourge";
  return "other";
}

/** Middle segment of an "entity:<entityId>:<game>" id; null for other kinds. */
export function entityIdOf(entry: AssetIndexEntry): string | null {
  if (entry.kind !== "entity-variant") return null;
  return entry.id.split(":")[1] ?? null;
}

/** "128 × 128" or null when the snapshot has no parsed dimensions. */
export function formatDimensions(dimensions: [number, number] | null): string | null {
  if (!dimensions) return null;
  return `${dimensions[0]} × ${dimensions[1]}`;
}

/** Title for a game slug, falling back to a humanized slug. */
export function gameLabel(slug: string | null, titles: Record<string, string>): string | null {
  if (!slug) return null;
  return titles[slug] ?? slug.replace(/-/g, " ");
}
