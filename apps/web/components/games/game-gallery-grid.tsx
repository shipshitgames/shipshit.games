"use client";

import { useState } from "react";
import { STATUS_LABELS, type GameStatus } from "@shipshitgames/shared";

import { GameCard, type GalleryGame } from "@/components/games/game-card";

const STATUS_ORDER: GameStatus[] = ["finished", "playable", "prototype", "in-dev", "concept"];

/** Featured tier: shipped/playable builds get the big cards. */
const FEATURED_STATUSES: GameStatus[] = ["finished", "playable"];
/** Standard tier: prototypes and in-dev builds in the 3-up grid. */
const GRID_STATUSES: GameStatus[] = ["prototype", "in-dev"];

type Filter = "all" | GameStatus;

function TierLabel({ children }: { children: string }) {
  return (
    <h2 className="font-display text-sm font-bold uppercase tracking-[0.35em] text-ash">
      {children}
    </h2>
  );
}

/**
 * Client-side gallery: status filter tabs with counts, then a status-tiered
 * layout — featured playable cards, a prototype grid, and a compact concept row.
 */
export function GameGalleryGrid({ games }: { games: GalleryGame[] }) {
  const [filter, setFilter] = useState<Filter>("all");

  const statusesPresent = STATUS_ORDER.filter((status) =>
    games.some((game) => game.status === status),
  );
  const filtered = filter === "all" ? games : games.filter((game) => game.status === filter);

  const featured = filtered.filter((game) => FEATURED_STATUSES.includes(game.status));
  const grid = filtered.filter((game) => GRID_STATUSES.includes(game.status));
  const compact = filtered.filter((game) => game.status === "concept");

  const tabs: { value: Filter; label: string; count: number }[] = [
    { value: "all", label: "All", count: games.length },
    ...statusesPresent.map((status) => ({
      value: status as Filter,
      label: STATUS_LABELS[status],
      count: games.filter((game) => game.status === status).length,
    })),
  ];

  return (
    <div>
      <div
        role="tablist"
        aria-label="Filter games by status"
        className="flex flex-wrap gap-2 border-b border-gunmetal/40 pb-5"
      >
        {tabs.map((tab) => {
          const active = filter === tab.value;
          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(tab.value)}
              className={`inline-flex items-center gap-2 rounded-md border px-4 py-2 font-display text-xs font-bold uppercase tracking-widest transition-colors ${
                active
                  ? "border-hellfire/70 bg-hellfire/10 text-hellfire"
                  : "border-gunmetal bg-coal text-ash hover:border-hellfire/50 hover:text-bone"
              }`}
            >
              {tab.label}
              <span className={`font-mono text-[11px] ${active ? "text-hellfire" : "text-gunmetal"}`}>
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-10 space-y-14">
        {featured.length > 0 ? (
          <section aria-label="Playable builds">
            <TierLabel>Playable now</TierLabel>
            <div className="mt-5 grid gap-6 lg:grid-cols-2">
              {featured.map((game) => (
                <GameCard key={game.slug} game={game} variant="featured" />
              ))}
            </div>
          </section>
        ) : null}

        {grid.length > 0 ? (
          <section aria-label="Prototype builds">
            <TierLabel>Prototypes</TierLabel>
            <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {grid.map((game) => (
                <GameCard key={game.slug} game={game} variant="standard" />
              ))}
            </div>
          </section>
        ) : null}

        {compact.length > 0 ? (
          <section aria-label="Concepts">
            <TierLabel>Concepts</TierLabel>
            <div className="mt-5 grid gap-4">
              {compact.map((game) => (
                <GameCard key={game.slug} game={game} variant="compact" />
              ))}
            </div>
          </section>
        ) : null}

        {filtered.length === 0 ? (
          <p className="font-mono text-sm text-ash">No games in this status yet.</p>
        ) : null}
      </div>
    </div>
  );
}
