import Image from "next/image";
import { Code2, ExternalLink, Gamepad2 } from "lucide-react";
import type { Game } from "@shipshitgames/shared";

import { Backdrop } from "@/components/site/atmosphere";
import { Breadcrumbs } from "@/components/site/breadcrumbs";
import { Eyebrow } from "@/components/site/eyebrow";
import { Button } from "@/components/ui/button";
import { accentStyle } from "@/components/games/accent";
import { PlayBuildLink } from "@/components/games/play-build-link";
import { StatusBadge } from "@/components/games/status-badge";
import type { GameLore } from "@/lib/content/types";

/**
 * Detail-page hero: cover backdrop, title, status, and link-out actions,
 * themed by the game's lore accent. Copy is the lore tagline + overview,
 * falling back to the shared summary when no lore exists (e.g. warline).
 */
export function GameHero({ game, lore }: { game: Game; lore: GameLore | null }) {
  const accent = lore?.accent ?? "blood";

  return (
    <section
      style={accentStyle(accent)}
      className="relative min-h-[620px] overflow-hidden border-b border-gunmetal/40 px-6 pb-16 pt-32"
    >
      <Backdrop />
      <Image
        src={game.coverPath}
        alt=""
        aria-hidden="true"
        fill
        priority
        sizes="100vw"
        className="pointer-events-none object-cover opacity-35 saturate-125 [image-rendering:pixelated]"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-void via-void/82 to-void/35" />
      <div className="absolute inset-0 bg-gradient-to-t from-void via-transparent to-void/60" />

      <div className="relative z-10 mx-auto max-w-7xl">
        <Breadcrumbs
          items={[
            { name: "Home", href: "/" },
            { name: "Games", href: "/games" },
            { name: game.title, href: `/games/${game.slug}` },
          ]}
        />

        <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,0.82fr)_minmax(320px,0.52fr)] lg:items-end">
          <div>
            <Eyebrow>{lore?.genre ?? game.genre}</Eyebrow>
            <h1 className="text-glow mt-5 max-w-4xl font-display text-6xl font-bold uppercase leading-[0.84] tracking-tight text-bone sm:text-8xl">
              {game.title}
            </h1>

            {lore ? (
              <>
                <p
                  className="mt-7 max-w-2xl border-l-2 pl-4 font-display text-xl font-bold uppercase tracking-tight text-bone"
                  style={{ borderColor: "var(--accent)" }}
                >
                  {lore.tagline}
                </p>
                <p className="mt-5 max-w-2xl text-lg leading-relaxed text-ash">{lore.overview}</p>
              </>
            ) : (
              <p className="mt-7 max-w-2xl text-lg leading-relaxed text-ash">{game.summary}</p>
            )}

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <StatusBadge status={game.status} />
              <span className="font-display text-xs font-bold uppercase tracking-widest text-ash">
                {lore?.factionName ?? game.faction}
              </span>
            </div>

            <div className="mt-9 flex flex-wrap gap-3">
              {game.demoUrl ? (
                <Button asChild size="xl" className="font-display uppercase tracking-widest shadow-ember">
                  <PlayBuildLink href={game.demoUrl} game={game.slug}>
                    <Gamepad2 aria-hidden="true" />
                    Play build
                  </PlayBuildLink>
                </Button>
              ) : null}
              <Button
                asChild
                size="xl"
                variant="outline"
                className="border-gunmetal font-display uppercase tracking-widest text-bone hover:border-hellfire hover:text-hellfire"
              >
                <a href={game.repoUrl} target="_blank" rel="noreferrer">
                  <Code2 aria-hidden="true" />
                  Source
                </a>
              </Button>
              <Button
                asChild
                size="xl"
                variant="outline"
                className="border-gunmetal font-display uppercase tracking-widest text-bone hover:border-hellfire hover:text-hellfire"
              >
                <a href={game.deadrotUrl} target="_blank" rel="noreferrer">
                  Deadrot page
                  <ExternalLink aria-hidden="true" />
                </a>
              </Button>
            </div>
          </div>

          <div className="rounded-md border border-gunmetal bg-coal/90 p-6 shadow-[0_28px_80px_rgba(0,0,0,0.55)]">
            <div className="relative aspect-[1200/630] overflow-hidden rounded-md border border-gunmetal bg-void">
              <Image
                src={game.coverPath}
                alt={`${game.title} pixel art cover`}
                fill
                sizes="(min-width: 1024px) 420px, 100vw"
                className="object-cover [image-rendering:pixelated]"
              />
            </div>
            <p
              className="mt-5 border-l pl-4 text-sm leading-relaxed text-ash"
              style={{ borderColor: "color-mix(in srgb, var(--accent) 60%, transparent)" }}
            >
              {game.courseAngle}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
