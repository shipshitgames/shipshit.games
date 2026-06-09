import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { GAMES } from "@shipshitgames/shared";

import loreJson from "@/content/lore.json";
import { Backdrop } from "@/components/site/atmosphere";
import { Breadcrumbs } from "@/components/site/breadcrumbs";
import { Eyebrow } from "@/components/site/eyebrow";
import { CharacterRoster } from "@/components/games/character-roster";
import { EnemyBestiary } from "@/components/games/enemy-bestiary";
import { StatusBadge } from "@/components/games/status-badge";
import { accentStyle } from "@/components/games/accent";
import { getCharacters, getFaction, UNIVERSE } from "@/lib/content";
import type { FactionEntry, LoreSnapshot } from "@/lib/content/types";

const SCOURGE_SLUG = "scourge";
const FACTION_SLUGS = ["the-pyre", "the-wardens", "the-listeners", SCOURGE_SLUG] as const;

/** Full bestiary for the enemy page; lib/content only exposes slug lookups. */
const BESTIARY = (loreJson as LoreSnapshot).bestiary;

export function generateStaticParams() {
  return FACTION_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;

  if (slug === SCOURGE_SLUG) {
    const description =
      "The Scourge: a host-takeover parasite with no shape of its own. Every known form in the Deadrot bestiary.";
    return {
      title: "The Scourge - Threat Dossier",
      description,
      openGraph: {
        title: "The Scourge - Ship Shit Games",
        description,
        url: "https://shipshit.games/factions/scourge",
      },
      twitter: { card: "summary_large_image", title: "The Scourge - Ship Shit Games", description },
    };
  }

  const faction = getFaction(slug);
  if (!faction) return {};

  return {
    title: `${faction.name} Faction Dossier`,
    description: faction.tagline,
    openGraph: {
      title: `${faction.name} - Ship Shit Games`,
      description: faction.tagline,
      url: `https://shipshit.games/factions/${faction.slug}`,
    },
    twitter: {
      card: "summary_large_image",
      title: `${faction.name} - Ship Shit Games`,
      description: faction.tagline,
    },
  };
}

function Paragraphs({ text, className }: { text: string; className?: string }) {
  return (
    <>
      {text.split("\n\n").map((paragraph) => (
        <p key={paragraph.slice(0, 40)} className={className}>
          {paragraph}
        </p>
      ))}
    </>
  );
}

function FactionHero({
  slug,
  eyebrow,
  name,
  tagline,
  overview,
  aside,
}: {
  slug: string;
  eyebrow: string;
  name: string;
  tagline: string;
  overview: string;
  aside?: React.ReactNode;
}) {
  return (
    <section className="relative overflow-hidden border-b border-gunmetal/40 px-6 pb-16 pt-32">
      <Backdrop />
      <div className="relative z-10 mx-auto max-w-7xl">
        <Breadcrumbs
          items={[
            { name: "Home", href: "/" },
            { name: "Factions", href: "/factions" },
            { name, href: `/factions/${slug}` },
          ]}
        />

        <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.5fr)] lg:items-start">
          <div>
            <Eyebrow>{eyebrow}</Eyebrow>
            <h1 className="text-glow mt-5 font-display text-6xl font-bold uppercase leading-[0.84] tracking-tight text-bone sm:text-8xl">
              {name}
            </h1>
            <p
              className="mt-7 max-w-2xl border-l-2 pl-4 font-display text-xl font-bold uppercase tracking-tight text-bone"
              style={{ borderColor: "var(--accent)" }}
            >
              {tagline}
            </p>
            <div className="mt-6 max-w-2xl space-y-4">
              <Paragraphs text={overview} className="leading-relaxed text-ash" />
            </div>
          </div>
          {aside}
        </div>
      </div>
    </section>
  );
}

function GamesList({ faction }: { faction: FactionEntry }) {
  const games = faction.gameSlugs
    .map((slug) => GAMES.find((game) => game.slug === slug))
    .filter((game): game is (typeof GAMES)[number] => game !== undefined);
  if (games.length === 0) return null;

  return (
    <section className="px-6 py-20">
      <div className="mx-auto max-w-7xl">
        <Eyebrow>Active fronts</Eyebrow>
        <h2 className="mt-3 max-w-3xl font-display text-4xl font-bold uppercase tracking-tight text-bone sm:text-5xl">
          Where {faction.name} fights.
        </h2>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {games.map((game) => (
            <Link
              key={game.slug}
              href={`/games/${game.slug}`}
              className="group overflow-hidden rounded-md border border-gunmetal bg-coal transition-all duration-300 hover:border-[var(--accent)] hover:shadow-[0_0_36px_-14px_var(--accent)]"
            >
              <div className="relative aspect-[1200/630] overflow-hidden bg-void">
                <Image
                  src={game.coverPath}
                  alt={`${game.title} pixel art cover`}
                  fill
                  sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                  className="object-cover [image-rendering:pixelated] transition duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-void via-void/30 to-transparent" />
                <div className="absolute left-4 top-4">
                  <StatusBadge status={game.status} />
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 p-5">
                <div>
                  <h3 className="font-display text-xl font-bold uppercase leading-none tracking-tight text-bone">
                    {game.title}
                  </h3>
                  <p className="mt-2 text-xs font-bold uppercase tracking-widest text-ash">{game.genre}</p>
                </div>
                <ArrowRight
                  aria-hidden="true"
                  className="size-5 shrink-0 text-ash transition-colors group-hover:text-[var(--accent)]"
                />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function ScourgePage() {
  return (
    <main style={accentStyle("toxic")}>
      <FactionHero
        slug={SCOURGE_SLUG}
        eyebrow="The enemy — one mind, every body"
        name="The Scourge"
        tagline="It doesn't want to kill you. It wants to wear you."
        overview={UNIVERSE.premise}
        aside={
          <aside className="rounded-md border border-gunmetal bg-coal/90 p-6">
            <Eyebrow>How the war is fought</Eyebrow>
            <div className="mt-4 space-y-5">
              {UNIVERSE.pillars.map((pillar) => (
                <div key={pillar.title} className="border-l border-toxic/50 pl-4">
                  <h2 className="font-display text-base font-bold uppercase tracking-tight text-bone">
                    {pillar.title}
                  </h2>
                  <p className="mt-1 text-sm leading-relaxed text-ash">{pillar.desc}</p>
                </div>
              ))}
            </div>
          </aside>
        }
      />

      <EnemyBestiary
        creatures={BESTIARY}
        eyebrow="The bestiary"
        title="Every known form of the rot."
      />

      <section className="px-6 py-20">
        <div className="mx-auto max-w-7xl rounded-md border border-gunmetal bg-coal p-8">
          <Eyebrow>Fight back</Eyebrow>
          <h2 className="mt-3 font-display text-3xl font-bold uppercase tracking-tight text-bone">
            Pick a doctrine and hold the lane.
          </h2>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/factions"
              className="inline-flex items-center gap-2 font-display text-xs font-bold uppercase tracking-widest text-toxic transition-colors hover:text-bone"
            >
              The factions
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
            <Link
              href="/games"
              className="inline-flex items-center gap-2 font-display text-xs font-bold uppercase tracking-widest text-toxic transition-colors hover:text-bone"
            >
              The games
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

export default async function FactionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (slug === SCOURGE_SLUG) return <ScourgePage />;

  const faction = getFaction(slug);
  if (!faction) notFound();

  const characters = getCharacters(faction.characterSlugs);

  return (
    <main style={accentStyle(faction.accent)}>
      <FactionHero
        slug={faction.slug}
        eyebrow={faction.doctrine}
        name={faction.name}
        tagline={faction.tagline}
        overview={faction.overview}
        aside={
          <aside className="space-y-6">
            <div className="rounded-md border border-gunmetal bg-coal/90 p-6">
              <Eyebrow>Playstyle</Eyebrow>
              <p className="mt-4 text-sm leading-relaxed text-ash">{faction.playstyle}</p>
            </div>
            <div className="rounded-md border border-gunmetal bg-coal/90 p-6">
              <Eyebrow>Crest</Eyebrow>
              <p className="mt-4 font-mono text-xs leading-relaxed text-ash">{faction.crestMotif}</p>
            </div>
          </aside>
        }
      />

      <section className="border-b border-gunmetal/40 px-6 py-20">
        <div className="mx-auto max-w-7xl">
          <Eyebrow>The rivalry, the Pact</Eyebrow>
          <blockquote
            className="mt-6 max-w-4xl space-y-4 border-l-2 bg-void/40 p-6 text-lg leading-relaxed text-bone"
            style={{ borderColor: "var(--accent)" }}
          >
            <Paragraphs text={faction.rivalry} />
          </blockquote>
        </div>
      </section>

      <CharacterRoster
        characters={characters}
        accent={faction.accent}
        eyebrow="Roster"
        title={`Operators of ${faction.name}.`}
      />

      <GamesList faction={faction} />
    </main>
  );
}
