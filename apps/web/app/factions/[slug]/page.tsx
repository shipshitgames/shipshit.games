import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";

import { Eyebrow } from "@/components/site/eyebrow";
import { Backdrop } from "@/components/site/atmosphere";
import { GameCard } from "@/components/game/game-card";
import { EntityCard } from "@/components/roster/entity-card";
import { FactionCrest } from "@/components/faction/faction-crest";
import {
  factions,
  getFaction,
  factionGames,
  charactersByFaction,
  accentVars,
} from "@/lib/content";

export function generateStaticParams() {
  return factions.map((f) => ({ slug: f.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const faction = getFaction(slug);
  if (!faction) return {};
  return { title: faction.name, description: faction.tagline };
}

export default async function FactionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const faction = getFaction(slug);
  if (!faction) notFound();

  const roster = charactersByFaction(faction.slug);
  const fgames = factionGames(faction);

  return (
    <main style={accentVars(faction.accent)}>
      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden px-6 pt-32 pb-16">
        <Backdrop />
        <FactionCrest
          accent={faction.accent}
          className="pointer-events-none absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 opacity-10"
        />
        <div className="relative z-10 mx-auto max-w-7xl">
          <Link
            href="/universe"
            className="text-xs font-bold uppercase tracking-[0.3em] text-ash transition-colors hover:text-bone"
          >
            ← Universe
          </Link>
          <FactionCrest
            accent={faction.accent}
            className="mt-8 h-20 w-20"
          />
          <Eyebrow className="mt-6">{faction.doctrine}</Eyebrow>
          <h1 className="text-glow mt-3 font-display text-5xl font-bold uppercase tracking-tight text-bone sm:text-7xl">
            {faction.name}
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-ash">
            {faction.tagline}
          </p>
        </div>
      </section>

      {/* ── OVERVIEW ─────────────────────────────────────────────────────── */}
      <section className="relative border-t border-gunmetal/40 px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-3xl">
          <Eyebrow>Dossier</Eyebrow>
          <div className="mt-5 space-y-5">
            {faction.overview.split("\n\n").map((p, i) => (
              <p key={i} className="leading-relaxed text-ash">
                {p}
              </p>
            ))}
          </div>
        </div>
      </section>

      {/* ── DOCTRINE ─────────────────────────────────────────────────────── */}
      <section className="relative border-t border-gunmetal/40 px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-7xl">
          <Eyebrow>The Way of War</Eyebrow>
          <h2 className="mt-3 font-display text-4xl font-bold uppercase tracking-tight text-bone sm:text-5xl">
            Doctrine
          </h2>
          <div className="mt-10 grid gap-5 sm:grid-cols-2">
            <div className="rounded-md border border-gunmetal bg-coal p-6 transition-colors hover:border-[var(--page-accent)]">
              <h3 className="font-display text-xl font-bold uppercase tracking-tight text-[var(--page-accent)]">
                Playstyle
              </h3>
              <p className="mt-3 leading-relaxed text-ash">
                {faction.playstyle}
              </p>
            </div>
            <div className="rounded-md border border-gunmetal bg-coal p-6 transition-colors hover:border-[var(--page-accent)]">
              <h3 className="font-display text-xl font-bold uppercase tracking-tight text-[var(--page-accent)]">
                The Pact / Rivalry
              </h3>
              <p className="mt-3 leading-relaxed text-ash">
                {faction.rivalry}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── ROSTER ───────────────────────────────────────────────────────── */}
      {roster.length > 0 && (
        <section className="relative border-t border-gunmetal/40 px-6 py-20 sm:py-24">
          <div className="mx-auto max-w-7xl">
            <Eyebrow>The Faithful</Eyebrow>
            <h2 className="mt-3 font-display text-4xl font-bold uppercase tracking-tight text-bone sm:text-5xl">
              Heroes of {faction.name}
            </h2>
            <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
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
      )}

      {/* ── GAMES ────────────────────────────────────────────────────────── */}
      {fgames.length > 0 && (
        <section className="relative border-t border-gunmetal/40 px-6 py-20 sm:py-24">
          <div className="mx-auto max-w-7xl">
            <Eyebrow>The Front Lines</Eyebrow>
            <h2 className="mt-3 font-display text-4xl font-bold uppercase tracking-tight text-bone sm:text-5xl">
              Where They Fight
            </h2>
            <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {fgames.map((g) => (
                <GameCard key={g.slug} game={g} />
              ))}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
