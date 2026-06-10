/**
 * Compact cover card for the home-page games rail. Lives in components/home
 * on purpose — the games lane owns its own card treatments.
 */
import Image from "next/image";
import Link from "next/link";
import { STATUS_LABELS, type Game, type GameStatus } from "@shipshitgames/shared";

import { Badge } from "@/components/ui/badge";

const STATUS_STYLES: Record<GameStatus, string> = {
  finished: "border-toxic/60 bg-toxic/10 text-toxic",
  playable: "border-hellfire/60 bg-hellfire/10 text-hellfire",
  prototype: "border-rust/70 bg-rust/15 text-bone",
  "in-dev": "border-gunmetal bg-iron text-ash",
  concept: "border-gunmetal bg-void text-ash",
};

export function GameRailCard({ game }: { game: Game }) {
  return (
    <Link
      href={`/games/${game.slug}`}
      data-testid="game-rail-card"
      className="group w-56 shrink-0 snap-start overflow-hidden rounded-md border border-gunmetal bg-coal transition-colors duration-300 hover:border-hellfire"
    >
      <div className="relative aspect-[1200/630] overflow-hidden bg-void">
        <Image
          src={game.coverPath}
          alt={`${game.title} pixel art cover`}
          fill
          sizes="224px"
          className="object-cover transition duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-void/80 via-transparent to-transparent" />
      </div>
      <div className="flex items-center justify-between gap-2 p-3">
        <span className="truncate font-display text-sm font-bold uppercase tracking-tight text-bone">
          {game.title}
        </span>
        <Badge
          variant="outline"
          className={`shrink-0 font-display text-[10px] uppercase tracking-widest ${STATUS_STYLES[game.status]}`}
        >
          {STATUS_LABELS[game.status]}
        </Badge>
      </div>
    </Link>
  );
}
