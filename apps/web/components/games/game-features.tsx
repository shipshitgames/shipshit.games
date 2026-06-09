import { Eyebrow } from "@/components/site/eyebrow";
import { accentStyle } from "@/components/games/accent";
import type { AccentToken, LoreFeature } from "@/lib/content/types";

/** Lore features as a 3-up grid — the lore-driven replacement for proofPoints. */
export function GameFeatures({
  features,
  accent,
}: {
  features: LoreFeature[];
  accent: AccentToken;
}) {
  if (features.length === 0) return null;

  return (
    <section style={accentStyle(accent)} className="border-b border-gunmetal/40 px-6 py-20">
      <div className="mx-auto max-w-7xl">
        <Eyebrow>Core loop</Eyebrow>
        <h2 className="mt-3 max-w-3xl font-display text-4xl font-bold uppercase tracking-tight text-bone sm:text-5xl">
          What the build delivers.
        </h2>

        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {features.map((feature, index) => (
            <article key={feature.title} className="rounded-md border border-gunmetal bg-coal p-6">
              <span className="font-display text-sm font-bold uppercase tracking-widest text-[var(--accent)]">
                0{index + 1}
              </span>
              <h3 className="mt-4 font-display text-xl font-bold uppercase tracking-tight text-bone">
                {feature.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-ash">{feature.desc}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
