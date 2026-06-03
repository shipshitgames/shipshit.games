/**
 * @shipshit/assets — shared, game-agnostic assets and the canon asset catalog
 * for the Scourge universe.
 *
 * ENTITY sprites are PER-GAME renders of shared canon (companion to issue #6):
 * the catalog records one canonical entity, then a per-game variant path (or
 * `null` when a game does not yet render it). Truly game-agnostic assets (FX,
 * UI, fonts, audio) live in the `shared` section and are used identically by
 * every game.
 */

import catalogJson from "../assets-catalog.json" with { type: "json" };

/** The six games in the shared Scourge universe. */
export type GameSlug =
  | "scourge-survivors"
  | "deadlane"
  | "pactfall"
  | "starblight"
  | "redline"
  | "rothulk";

/** Ordered list of every game slug, for iteration/validation. */
export const GAME_SLUGS: readonly GameSlug[] = [
  "scourge-survivors",
  "deadlane",
  "pactfall",
  "starblight",
  "redline",
  "rothulk",
] as const;

/** What an asset represents. */
export type AssetKind = "entity" | "boss" | "fx" | "ui" | "font" | "audio";

/**
 * Per-game variant paths for a canonical entity. Each game slug maps to the
 * relative path of that game's render, or `null` when the game has no render
 * for the entity yet.
 */
export type AssetVariants = Record<GameSlug, string | null>;

/**
 * A canonical universe entity (enemy, boss, ...). The render is per-game:
 * shared canon, per-game `variants`. Companion to issue #6.
 */
export interface EntityAsset {
  /** Stable identifier, e.g. "scourge-swarm". */
  id: string;
  kind: "entity" | "boss";
  /** Display name. */
  name: string;
  /** One-line canon description (kept in sync with lore/CANON.md). */
  canon: string;
  /** Per-game render paths, relative to this package. */
  variants: AssetVariants;
}

/**
 * A truly game-agnostic asset used identically by every game: FX, UI icons,
 * fonts, shared audio.
 */
export interface SharedAsset {
  /** Stable identifier, e.g. "fx-blood-splatter". */
  id: string;
  kind: Exclude<AssetKind, "entity" | "boss">;
  /** Display name. */
  name: string;
  /** Path to the asset, relative to this package. */
  path: string;
}

/** A resolved asset reference returned by {@link getAsset}. */
export interface Asset {
  /** The asset's stable identifier. */
  id: string;
  /** The asset's kind. */
  kind: AssetKind;
  /** Display name. */
  name: string;
  /**
   * Resolved path relative to this package, or `null` for a per-game entity
   * that has no render for the requested game.
   */
  path: string | null;
  /**
   * The game whose variant was resolved, or `null` for a shared
   * (game-agnostic) asset.
   */
  game: GameSlug | null;
}

/** The full canon asset catalog: per-game entities plus shared assets. */
export interface AssetCatalog {
  version: string;
  entities: EntityAsset[];
  shared: SharedAsset[];
}

/** The canon asset catalog, loaded from `assets-catalog.json`. */
export const catalog: AssetCatalog = catalogJson as unknown as AssetCatalog;

/**
 * Resolve an asset by id.
 *
 * - For an ENTITY, returns the requested `game`'s variant (its `path` may be
 *   `null` if that game has no render yet). If `game` is omitted, the entity's
 *   `path` is `null` and `game` is `null`.
 * - For a SHARED asset, returns the game-agnostic asset (`game` is `null`),
 *   regardless of the `game` argument.
 * - Returns `undefined` if no asset with `id` exists.
 */
export function getAsset(
  catalog: AssetCatalog,
  id: string,
  game?: GameSlug,
): Asset | undefined {
  const entity = catalog.entities.find((e) => e.id === id);
  if (entity) {
    const path = game ? (entity.variants[game] ?? null) : null;
    return {
      id: entity.id,
      kind: entity.kind,
      name: entity.name,
      path,
      game: game ?? null,
    };
  }

  const shared = catalog.shared.find((s) => s.id === id);
  if (shared) {
    return {
      id: shared.id,
      kind: shared.kind,
      name: shared.name,
      path: shared.path,
      game: null,
    };
  }

  return undefined;
}
