import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";

import { Eyebrow } from "@/components/site/eyebrow";
import { Backdrop } from "@/components/site/atmosphere";
import { GameCard } from "@/components/game/game-card";
import {
  bestiary,
  getCreature,
  creatureGames,
  accentVars,
  spriteUrl,
} from "@/lib/content";

export function generateStaticParams() {
  return bestiary.map((b) => ({ slug: b.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const creature = getCreature(slug);
  if (!creature) return {};
  return { title: creature.name, description: creature.tagline };
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const creature = getCreature(slug);
  if (!creature) notFound();

  const sprite = spriteUrl(creature.spriteBase);
  const bgames = creatureGames(creature);

  return (
    <main style={accentVars(creature.accent)}>
      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden px-6 pt-32 pb-16">
        <Backdrop />
        <div className="relative z-10 mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-[minmax(0,22rem)_1fr]">
          {/* LEFT — portrait / dossier plate */}
          <div className="relative mx-auto flex aspect-[4/5] w-full max-w-sm items-center justify-center overflow-hidden rounded-md border border-gunmetal bg-coal">
            <div
              aria-hidden
              className="absolute inset-0 bg-[radial-gradient(75%_60%_at_50%_10%,color-mix(in_srgb,var(--page-accent)_22%,transparent),transparent_72%)]"
            />
            {sprite ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={sprite}
                alt={creature.name}
                className="relative z-10 h-[78%] object-contain drop-shadow-[0_12px_40px_color-mix(in_srgb,var(--page-accent)_50%,transparent)]"
              />
            ) : (
              <span className="relative z-10 select-none font-display text-[10rem] font-bold leading-none text-white/[0.05]">
                {creature.name.charAt(0)}
              </span>
            )}
            <div className="vignette absolute inset-0 z-10" />
          </div>

          {/* RIGHT — identification */}
          <div>
            <Link
              href="/universe#bestiary"
              className="text-xs font-bold uppercase tracking-[0.25em] text-ash transition-colors hover:text-bone"
            >
              ← Bestiary
            </Link>
            <Eyebrow className="mt-5">{`Scourge · ${creature.tier}`}</Eyebrow>
            <h1 className="text-glow mt-3 font-display text-5xl font-bold uppercase leading-[0.9] tracking-tight text-bone sm:text-7xl">
              {creature.name}
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-ash">
              {creature.tagline}
            </p>
          </div>
        </div>
      </section>

      {/* ── OVERVIEW ─────────────────────────────────────────────────────── */}
      <section className="relative border-t border-gunmetal/40 px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-7xl">
          <Eyebrow>Threat Dossier</Eyebrow>
          <div className="mt-5 max-w-3xl space-y-5">
            {creature.overview.split("\n\n").map((p, i) => (
              <p key={i} className="leading-relaxed text-ash">
                {p}
              </p>
            ))}
          </div>
        </div>
      </section>

      {/* ── DETAIL ───────────────────────────────────────────────────────── */}
      <section className="relative border-t border-gunmetal/40 px-6 py-20 sm:py-24">
        <div className="mx-auto grid max-w-7xl gap-12 sm:grid-cols-2">
          <div>
            <h2 className="font-display text-2xl font-bold uppercase tracking-tight text-[var(--page-accent)]">
              Threat Read
            </h2>
            <ul className="mt-6 space-y-4">
              {creature.gameplayRead.map((item, i) => (
                <li
                  key={i}
                  className="border-l-2 border-[var(--page-accent)] pl-4 leading-relaxed text-ash"
                >
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="font-display text-2xl font-bold uppercase tracking-tight text-[var(--page-accent)]">
              Recognize It
            </h2>
            <ul className="mt-6 space-y-4">
              {creature.visualMotifs.map((item, i) => (
                <li
                  key={i}
                  className="border-l-2 border-[var(--page-accent)] pl-4 leading-relaxed text-ash"
                >
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── ENCOUNTERED IN ───────────────────────────────────────────────── */}
      {bgames.length > 0 ? (
        <section className="relative border-t border-gunmetal/40 px-6 py-20 sm:py-24">
          <div className="mx-auto max-w-7xl">
            <Eyebrow>Containment Failed</Eyebrow>
            <h2 className="mt-3 font-display text-4xl font-bold uppercase tracking-tight text-bone sm:text-5xl">
              Encountered In
            </h2>
            <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {bgames.map((g) => (
                <GameCard key={g.slug} game={g} />
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </main>
  );
}
