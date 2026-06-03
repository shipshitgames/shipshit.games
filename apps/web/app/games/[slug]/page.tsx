import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Eyebrow } from "@/components/site/eyebrow";
import { Backdrop } from "@/components/site/atmosphere";
import { StatusBadge } from "@/components/game/game-card";
import { EntityCard } from "@/components/roster/entity-card";
import {
  games,
  getGame,
  getFaction,
  gameCharacters,
  gameCreatures,
  gameImageUrl,
  accentVars,
} from "@/lib/content";

export function generateStaticParams() {
  return games.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const game = getGame(slug);
  if (!game) return {};
  return { title: game.title, description: game.tagline };
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const game = getGame(slug);
  if (!game) notFound();

  const faction = game.factionSlug ? getFaction(game.factionSlug) : undefined;

  const image = gameImageUrl(game.slug);

  const roster = gameCharacters(game);
  const foes = gameCreatures(game);

  return (
    <main style={accentVars(game.accent)}>
      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section className="relative min-h-[72vh] overflow-hidden px-6 pb-16 pt-32">
        <Backdrop />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image}
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-55 saturate-125"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(70%_65%_at_70%_35%,transparent,color-mix(in_srgb,var(--page-accent)_16%,transparent)_45%,#0a0a0a_90%)]"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-r from-void via-void/70 to-void/25"
        />
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-void to-transparent"
        />

        <div className="relative z-10 mx-auto max-w-7xl">
          <Link
            href="/#games"
            className="text-xs font-bold uppercase tracking-[0.2em] text-ash transition-colors hover:text-bone"
          >
            ← All games
          </Link>

          <div className="mt-6 max-w-3xl">
            <Eyebrow>{game.genre}</Eyebrow>
            <h1 className="text-glow mt-4 font-display text-5xl font-bold uppercase leading-[0.85] tracking-tight text-bone sm:text-7xl">
              {game.title}
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ash">
              {game.tagline}
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-4">
              <StatusBadge status={game.status} />
              {faction ? (
                <Link
                  href={`/factions/${faction.slug}`}
                  className="text-sm uppercase tracking-widest text-[var(--page-accent)] transition-colors hover:text-bone"
                >
                  Faction: {game.factionName}
                </Link>
              ) : (
                <span className="text-sm uppercase tracking-widest text-ash">
                  {game.factionName}
                </span>
              )}
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              {game.demo ? (
                <Button
                  asChild
                  size="xl"
                  className="font-display uppercase tracking-widest shadow-ember"
                >
                  <a href={game.demo} target="_blank" rel="noreferrer">
                    Play Now
                  </a>
                </Button>
              ) : (
                <Badge
                  variant="outline"
                  className="border-gunmetal bg-iron font-display tracking-widest text-ash"
                >
                  Concept
                </Badge>
              )}
              {game.repo ? (
                <Button
                  asChild
                  size="xl"
                  variant="outline"
                  className="border-gunmetal font-display uppercase tracking-widest text-bone hover:border-[var(--page-accent)] hover:text-[var(--page-accent)]"
                >
                  <a href={game.repo} target="_blank" rel="noreferrer">
                    Source
                  </a>
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {/* ── OVERVIEW ─────────────────────────────────────────────────────── */}
      <section className="relative border-t border-gunmetal/40 px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-7xl">
          <Eyebrow>The Mission</Eyebrow>
          <h2 className="mt-3 font-display text-4xl font-bold uppercase tracking-tight text-bone sm:text-5xl">
            Overview
          </h2>
          <div className="mt-6 max-w-3xl space-y-4">
            {game.overview.split("\n\n").map((p, i) => (
              <p key={i} className="leading-relaxed text-ash">
                {p}
              </p>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ─────────────────────────────────────────────────────── */}
      {game.features.length ? (
        <section className="relative border-t border-gunmetal/40 px-6 py-20 sm:py-24">
          <div className="mx-auto max-w-7xl">
            <Eyebrow>What Makes It Hurt</Eyebrow>
            <h2 className="mt-3 font-display text-4xl font-bold uppercase tracking-tight text-bone sm:text-5xl">
              Features
            </h2>
            <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-3">
              {game.features.map((f) => (
                <div
                  key={f.title}
                  className="rounded-md border border-gunmetal bg-coal p-6"
                >
                  <h3 className="font-display text-lg font-bold uppercase tracking-tight text-[var(--page-accent)]">
                    {f.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-ash">
                    {f.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* ── PLAYABLE HEROES ──────────────────────────────────────────────── */}
      {roster.length ? (
        <section className="relative border-t border-gunmetal/40 px-6 py-20 sm:py-24">
          <div className="mx-auto max-w-7xl">
            <Eyebrow>The Pact</Eyebrow>
            <h2 className="mt-3 font-display text-4xl font-bold uppercase tracking-tight text-bone sm:text-5xl">
              Playable Heroes
            </h2>
            <div className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {roster.map((c) => (
                <EntityCard
                  key={c.slug}
                  href={`/characters/${c.slug}`}
                  name={c.name}
                  kicker={c.role}
                  tag={c.factionName}
                  accent={c.accent}
                  spriteBase={c.spriteBase}
                />
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* ── THE SCOURGE ──────────────────────────────────────────────────── */}
      {foes.length ? (
        <section className="relative border-t border-gunmetal/40 px-6 py-20 sm:py-24">
          <div className="mx-auto max-w-7xl">
            <Eyebrow>The Scourge</Eyebrow>
            <h2 className="mt-3 font-display text-4xl font-bold uppercase tracking-tight text-bone sm:text-5xl">
              What You&apos;re Killing
            </h2>
            <div className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {foes.map((b) => (
                <EntityCard
                  key={b.slug}
                  href={`/bestiary/${b.slug}`}
                  name={b.name}
                  kicker={b.tier}
                  tag="The Scourge"
                  accent={b.accent}
                  spriteBase={b.spriteBase}
                />
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </main>
  );
}
