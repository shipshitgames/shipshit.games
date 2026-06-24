/**
 * "One entity, every front" — server-rendered matrix that groups the
 * entity-variant assets by canon entity and shows how the same creature or
 * fighter is re-rendered per game's camera and art direction. No fetching:
 * everything comes from the committed asset index passed in by the page.
 */
import Image from "next/image";

import type { AssetIndexEntry } from "@/lib/content/types";
import { assetSrc, entityIdOf, formatDimensions, gameLabel } from "./asset-meta";

/** Canonical per-game column order (gallery order). */
const GAME_COLUMN_ORDER = [
  "scourge-survivors",
  "deadlane",
  "pactfall",
  "starblight",
  "redline",
  "rothulk",
  "warline",
];

function gameRank(slug: string | null): number {
  const rank = slug ? GAME_COLUMN_ORDER.indexOf(slug) : -1;
  return rank === -1 ? GAME_COLUMN_ORDER.length : rank;
}

export function VariantMatrix({
  assets,
  gameTitles,
  maxEntities = 6,
}: {
  assets: AssetIndexEntry[];
  gameTitles: Record<string, string>;
  maxEntities?: number;
}) {
  const groups = new Map<string, AssetIndexEntry[]>();
  for (const entry of assets) {
    const entityId = entityIdOf(entry);
    if (!entityId) continue;
    const bucket = groups.get(entityId);
    if (bucket) bucket.push(entry);
    else groups.set(entityId, [entry]);
  }

  const rows = Array.from(groups.entries())
    .toSorted((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .slice(0, maxEntities)
    .map(([entityId, variants]) => ({
      entityId,
      variants: variants.toSorted((a, b) => gameRank(a.game) - gameRank(b.game)),
    }));

  if (rows.length === 0) return null;

  return (
    <div data-testid="variant-matrix" className="space-y-4">
      {rows.map(({ entityId, variants }) => {
        const lead = variants[0];
        if (!lead) return null;
        return (
          <article
            key={entityId}
            className="grid gap-6 rounded-md border border-gunmetal bg-coal p-6 lg:grid-cols-[minmax(0,0.38fr)_minmax(0,1fr)] lg:items-center"
          >
            <div>
              <h3 className="font-display text-2xl font-bold uppercase leading-none tracking-tight text-bone">
                {lead.name}
              </h3>
              <p className="mt-1 font-mono text-[11px] uppercase tracking-widest text-ash">
                {entityId} · {variants.length} front{variants.length > 1 ? "s" : ""}
              </p>
              {lead.canon ? (
                <p className="mt-3 text-sm leading-relaxed text-ash">{lead.canon}</p>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-3">
              {variants.map((variant) => (
                <figure key={variant.id} className="w-28 sm:w-32">
                  <div className="relative flex aspect-square items-center justify-center rounded-md border border-gunmetal bg-void">
                    <Image
                      src={assetSrc(variant)}
                      alt={`${variant.name} as rendered for ${gameLabel(variant.game, gameTitles) ?? "the shared canon"}`}
                      fill
                      sizes="8rem"
                      unoptimized
                      className="object-contain p-2 [image-rendering:pixelated]"
                    />
                  </div>
                  <figcaption className="mt-2 text-center">
                    <span className="block truncate font-display text-[11px] font-bold uppercase tracking-widest text-hellfire">
                      {gameLabel(variant.game, gameTitles) ?? "Canon"}
                    </span>
                    {variant.dimensions ? (
                      <span className="block font-mono text-[10px] text-ash">
                        {formatDimensions(variant.dimensions)}
                      </span>
                    ) : null}
                  </figcaption>
                </figure>
              ))}
            </div>
          </article>
        );
      })}
    </div>
  );
}
