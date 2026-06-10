import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Eyebrow } from "@/components/site/eyebrow";
import { accentStyle } from "@/components/games/accent";
import type { FactionEntry } from "@/lib/content/types";

/** Cross-link from a game brief to the faction that fields it. */
export function FactionLinkCard({ faction }: { faction: FactionEntry }) {
  return (
    <section style={accentStyle(faction.accent)} className="px-6 py-20">
      <div className="mx-auto max-w-7xl">
        <Link
          href={`/factions/${faction.slug}`}
          className="group flex flex-col gap-6 overflow-hidden rounded-md border border-gunmetal bg-coal p-8 transition-all duration-300 hover:border-[var(--accent)] hover:shadow-[0_0_44px_-14px_var(--accent)] md:flex-row md:items-center md:justify-between"
        >
          <div>
            <Eyebrow>{faction.doctrine}</Eyebrow>
            <h2 className="mt-3 font-display text-4xl font-bold uppercase tracking-tight text-bone">
              Fight for {faction.name}.
            </h2>
            <p
              className="mt-4 max-w-2xl border-l pl-4 text-sm leading-relaxed text-ash"
              style={{ borderColor: "color-mix(in srgb, var(--accent) 60%, transparent)" }}
            >
              {faction.tagline}
            </p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-2 font-display text-sm font-bold uppercase tracking-widest text-[var(--accent)] transition-colors group-hover:text-bone">
            Faction dossier
            <ArrowRight aria-hidden="true" className="size-5" />
          </span>
        </Link>
      </div>
    </section>
  );
}
