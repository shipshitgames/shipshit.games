import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import {
  accentVars,
  gameCharacters,
  gameCreatures,
  spriteUrl,
  type Game,
  type GameStatus,
} from "@/lib/content";
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

function keySprite(game: Game): string | null {
  const withArt = [...gameCreatures(game), ...gameCharacters(game)].find(
    (e) => e.spriteBase
  );
  return withArt ? spriteUrl(withArt.spriteBase) : null;
}

export function GameCard({ game }: { game: Game }) {
  const sprite = keySprite(game);
  return (
    <Link
      href={`/games/${game.slug}`}
      style={accentVars(game.accent)}
      className="group relative flex h-72 flex-col justify-end overflow-hidden rounded-md border border-gunmetal bg-coal transition-all duration-300 hover:border-[var(--page-accent)] hover:shadow-[0_0_44px_-14px_var(--page-accent)]"
    >
      <div aria-hidden className="absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(85%_60%_at_50%_-5%,color-mix(in_srgb,var(--page-accent)_22%,transparent),transparent_70%)] opacity-70 transition-opacity duration-300 group-hover:opacity-100" />
        {sprite ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={sprite}
            alt=""
            className="absolute -right-4 top-1/2 h-48 -translate-y-1/2 object-contain opacity-35 saturate-150 transition-all duration-500 group-hover:scale-110 group-hover:opacity-60"
          />
        ) : (
          <span className="absolute -right-3 top-0 select-none font-display text-[8rem] font-bold leading-none text-white/[0.035] transition-colors duration-300 group-hover:text-white/[0.055]">
            {game.title.charAt(0)}
          </span>
        )}
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
