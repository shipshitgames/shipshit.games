import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Code2,
  ExternalLink,
  Gamepad2,
} from "lucide-react";
import { GAMES, STATUS_LABELS, type Game, type GameStatus } from "@shipshitgames/shared";

import { Backdrop } from "@/components/site/atmosphere";
import { Eyebrow } from "@/components/site/eyebrow";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const STATUS_STYLES: Record<GameStatus, string> = {
  finished: "border-toxic/60 bg-toxic/10 text-toxic",
  playable: "border-hellfire/60 bg-hellfire/10 text-hellfire",
  prototype: "border-rust/70 bg-rust/15 text-bone",
  "in-dev": "border-gunmetal bg-iron text-ash",
  concept: "border-gunmetal bg-void text-ash",
};

const FINISH_GATES = [
  "Complete playable loop from menu to win, fail, summary, and restart.",
  "Production pixel-art assets registered in the Deadrot asset package.",
  "Audio/SFX, feedback, responsive controls, and readable HUD states.",
  "Desktop and mobile E2E journeys with no unexpected console/page errors.",
] as const;

function getGame(slug: string) {
  return GAMES.find((game) => game.slug === slug);
}

function StatusBadge({ status }: { status: GameStatus }) {
  return (
    <Badge variant="outline" className={`font-display uppercase tracking-widest ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}

export function generateStaticParams() {
  return GAMES.map((game) => ({ slug: game.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const game = getGame(slug);
  if (!game) return {};

  return {
    title: `${game.title} Game Brief`,
    description: game.summary,
    openGraph: {
      title: `${game.title} - Ship Shit Games`,
      description: game.summary,
      url: `https://shipshit.games/games/${game.slug}`,
      images: [
        {
          url: game.coverPath,
          width: 1200,
          height: 630,
          alt: `${game.title} pixel art cover`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `${game.title} - Ship Shit Games`,
      description: game.summary,
      images: [game.coverPath],
    },
  };
}

export default async function GamePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const game = getGame(slug);
  if (!game) notFound();

  return (
    <main>
      <Hero game={game} />
      <Proof game={game} />
      <FinishGate game={game} />
    </main>
  );
}

function Hero({ game }: { game: Game }) {
  return (
    <section className="relative min-h-[620px] overflow-hidden border-b border-gunmetal/40 px-6 pb-16 pt-32">
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
        <Link
          href="/games"
          className="inline-flex items-center gap-2 font-display text-xs font-bold uppercase tracking-widest text-ash transition-colors hover:text-bone"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Games
        </Link>

        <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,0.82fr)_minmax(320px,0.52fr)] lg:items-end">
          <div>
            <Eyebrow>{game.genre}</Eyebrow>
            <h1 className="text-glow mt-5 max-w-4xl font-display text-6xl font-bold uppercase leading-[0.84] tracking-tight text-bone sm:text-8xl">
              {game.title}
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-relaxed text-ash">{game.summary}</p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <StatusBadge status={game.status} />
              <span className="font-display text-xs font-bold uppercase tracking-widest text-ash">
                {game.faction}
              </span>
            </div>

            <div className="mt-9 flex flex-wrap gap-3">
              {game.demoUrl ? (
                <Button asChild size="xl" className="font-display uppercase tracking-widest shadow-ember">
                  <a href={game.demoUrl} target="_blank" rel="noreferrer">
                    <Gamepad2 aria-hidden="true" />
                    Play build
                  </a>
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
                className="object-cover"
              />
            </div>
            <p className="mt-5 border-l border-hellfire/60 pl-4 text-sm leading-relaxed text-ash">
              {game.courseAngle}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Proof({ game }: { game: Game }) {
  return (
    <section className="border-b border-gunmetal/40 px-6 py-20">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1fr)]">
          <div>
            <Eyebrow>Course proof</Eyebrow>
            <h2 className="mt-3 font-display text-4xl font-bold uppercase tracking-tight text-bone sm:text-5xl">
              What this build teaches.
            </h2>
            <p className="mt-5 max-w-xl leading-relaxed text-ash">
              The game page sells the process only if the runtime backs it up.
              Each proof point maps to a Deadrot readiness issue instead of
              floating as marketing copy.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="font-display uppercase tracking-widest shadow-ember">
                <Link href="/pricing">
                  Get Studio Pass
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="font-display uppercase tracking-widest">
                <a href={game.readinessIssueUrl} target="_blank" rel="noreferrer">
                  <ClipboardCheck aria-hidden="true" />
                  Readiness issue
                </a>
              </Button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {game.proofPoints.map((point) => (
              <article key={point} className="rounded-md border border-gunmetal bg-coal p-5">
                <CheckCircle2 className="size-5 text-hellfire" aria-hidden="true" />
                <p className="mt-4 text-sm leading-relaxed text-ash">{point}</p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function FinishGate({ game }: { game: Game }) {
  return (
    <section className="px-6 py-20">
      <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div>
          <Eyebrow>Finished product gate</Eyebrow>
          <h2 className="mt-3 font-display text-4xl font-bold uppercase tracking-tight text-bone sm:text-5xl">
            Playable is not the same as done.
          </h2>
          <div className="mt-8 grid gap-3">
            {FINISH_GATES.map((gate) => (
              <div key={gate} className="flex gap-4 border-l border-hellfire/60 bg-void/40 p-4">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-hellfire" aria-hidden="true" />
                <p className="text-sm leading-relaxed text-ash">{gate}</p>
              </div>
            ))}
          </div>
        </div>

        <aside className="rounded-md border border-gunmetal bg-coal p-6">
          <p className="font-display text-xs font-bold uppercase tracking-[0.35em] text-hellfire">
            Current state
          </p>
          <h3 className="mt-4 font-display text-3xl font-bold uppercase tracking-tight text-bone">
            {STATUS_LABELS[game.status]}
          </h3>
          <p className="mt-4 text-sm leading-relaxed text-ash">
            This page can market the build today, but the finished label waits
            for the Deadrot issue, asset checks, and E2E journey to pass.
          </p>
          <a
            href={game.readinessIssueUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-6 inline-flex items-center gap-2 font-display text-xs font-bold uppercase tracking-widest text-hellfire hover:text-blood"
          >
            Track readiness
            <ExternalLink className="size-4" aria-hidden="true" />
          </a>
        </aside>
      </div>
    </section>
  );
}
