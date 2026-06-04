import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { accentVars, type Game, type GameStatus } from "@/lib/content";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<GameStatus, string> = {
  PLAYABLE: "border-toxic/50 bg-toxic/10 text-toxic",
  "IN DEV": "border-hellfire/50 bg-hellfire/10 text-hellfire",
  CONCEPT: "border-gunmetal bg-iron text-ash",
};

export function StatusBadge({
  status,
  className,
}: {
  status: GameStatus;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "font-display tracking-widest",
        STATUS_STYLES[status],
        className
      )}
    >
      {status}
    </Badge>
  );
}

export function GameCard({ game }: { game: Game }) {
  return (
    <Link
      href={`/games/${game.slug}`}
      style={accentVars(game.accent)}
      className="group relative flex h-72 flex-col justify-end overflow-hidden rounded-md border border-gunmetal bg-coal transition-all duration-300 hover:border-[var(--page-accent)] hover:shadow-[0_0_44px_-14px_var(--page-accent)]"
    >
      <div aria-hidden className="absolute inset-0">
        {/* Pixel game cover (locked house style #62) */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/images/games/${game.slug}.webp`}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-85 transition-transform duration-500 group-hover:scale-105"
          style={{ imageRendering: "pixelated" }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-coal via-coal/65 to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(85%_60%_at_50%_-5%,color-mix(in_srgb,var(--page-accent)_18%,transparent),transparent_70%)] opacity-60 transition-opacity duration-300 group-hover:opacity-100" />
        <div className="vignette absolute inset-0" />
      </div>

      <div className="relative z-10 p-5">
        <div className="mb-2 flex items-center gap-2">
          <StatusBadge status={game.status} />
          <span className="text-[0.65rem] uppercase tracking-widest text-ash">
            {game.genre}
          </span>
        </div>
        <h3 className="font-display text-2xl font-bold uppercase leading-none tracking-tight text-bone">
          {game.title}
        </h3>
        <p className="mt-2 line-clamp-2 text-sm leading-snug text-ash">
          {game.tagline}
        </p>
      </div>

      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-0.5 bg-[var(--page-accent)] opacity-60 transition-opacity duration-300 group-hover:opacity-100"
      />
    </Link>
  );
}
