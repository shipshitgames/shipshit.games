// Shared sprite frame-set primitives: the canonical directional facing order,
// the `--dirs` resolver, and the deterministic per-cell frame id. Extracted from
// `expand.ts` (issue #71) so the geometry contract checker (issue #166) and the
// Aseprite importer (issue #78) can share ONE source of truth for facings/naming
// instead of re-declaring the order (aseprite.ts already noted it "mirrors
// expand's DIRECTIONS[8]"). `expand.ts` re-exports these for backward compat.

/** Directional facings keyed by direction count. Order is load-bearing (frame map order). */
export const DIRECTIONS: Record<number, string[]> = {
  1: ["south"],
  4: ["south", "west", "north", "east"],
  8: ["south", "southwest", "west", "northwest", "north", "northeast", "east", "southeast"],
};

/** Resolve a direction-count flag to its ordered facing names. */
export function resolveDirections(dirs: number): string[] {
  const facings = DIRECTIONS[dirs];
  if (!facings) {
    throw new Error(`unsupported --dirs ${dirs}; expected one of ${Object.keys(DIRECTIONS).join(", ")}`);
  }
  return facings;
}

/** Stable, unique frame id for an (action, facing, index) cell. */
export function frameId(action: string, facing: string, index: number): string {
  return `${action}__${facing}__${index}`;
}

/**
 * The canonical direction count this facing list represents (1/4/8), or null
 * when the list is not exactly one of the canonical, correctly-ordered sets.
 * The geometry contract (#166) treats anything else as a non-canonical set.
 */
export function directionCountOf(directions: readonly string[]): number | null {
  for (const [count, facings] of Object.entries(DIRECTIONS)) {
    if (facings.length === directions.length && facings.every((f, i) => f === directions[i])) {
      return Number(count);
    }
  }
  return null;
}

/** True when `directions` is exactly a canonical, correctly-ordered facing set. */
export function isCanonicalDirectionSet(directions: readonly string[]): boolean {
  return directionCountOf(directions) !== null;
}
