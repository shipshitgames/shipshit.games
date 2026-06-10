import Image from "next/image";

import { Eyebrow } from "@/components/site/eyebrow";
import { accentStyle } from "@/components/games/accent";
import type { BestiaryEntry } from "@/lib/content/types";

/**
 * Scourge threat cards — toxic accent is canon here (and only here).
 * Renders nothing when there are no creatures.
 */
export function EnemyBestiary({
  creatures,
  eyebrow = "Known threats",
  title = "What the breach sends at you.",
}: {
  creatures: BestiaryEntry[];
  eyebrow?: string;
  title?: string;
}) {
  if (creatures.length === 0) return null;

  return (
    <section style={accentStyle("toxic")} className="border-b border-gunmetal/40 px-6 py-20">
      <div className="mx-auto max-w-7xl">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2 className="mt-3 max-w-3xl font-display text-4xl font-bold uppercase tracking-tight text-bone sm:text-5xl">
          {title}
        </h2>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {creatures.map((creature) => (
            <article
              key={creature.slug}
              className="group flex flex-col overflow-hidden rounded-md border border-gunmetal bg-coal transition-all duration-300 hover:border-toxic/60 hover:shadow-[0_0_36px_-14px_var(--color-toxic)]"
            >
              <div className="relative flex h-44 items-end justify-center overflow-hidden border-b border-gunmetal/60 bg-void">
                <div className="absolute inset-0 bg-[radial-gradient(70%_60%_at_50%_100%,color-mix(in_srgb,var(--color-toxic)_10%,transparent),transparent_70%)]" />
                {creature.spritePath ? (
                  <Image
                    src={creature.spritePath}
                    alt={`${creature.name} sprite`}
                    width={160}
                    height={160}
                    className="mask-fade-b relative h-40 w-40 object-contain [image-rendering:pixelated] transition duration-500 group-hover:scale-105"
                  />
                ) : (
                  <span className="relative pb-16 font-mono text-xs uppercase tracking-widest text-gunmetal">
                    No sprite synced
                  </span>
                )}
              </div>

              <div className="flex flex-1 flex-col p-5">
                <p className="font-display text-xs font-bold uppercase tracking-widest text-toxic">
                  {creature.tier}
                </p>
                <h3 className="mt-2 font-display text-2xl font-bold uppercase leading-none tracking-tight text-bone">
                  {creature.name}
                </h3>
                <p className="mt-3 flex-1 text-sm leading-relaxed text-ash">{creature.tagline}</p>

                <ul className="mt-4 space-y-1.5 border-t border-gunmetal/60 pt-4">
                  {creature.gameplayRead.slice(0, 3).map((read) => (
                    <li key={read} className="flex gap-2 font-mono text-[11px] leading-relaxed text-ash">
                      <span aria-hidden="true" className="text-toxic">
                        ▸
                      </span>
                      {read}
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
