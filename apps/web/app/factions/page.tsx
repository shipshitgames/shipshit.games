import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Skull } from "lucide-react";

import { Backdrop } from "@/components/site/atmosphere";
import { Breadcrumbs } from "@/components/site/breadcrumbs";
import { Eyebrow } from "@/components/site/eyebrow";
import { accentStyle } from "@/components/games/accent";
import { getCharacters, getCreature, getCreatures, getFactions } from "@/lib/content";
import type { FactionEntry } from "@/lib/content/types";

export const metadata: Metadata = {
  title: "Factions",
  description:
    "The Pyre, the Wardens, and the Listeners — humanity's three answers to the Scourge in the Deadrot universe.",
  openGraph: {
    title: "Deadrot Factions - Ship Shit Games",
    description:
      "The Pyre burn the source, the Wardens hold the line, the Listeners ask the forbidden question. The Scourge is why.",
    url: "https://shipshit.games/factions",
  },
};

/** Strip of roster sprites for a faction card; hidden when no portraits are synced. */
function PortraitStrip({ sprites }: { sprites: { name: string; src: string }[] }) {
  if (sprites.length === 0) return null;
  return (
    <div className="mt-6 flex items-end gap-2 border-t border-gunmetal/60 pt-5">
      {sprites.map((sprite) => (
        <div
          key={sprite.src}
          title={sprite.name}
          className="size-12 overflow-hidden rounded-md border border-gunmetal/70 bg-void/80"
        >
          <Image
            src={sprite.src}
            alt={`${sprite.name} sprite`}
            width={48}
            height={48}
            className="h-full w-full object-contain [image-rendering:pixelated]"
          />
        </div>
      ))}
    </div>
  );
}

function FactionCard({ faction }: { faction: FactionEntry }) {
  const sprites = getCharacters(faction.characterSlugs)
    .filter((character) => character.spritePath !== null)
    .slice(0, 5)
    .map((character) => ({ name: character.name, src: character.spritePath as string }));

  return (
    <Link
      href={`/factions/${faction.slug}`}
      style={accentStyle(faction.accent)}
      className="group flex flex-col rounded-md border border-gunmetal bg-coal p-7 transition-all duration-300 hover:border-[var(--accent)] hover:shadow-[0_0_44px_-14px_var(--accent)]"
    >
      <Eyebrow>{faction.doctrine}</Eyebrow>
      <h2 className="mt-3 font-display text-3xl font-bold uppercase leading-none tracking-tight text-bone">
        {faction.name}
      </h2>
      <p
        className="mt-4 flex-1 border-l pl-4 text-sm leading-relaxed text-ash"
        style={{ borderColor: "color-mix(in srgb, var(--accent) 60%, transparent)" }}
      >
        {faction.tagline}
      </p>
      <PortraitStrip sprites={sprites} />
      <span className="mt-6 inline-flex items-center gap-2 font-display text-xs font-bold uppercase tracking-widest text-[var(--accent)] transition-colors group-hover:text-bone">
        Read the dossier
        <ArrowRight aria-hidden="true" className="size-4" />
      </span>
    </Link>
  );
}

function ScourgeThreatCard() {
  const overview = getCreature("scourge");
  const sprites = getCreatures(["swarm-ripper", "render", "rot-engine", "breach-boss"])
    .filter((creature) => creature.spritePath !== null)
    .map((creature) => ({ name: creature.name, src: creature.spritePath as string }));

  return (
    <Link
      href="/factions/scourge"
      style={accentStyle("toxic")}
      className="group mt-6 flex flex-col gap-6 rounded-md border border-gunmetal bg-coal p-7 transition-all duration-300 hover:border-toxic/70 hover:shadow-[0_0_44px_-14px_var(--color-toxic)] md:flex-row md:items-center md:justify-between"
    >
      <div className="flex-1">
        <p className="flex items-center gap-2 font-display text-xs font-bold uppercase tracking-[0.35em] text-toxic">
          <Skull aria-hidden="true" className="size-4" />
          The enemy — one mind, every body
        </p>
        <h2 className="mt-3 font-display text-3xl font-bold uppercase leading-none tracking-tight text-bone">
          The Scourge
        </h2>
        <p className="mt-4 max-w-2xl border-l border-toxic/60 pl-4 text-sm leading-relaxed text-ash">
          {overview?.tagline ?? "It doesn't want to kill you. It wants to wear you."}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-start gap-5 md:items-end">
        <div className="flex items-end gap-2">
          {sprites.map((sprite) => (
            <div
              key={sprite.src}
              title={sprite.name}
              className="size-12 overflow-hidden rounded-md border border-gunmetal/70 bg-void/80"
            >
              <Image
                src={sprite.src}
                alt={`${sprite.name} sprite`}
                width={48}
                height={48}
                className="h-full w-full object-contain [image-rendering:pixelated]"
              />
            </div>
          ))}
        </div>
        <span className="inline-flex items-center gap-2 font-display text-xs font-bold uppercase tracking-widest text-toxic transition-colors group-hover:text-bone">
          Know the threat
          <ArrowRight aria-hidden="true" className="size-4" />
        </span>
      </div>
    </Link>
  );
}

export default function FactionsPage() {
  const factions = getFactions();

  return (
    <main>
      <section className="relative overflow-hidden border-b border-gunmetal/40 px-6 pb-16 pt-32">
        <Backdrop />
        <div className="relative z-10 mx-auto max-w-7xl">
          <Breadcrumbs
            items={[
              { name: "Home", href: "/" },
              { name: "Factions", href: "/factions" },
            ]}
          />
          <Eyebrow className="mt-10">One Pact, three doctrines</Eyebrow>
          <h1 className="text-glow mt-5 max-w-4xl font-display text-5xl font-bold uppercase leading-[0.9] tracking-tight text-bone sm:text-7xl">
            Humanity split over how to survive.
          </h1>
          <p className="mt-7 max-w-2xl text-lg leading-relaxed text-ash">
            The Wardens wall up and outlast. The Pyre walk into the breach and
            burn the source. The Listeners commit the heresy of trying to
            understand it. Whatever the feud — when a breach opens, every human
            stands on the same side of the wall.
          </p>
        </div>
      </section>

      <section className="px-6 py-16">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-6 md:grid-cols-3">
            {factions.map((faction) => (
              <FactionCard key={faction.slug} faction={faction} />
            ))}
          </div>
          <ScourgeThreatCard />
        </div>
      </section>
    </main>
  );
}
