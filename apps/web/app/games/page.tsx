import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Code2, ExternalLink, Gamepad2 } from "lucide-react";
import { GAMES, STATUS_LABELS, type GameStatus } from "@shipshitgames/shared";

import { Backdrop } from "@/components/site/atmosphere";
import { Eyebrow } from "@/components/site/eyebrow";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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

const STATUS_STYLES: Record<GameStatus, string> = {
  finished: "border-toxic/60 bg-toxic/10 text-toxic",
  playable: "border-hellfire/60 bg-hellfire/10 text-hellfire",
  prototype: "border-rust/70 bg-rust/15 text-bone",
  "in-dev": "border-gunmetal bg-iron text-ash",
  concept: "border-gunmetal bg-void text-ash",
};

const STATUS_ORDER: Record<GameStatus, number> = {
  finished: 0,
  playable: 1,
  prototype: 2,
  "in-dev": 3,
  concept: 4,
};

const games = GAMES.toSorted((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);

function StatusBadge({ status }: { status: GameStatus }) {
  return (
    <Badge variant="outline" className={`font-display uppercase tracking-widest ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}

export default function GamesPage() {
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
                  <Link href="/pricing">Get Studio Pass</Link>
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
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {games.map((game) => (
              <article
                key={game.slug}
                className="group overflow-hidden rounded-md border border-gunmetal bg-coal transition duration-300 hover:border-hellfire"
              >
                <Link href={`/games/${game.slug}`} className="block">
                  <div className="relative aspect-[1200/630] overflow-hidden bg-void">
                    <Image
                      src={game.coverPath}
                      alt={`${game.title} pixel art cover`}
                      fill
                      sizes="(min-width: 1280px) 33vw, (min-width: 768px) 50vw, 100vw"
                      className="object-cover transition duration-500 group-hover:scale-105"
                      priority={game.slug === "scourge-survivors"}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-void via-void/35 to-transparent" />
                    <div className="absolute left-4 top-4">
                      <StatusBadge status={game.status} />
                    </div>
                  </div>
                </Link>

                <div className="p-5">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-widest text-ash">
                    <span>{game.genre}</span>
                    <span className="text-gunmetal">/</span>
                    <span>{game.faction}</span>
                  </div>
                  <h2 className="mt-3 font-display text-2xl font-bold uppercase leading-none tracking-tight text-bone">
                    {game.title}
                  </h2>
                  <p className="mt-3 min-h-16 text-sm leading-relaxed text-ash">{game.blurb}</p>
                  <p className="mt-4 border-l border-hellfire/60 pl-4 text-sm leading-relaxed text-ash">
                    {game.courseAngle}
                  </p>

                  <div className="mt-5 flex flex-wrap gap-2">
                    <Button asChild size="sm" className="font-display uppercase tracking-widest">
                      <Link href={`/games/${game.slug}`}>
                        Brief
                        <ArrowRight aria-hidden="true" />
                      </Link>
                    </Button>
                    {game.demoUrl ? (
                      <Button asChild size="sm" variant="outline" className="font-display uppercase tracking-widest">
                        <a href={game.demoUrl} target="_blank" rel="noreferrer">
                          <Gamepad2 aria-hidden="true" />
                          Play
                        </a>
                      </Button>
                    ) : null}
                    <Button asChild size="sm" variant="outline" className="font-display uppercase tracking-widest">
                      <a href={game.repoUrl} target="_blank" rel="noreferrer">
                        <Code2 aria-hidden="true" />
                        Source
                      </a>
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
