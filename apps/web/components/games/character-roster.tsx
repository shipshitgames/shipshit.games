import type { CSSProperties } from "react";
import Image from "next/image";

import { Eyebrow } from "@/components/site/eyebrow";
import { accentStyle, accentVar } from "@/components/games/accent";
import type { AccentToken, CharacterEntry } from "@/lib/content/types";

/**
 * Character card grid. Defaults to the detail-page "Playable operators"
 * framing; faction pages reuse it with their own eyebrow/title.
 * Renders nothing when the roster is empty.
 */
export function CharacterRoster({
  characters,
  accent,
  eyebrow = "Playable operators",
  title = "Pick your way into the breach.",
}: {
  characters: CharacterEntry[];
  accent: AccentToken;
  eyebrow?: string;
  title?: string;
}) {
  if (characters.length === 0) return null;

  return (
    <section style={accentStyle(accent)} className="border-b border-gunmetal/40 px-6 py-20">
      <div className="mx-auto max-w-7xl">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2 className="mt-3 max-w-3xl font-display text-4xl font-bold uppercase tracking-tight text-bone sm:text-5xl">
          {title}
        </h2>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {characters.map((character) => (
            <article
              key={character.slug}
              style={{ "--accent": accentVar(character.accent) } as CSSProperties}
              className="group flex flex-col overflow-hidden rounded-md border border-gunmetal bg-coal transition-all duration-300 hover:border-[var(--accent)] hover:shadow-[0_0_36px_-14px_var(--accent)]"
            >
              <div className="relative flex h-44 items-end justify-center overflow-hidden border-b border-gunmetal/60 bg-void">
                {character.spritePath ? (
                  <Image
                    src={character.spritePath}
                    alt={`${character.name} sprite`}
                    width={160}
                    height={160}
                    className="mask-fade-b h-40 w-40 object-contain [image-rendering:pixelated] transition duration-500 group-hover:scale-105"
                  />
                ) : (
                  <span className="pb-16 font-mono text-xs uppercase tracking-widest text-gunmetal">
                    No sprite synced
                  </span>
                )}
              </div>

              <div className="flex flex-1 flex-col p-5">
                <p className="font-display text-xs font-bold uppercase tracking-widest text-[var(--accent)]">
                  {character.role}
                </p>
                <h3 className="mt-2 font-display text-2xl font-bold uppercase leading-none tracking-tight text-bone">
                  {character.name}
                </h3>
                <p className="mt-3 flex-1 text-sm leading-relaxed text-ash">{character.tagline}</p>

                <ul className="mt-4 flex flex-wrap gap-1.5">
                  {character.gameplayRead.slice(0, 3).map((read) => (
                    <li
                      key={read}
                      className="rounded-md border border-gunmetal bg-void/60 px-2 py-0.5 font-mono text-[11px] text-ash"
                    >
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
