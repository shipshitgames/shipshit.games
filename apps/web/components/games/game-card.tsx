import type { CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Code2, Gamepad2 } from "lucide-react";
import type { GameStatus } from "@shipshitgames/shared";

import { Button } from "@/components/ui/button";
import { PlayBuildLink } from "@/components/games/play-build-link";
import { StatusBadge } from "@/components/games/status-badge";
import type { AccentToken } from "@/lib/content/types";

/** Serializable join of a gallery Game + its lore, built server-side. */
export interface GalleryGame {
  slug: string;
  title: string;
  status: GameStatus;
  genre: string;
  faction: string;
  /** Lore tagline, falling back to the shared blurb. */
  tagline: string;
  coverPath: string;
  accent: AccentToken;
  demoUrl?: string;
  repoUrl: string;
  /** Up to 3 character sprite thumbnails from the lore roster. */
  sprites: { name: string; src: string }[];
}

export type GameCardVariant = "featured" | "standard" | "compact";

function accentStyle(accent: AccentToken): CSSProperties {
  return { "--accent": `var(--color-${accent})` } as CSSProperties;
}

function SpriteStrip({ sprites, size }: { sprites: GalleryGame["sprites"]; size: number }) {
  if (sprites.length === 0) return null;
  return (
    <div className="flex items-end gap-2" aria-label="Playable operators">
      {sprites.map((sprite) => (
        <div
          key={sprite.src}
          className="overflow-hidden rounded-md border border-gunmetal/70 bg-void/80"
          style={{ width: size, height: size }}
          title={sprite.name}
        >
          <Image
            src={sprite.src}
            alt={`${sprite.name} sprite`}
            width={size}
            height={size}
            className="h-full w-full object-contain [image-rendering:pixelated]"
          />
        </div>
      ))}
    </div>
  );
}

function CardActions({ game }: { game: GalleryGame }) {
  return (
    <div className="mt-5 flex flex-wrap gap-2">
      <Button asChild size="sm" className="font-display uppercase tracking-widest">
        <Link href={`/games/${game.slug}`}>
          Brief
          <ArrowRight aria-hidden="true" />
        </Link>
      </Button>
      {game.demoUrl ? (
        <Button asChild size="sm" variant="outline" className="font-display uppercase tracking-widest">
          <PlayBuildLink href={game.demoUrl} game={game.slug}>
            <Gamepad2 aria-hidden="true" />
            Play
          </PlayBuildLink>
        </Button>
      ) : null}
      <Button asChild size="sm" variant="outline" className="font-display uppercase tracking-widest">
        <a href={game.repoUrl} target="_blank" rel="noreferrer">
          <Code2 aria-hidden="true" />
          Source
        </a>
      </Button>
    </div>
  );
}

/**
 * Gallery card with accent-colored hover border + glow driven by the game's
 * lore accent (`--accent`). Three variants for the status-tiered layout.
 */
export function GameCard({
  game,
  variant = "standard",
}: {
  game: GalleryGame;
  variant?: GameCardVariant;
}) {
  if (variant === "compact") {
    return (
      <article
        style={accentStyle(game.accent)}
        className="group flex items-center gap-5 overflow-hidden rounded-md border border-gunmetal bg-coal p-4 transition-all duration-300 hover:border-[var(--accent)] hover:shadow-[0_0_36px_-14px_var(--accent)]"
      >
        <Link
          href={`/games/${game.slug}`}
          className="relative block aspect-[1200/630] w-40 shrink-0 overflow-hidden rounded-md border border-gunmetal/70 bg-void"
        >
          <Image
            src={game.coverPath}
            alt={`${game.title} pixel art cover`}
            fill
            sizes="160px"
            className="object-cover [image-rendering:pixelated] transition duration-500 group-hover:scale-105"
          />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="font-display text-xl font-bold uppercase leading-none tracking-tight text-bone">
              <Link href={`/games/${game.slug}`} className="transition-colors hover:text-[var(--accent)]">
                {game.title}
              </Link>
            </h3>
            <StatusBadge status={game.status} />
          </div>
          <p className="mt-2 truncate text-sm leading-relaxed text-ash">{game.tagline}</p>
          <p className="mt-1 text-xs font-bold uppercase tracking-widest text-ash">
            {game.genre} <span className="text-gunmetal">/</span> {game.faction}
          </p>
        </div>
        <ArrowRight
          aria-hidden="true"
          className="hidden size-5 shrink-0 text-ash transition-colors group-hover:text-[var(--accent)] sm:block"
        />
      </article>
    );
  }

  const featured = variant === "featured";

  return (
    <article
      style={accentStyle(game.accent)}
      className="group overflow-hidden rounded-md border border-gunmetal bg-coal transition-all duration-300 hover:border-[var(--accent)] hover:shadow-[0_0_44px_-14px_var(--accent)]"
    >
      <Link href={`/games/${game.slug}`} className="block">
        <div className={`relative overflow-hidden bg-void ${featured ? "aspect-[16/8]" : "aspect-[1200/630]"}`}>
          <Image
            src={game.coverPath}
            alt={`${game.title} pixel art cover`}
            fill
            sizes={featured ? "(min-width: 1024px) 50vw, 100vw" : "(min-width: 1280px) 33vw, (min-width: 768px) 50vw, 100vw"}
            className="object-cover [image-rendering:pixelated] transition duration-500 group-hover:scale-105"
            priority={featured}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-void via-void/35 to-transparent" />
          <div className="absolute left-4 top-4">
            <StatusBadge status={game.status} />
          </div>
        </div>
      </Link>

      <div className={featured ? "p-6" : "p-5"}>
        <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-widest text-ash">
          <span>{game.genre}</span>
          <span className="text-gunmetal">/</span>
          <span>{game.faction}</span>
        </div>

        <div className="mt-3 flex items-end justify-between gap-4">
          <h3
            className={`font-display font-bold uppercase leading-none tracking-tight text-bone ${
              featured ? "text-4xl" : "text-2xl"
            }`}
          >
            <Link href={`/games/${game.slug}`} className="transition-colors hover:text-[var(--accent)]">
              {game.title}
            </Link>
          </h3>
          <SpriteStrip sprites={game.sprites} size={featured ? 56 : 44} />
        </div>

        <p
          className={`mt-3 border-l pl-4 text-sm leading-relaxed text-ash ${featured ? "min-h-10" : "min-h-16"}`}
          style={{ borderColor: "color-mix(in srgb, var(--accent) 60%, transparent)" }}
        >
          {game.tagline}
        </p>

        <CardActions game={game} />
      </div>
    </article>
  );
}
