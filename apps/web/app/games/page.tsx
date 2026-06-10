import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, ExternalLink } from "lucide-react";
import { GAMES } from "@shipshitgames/shared";

import { Backdrop } from "@/components/site/atmosphere";
import { Eyebrow } from "@/components/site/eyebrow";
import { Button } from "@/components/ui/button";
import { GameGalleryGrid } from "@/components/games/game-gallery-grid";
import type { GalleryGame } from "@/components/games/game-card";
import { getCharacters, getGameLore } from "@/lib/content";

export const metadata: Metadata = {
  title: "Game Gallery",
  description:
    "Playable Deadrot game builds and finished-product readiness tracks from Ship Shit Games.",
  openGraph: {
    title: "Ship Shit Games Game Gallery",
    description:
      "Playable Deadrot game builds, prototypes, source links, and finished-product readiness tracks.",
    url: "https://shipshit.games/games",
    images: [
      {
        url: "/images/og/shipshit-games.jpg",
        width: 1200,
        height: 630,
        alt: "Ship Shit Games game gallery",
        type: "image/jpeg",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Ship Shit Games Game Gallery",
    description:
      "Playable Deadrot game builds, prototypes, source links, and finished-product readiness tracks.",
    images: ["/images/og/shipshit-games.jpg"],
  },
};

/** Join the shared gallery catalogue with committed lore (tagline, accent, roster sprites). */
function buildGalleryGames(): GalleryGame[] {
  return GAMES.map((game) => {
    const lore = getGameLore(game.slug);
    const sprites = lore
      ? getCharacters(lore.characterSlugs)
          .filter((character) => character.spritePath !== null)
          .slice(0, 3)
          .map((character) => ({ name: character.name, src: character.spritePath as string }))
      : [];

    return {
      slug: game.slug,
      title: game.title,
      status: game.status,
      genre: lore?.genre ?? game.genre,
      faction: lore?.factionName ?? game.faction,
      tagline: lore?.tagline ?? game.blurb,
      coverPath: game.coverPath,
      accent: lore?.accent ?? "blood",
      demoUrl: game.demoUrl,
      deadrotUrl: game.deadrotUrl,
      repoUrl: game.repoUrl,
      sprites,
    };
  });
}

export default function GamesPage() {
  const games = buildGalleryGames();

  return (
    <main>
      <section className="relative overflow-hidden border-b border-gunmetal/40 px-6 pb-16 pt-32">
        <Backdrop />
        <div className="relative z-10 mx-auto max-w-7xl">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,0.82fr)_minmax(320px,0.58fr)] lg:items-end">
            <div>
              <Eyebrow>Playable proof</Eyebrow>
              <h1 className="text-glow mt-5 max-w-4xl font-display text-5xl font-bold uppercase leading-[0.9] tracking-tight text-bone sm:text-7xl">
                The games are the receipts.
              </h1>
              <p className="mt-7 max-w-2xl text-lg leading-relaxed text-ash">
                DEADROT builds live in the sibling runtime repo. This gallery tracks
                what can be played now, what is still a prototype, and which
                finished-product gate each title must clear before we call it done.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <Button asChild size="xl" className="font-display uppercase tracking-widest shadow-ember">
                  <a href="https://deadrot.com" target="_blank" rel="noreferrer">
                    Play Deadrot
                    <ExternalLink aria-hidden="true" />
                  </a>
                </Button>
                <Button
                  asChild
                  size="xl"
                  variant="outline"
                  className="border-gunmetal font-display uppercase tracking-widest text-bone hover:border-hellfire hover:text-hellfire"
                >
                  <Link href="/factions">Meet the factions</Link>
                </Button>
              </div>
            </div>

            <div className="rounded-md border border-gunmetal bg-coal/90 p-6">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="size-5 text-hellfire" aria-hidden="true" />
                <h2 className="font-display text-xl font-bold uppercase tracking-tight text-bone">
                  Gallery rule
                </h2>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-ash">
                A demo can be playable before it is finished. Finished means a
                complete loop, production assets, audio, responsive controls,
                and desktop/mobile E2E proof in Deadrot.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 py-16">
        <div className="mx-auto max-w-7xl">
          <GameGalleryGrid games={games} />
        </div>
      </section>
    </main>
  );
}
