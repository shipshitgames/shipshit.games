"use client";

/**
 * Client-side asset browser over the committed asset index: three filter-pill
 * rows (game / kind / faction) with live counts, a pixelated card grid, and a
 * provenance lightbox driven by the filtered list.
 */
import { useEffect, useMemo, useState } from "react";

import type { AssetIndexEntry, AssetKind } from "@/lib/content/types";
import { cn } from "@/lib/utils";
import { AssetLightbox } from "./asset-lightbox";
import {
  FACTION_LABELS,
  FACTION_ORDER,
  KIND_LABELS,
  KIND_ORDER,
  KIND_SINGULAR,
  factionGroup,
  gameLabel,
  type FactionGroup,
} from "./asset-meta";

export interface GameOption {
  slug: string;
  title: string;
}

interface Filters {
  game: string | null;
  kind: AssetKind | null;
  faction: FactionGroup | null;
}

function matches(entry: AssetIndexEntry, filters: Filters): boolean {
  if (filters.game !== null && entry.game !== filters.game) return false;
  if (filters.kind !== null && entry.kind !== filters.kind) return false;
  if (filters.faction !== null && factionGroup(entry.faction) !== filters.faction)
    return false;
  return true;
}

export function AssetBrowser({
  assets,
  games,
  gameTitles,
}: {
  assets: AssetIndexEntry[];
  /** Gallery games, in display order (All pill is added here). */
  games: GameOption[];
  gameTitles: Record<string, string>;
}) {
  const [filters, setFilters] = useState<Filters>({
    game: null,
    kind: null,
    faction: null,
  });
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  // Flipped after mount so e2e can wait for interactivity deterministically.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const filtered = useMemo(
    () => assets.filter((entry) => matches(entry, filters)),
    [assets, filters]
  );

  // Live pill counts: each pill counts the assets it would show, with the
  // other two filter dimensions still applied.
  const countFor = (patch: Partial<Filters>) => {
    const next = { ...filters, ...patch };
    return assets.reduce((total, entry) => total + (matches(entry, next) ? 1 : 0), 0);
  };

  const setFilter = (patch: Partial<Filters>) => {
    setActiveIndex(null);
    setFilters((current) => ({ ...current, ...patch }));
  };

  return (
    <div data-testid="asset-browser" data-hydrated={hydrated ? "true" : "false"}>
      <div className="space-y-4">
        <FilterRow label="Game">
          <FilterPill
            label="All"
            count={countFor({ game: null })}
            active={filters.game === null}
            onClick={() => setFilter({ game: null })}
          />
          {games.map((game) => (
            <FilterPill
              key={game.slug}
              label={game.title}
              count={countFor({ game: game.slug })}
              active={filters.game === game.slug}
              onClick={() => setFilter({ game: game.slug })}
            />
          ))}
        </FilterRow>

        <FilterRow label="Kind">
          <FilterPill
            label="All"
            count={countFor({ kind: null })}
            active={filters.kind === null}
            onClick={() => setFilter({ kind: null })}
          />
          {KIND_ORDER.map((kind) => (
            <FilterPill
              key={kind}
              label={KIND_LABELS[kind]}
              count={countFor({ kind })}
              active={filters.kind === kind}
              onClick={() => setFilter({ kind })}
            />
          ))}
        </FilterRow>

        <FilterRow label="Faction">
          <FilterPill
            label="All"
            count={countFor({ faction: null })}
            active={filters.faction === null}
            onClick={() => setFilter({ faction: null })}
          />
          {FACTION_ORDER.map((faction) => (
            <FilterPill
              key={faction}
              label={FACTION_LABELS[faction]}
              count={countFor({ faction })}
              active={filters.faction === faction}
              onClick={() => setFilter({ faction })}
            />
          ))}
        </FilterRow>
      </div>

      {filtered.length > 0 ? (
        <div
          data-testid="asset-grid"
          className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
        >
          {filtered.map((entry, entryIndex) => (
            <button
              key={entry.id}
              type="button"
              data-testid="asset-card"
              onClick={() => setActiveIndex(entryIndex)}
              className="group overflow-hidden rounded-md border border-gunmetal bg-coal text-left transition duration-300 hover:border-hellfire focus-visible:border-hellfire focus-visible:outline-none"
            >
              <span className="flex aspect-square items-center justify-center bg-void p-4">
                <img
                  src={entry.publicPath}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="max-h-full max-w-full object-contain [image-rendering:pixelated] transition duration-500 group-hover:scale-105"
                />
              </span>
              <span className="block border-t border-gunmetal p-3">
                <span className="block truncate font-display text-sm font-bold uppercase leading-tight tracking-tight text-bone">
                  {entry.name}
                </span>
                <span className="mt-1 block truncate text-[11px] font-bold uppercase tracking-widest text-ash">
                  {KIND_SINGULAR[entry.kind]}
                  {entry.game ? (
                    <span className="text-hellfire"> · {gameLabel(entry.game, gameTitles)}</span>
                  ) : null}
                </span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-10 rounded-md border border-gunmetal bg-coal p-6 font-mono text-sm text-ash">
          No assets on this front yet. Clear a filter to widen the sweep.
        </p>
      )}

      <AssetLightbox
        entries={filtered}
        index={activeIndex}
        gameTitles={gameTitles}
        onClose={() => setActiveIndex(null)}
        onNavigate={setActiveIndex}
      />
    </div>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-2">
      <span className="w-16 shrink-0 font-display text-[11px] font-bold uppercase tracking-[0.3em] text-ash">
        {label}
      </span>
      {children}
    </div>
  );
}

function FilterPill({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 font-display text-xs font-bold uppercase tracking-widest transition-colors",
        active
          ? "border-blood bg-blood text-bone"
          : "border-gunmetal bg-coal text-ash hover:border-hellfire hover:text-bone"
      )}
    >
      {label}
      <span className={cn("font-mono text-[10px]", active ? "text-bone/80" : "text-ash/70")}>
        {count}
      </span>
    </button>
  );
}
