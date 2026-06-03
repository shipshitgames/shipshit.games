import type { Metadata } from "next";
import Link from "next/link";

import { Eyebrow } from "@/components/site/eyebrow";
import { Backdrop } from "@/components/site/atmosphere";
import { EntityCard } from "@/components/roster/entity-card";
import { FactionCrest } from "@/components/faction/faction-crest";
import {
  accentVars,
  bestiary,
  characters,
  factions,
  universe,
} from "@/lib/content";

export const metadata: Metadata = {
  title: "The Universe",
  description:
    "One blood-soaked canon — the Scourge, the Pact, the Choir, and the war for the lanes.",
};

export default function UniversePage() {
  return (
    <main>
      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section
        style={accentVars("toxic")}
        className="relative overflow-hidden px-6 pt-32 pb-16"
      >
        <Backdrop />
        <div className="relative z-10 mx-auto max-w-7xl">
          <Eyebrow>The Canon</Eyebrow>
          <h1 className="text-glow mt-5 font-display text-5xl font-bold uppercase tracking-tight text-bone sm:text-7xl">
            The Scourge Universe
          </h1>
          <div className="mt-7 max-w-3xl space-y-5">
            {universe.premise.split("\n\n").map((p, i) => (
              <p key={i} className="text-lg leading-relaxed text-ash">
                {p}
              </p>
            ))}
          </div>
        </div>
      </section>

      {/* ── PILLARS ──────────────────────────────────────────────────────── */}
      <section
        id="pillars"
        style={accentVars("toxic")}
        className="relative scroll-mt-24 border-t border-gunmetal/40 px-6 py-20 sm:py-24"
      >
        <div className="mx-auto max-w-7xl">
          <Eyebrow>The Foundations</Eyebrow>
          <h2 className="mt-3 font-display text-4xl font-bold uppercase tracking-tight text-bone sm:text-5xl">
            The Pillars
          </h2>
          <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {universe.pillars.map((p) => (
              <div
                key={p.title}
                className="rounded-md border border-gunmetal bg-coal/60 p-6 transition-colors hover:border-[var(--page-accent)]"
              >
                <h3 className="font-display text-lg font-bold uppercase tracking-tight text-[var(--page-accent)]">
                  {p.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-ash">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TIMELINE ─────────────────────────────────────────────────────── */}
      <section
        id="timeline"
        style={accentVars("hellfire")}
        className="relative scroll-mt-24 border-t border-gunmetal/40 px-6 py-20 sm:py-24"
      >
        <div className="mx-auto max-w-7xl">
          <Eyebrow>The Chronicle</Eyebrow>
          <h2 className="mt-3 font-display text-4xl font-bold uppercase tracking-tight text-bone sm:text-5xl">
            The War, In Order
          </h2>
          <ol className="mt-12 max-w-3xl space-y-10 border-l border-gunmetal pl-8">
            {universe.eras.map((era) => (
              <li key={era.name} className="relative">
                <span
                  aria-hidden
                  className="absolute -left-[2.4rem] top-1.5 h-3.5 w-3.5 -translate-x-1/2 rounded-full border-2 border-[var(--page-accent)] bg-void shadow-[0_0_16px_-2px_var(--page-accent)]"
                />
                <h3 className="font-display text-2xl font-bold uppercase tracking-tight text-bone">
                  {era.name}
                </h3>
                <p className="mt-2 leading-relaxed text-ash">{era.blurb}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── FACTIONS ─────────────────────────────────────────────────────── */}
      <section
        id="factions"
        className="relative scroll-mt-24 border-t border-gunmetal/40 px-6 py-20 sm:py-24"
      >
        <div className="mx-auto max-w-7xl">
          <Eyebrow className="text-blood">Choose a Side</Eyebrow>
          <h2 className="mt-3 font-display text-4xl font-bold uppercase tracking-tight text-bone sm:text-5xl">
            The Factions
          </h2>
          <p className="mt-3 max-w-2xl text-ash">
            Bound by the Pact, divided by doctrine. Burn the source, hold the
            line, or listen to the dark.
          </p>
          <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-3">
            {factions.map((f) => (
              <Link
                key={f.slug}
                href={`/factions/${f.slug}`}
                style={accentVars(f.accent)}
                className="group relative overflow-hidden rounded-md border border-gunmetal bg-coal p-8 transition-all duration-300 hover:border-[var(--page-accent)] hover:shadow-[0_0_40px_-16px_var(--page-accent)]"
              >
                <FactionCrest
                  accent={f.accent}
                  className="absolute -right-6 -top-6 h-40 w-40 opacity-10 transition-opacity duration-300 group-hover:opacity-20"
                />
                <div className="relative z-10">
                  <FactionCrest accent={f.accent} className="h-12 w-12" />
                  <h3 className="mt-4 font-display text-2xl font-bold uppercase tracking-tight text-bone">
                    {f.name}
                  </h3>
                  <p className="mt-1 text-xs uppercase tracking-widest text-[var(--page-accent)]">
                    {f.doctrine}
                  </p>
                  <p className="mt-4 text-sm leading-relaxed text-ash">
                    {f.tagline}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── HEROES ───────────────────────────────────────────────────────── */}
      <section
        id="heroes"
        className="relative scroll-mt-24 border-t border-gunmetal/40 px-6 py-20 sm:py-24"
      >
        <div className="mx-auto max-w-7xl">
          <Eyebrow className="text-bone">The Pact</Eyebrow>
          <h2 className="mt-3 font-display text-4xl font-bold uppercase tracking-tight text-bone sm:text-5xl">
            The Heroes
          </h2>
          <p className="mt-3 max-w-2xl text-ash">
            The ones who hold the lanes. Every operator a sprite forged on
            stream.
          </p>
          <div className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {characters.map((c) => (
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

      {/* ── BESTIARY ─────────────────────────────────────────────────────── */}
      <section
        id="bestiary"
        style={accentVars("toxic")}
        className="relative scroll-mt-24 border-t border-gunmetal/40 px-6 py-20 sm:py-24"
      >
        <div className="mx-auto max-w-7xl">
          <Eyebrow>The Through-Line Enemy</Eyebrow>
          <h2 className="mt-3 font-display text-4xl font-bold uppercase tracking-tight text-bone sm:text-5xl">
            The Scourge
          </h2>
          <p className="mt-3 max-w-2xl text-ash">
            No shape of its own — it wears whatever it infects. Blind it,
            isolate it, win the night. You can never truly kill it.
          </p>
          <div className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {bestiary.map((b) => (
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
    </main>
  );
}
