import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";

import { Eyebrow } from "@/components/site/eyebrow";
import { Backdrop } from "@/components/site/atmosphere";
import { GameCard } from "@/components/game/game-card";
import {
  accentVars,
  characters,
  characterGames,
  getCharacter,
  getFaction,
  spriteUrl,
} from "@/lib/content";

export function generateStaticParams() {
  return characters.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const character = getCharacter(slug);
  if (!character) return {};
  return { title: character.name, description: character.tagline };
}

export default async function CharacterPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const character = getCharacter(slug);
  if (!character) notFound();

  const sprite = spriteUrl(character.spriteBase);
  const faction = getFaction(character.factionSlug);
  const cgames = characterGames(character);

  return (
    <main style={accentVars(character.accent)}>
      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden px-6 pt-32 pb-16">
        <Backdrop />
        <div className="relative z-10 mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-2">
          {/* LEFT — portrait */}
          <div className="relative flex h-[420px] items-center justify-center overflow-hidden rounded-md border border-gunmetal bg-coal">
            <div
              aria-hidden
              className="absolute inset-0 bg-[radial-gradient(70%_60%_at_50%_30%,color-mix(in_srgb,var(--page-accent)_24%,transparent),transparent_72%)]"
            />
            <div className="vignette absolute inset-0" aria-hidden />
            {sprite ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={sprite}
                alt={character.name}
                className="relative z-10 h-[360px] object-contain drop-shadow-[0_16px_48px_color-mix(in_srgb,var(--page-accent)_55%,transparent)]"
              />
            ) : (
              <span className="relative z-10 select-none font-display text-[14rem] font-bold leading-none text-white/[0.06]">
                {character.name.charAt(0)}
              </span>
            )}
          </div>

          {/* RIGHT — identity */}
          <div>
            {faction ? (
              <Link
                href={`/factions/${faction.slug}`}
                className="text-xs font-bold uppercase tracking-[0.25em] text-ash transition-colors hover:text-[var(--page-accent)]"
              >
                ← {character.factionName}
              </Link>
            ) : (
              <Link
                href="/#games"
                className="text-xs font-bold uppercase tracking-[0.25em] text-ash transition-colors hover:text-[var(--page-accent)]"
              >
                ← Back
              </Link>
            )}
            <Eyebrow className="mt-6">{character.role}</Eyebrow>
            <h1 className="text-glow mt-4 font-display text-5xl font-bold uppercase tracking-tight text-bone sm:text-7xl">
              {character.name}
            </h1>
            {faction ? (
              <Link
                href={`/factions/${faction.slug}`}
                className="mt-5 inline-flex items-center gap-2 rounded-full border border-gunmetal bg-iron px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-bone transition-colors hover:border-[var(--page-accent)] hover:text-[var(--page-accent)]"
              >
                {character.factionName}
              </Link>
            ) : null}
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-ash">
              {character.tagline}
            </p>
          </div>
        </div>
      </section>

      {/* ── OVERVIEW ─────────────────────────────────────────────────────── */}
      <section className="relative border-t border-gunmetal/40 px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-3xl">
          <Eyebrow>Dossier</Eyebrow>
          <div className="mt-5 space-y-5">
            {character.overview.split("\n\n").map((p, i) => (
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
            <h2 className="font-display text-2xl font-bold uppercase tracking-tight text-bone">
              Gameplay Read
            </h2>
            <ul className="mt-6 space-y-2">
              {character.gameplayRead.map((item, i) => (
                <li
                  key={i}
                  className="border-l-2 border-[var(--page-accent)] pl-3 py-1 text-ash"
                >
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="font-display text-2xl font-bold uppercase tracking-tight text-bone">
              Visual Design
            </h2>
            <ul className="mt-6 space-y-2">
              {character.visualMotifs.map((item, i) => (
                <li
                  key={i}
                  className="border-l-2 border-[var(--page-accent)] pl-3 py-1 text-ash"
                >
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── APPEARS IN ───────────────────────────────────────────────────── */}
      {cgames.length ? (
        <section className="relative border-t border-gunmetal/40 px-6 py-20 sm:py-24">
          <div className="mx-auto max-w-7xl">
            <Eyebrow>Deployments</Eyebrow>
            <h2 className="mt-3 font-display text-4xl font-bold uppercase tracking-tight text-bone sm:text-5xl">
              Appears In
            </h2>
            <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {cgames.map((g) => (
                <GameCard key={g.slug} game={g} />
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </main>
  );
}
