import { Eyebrow } from "@/components/site/eyebrow";
import { PageSection } from "@/components/site/page-section";
import { SectionIllustration } from "@/components/site/section-illustration";

const PROBLEMS = [
  {
    title: "Idea flood",
    body: "AI can hand you a hundred concepts before lunch. The hard part is choosing the one with enough teeth to ship.",
  },
  {
    title: "Canon drift",
    body: "Prompts, renders, lore, UI, and code drift unless the build has rules and a real source of truth.",
  },
  {
    title: "Taste check",
    body: "Automation without review makes louder slop. The system has to scope, build, inspect, and cut.",
  },
] as const;

export function StudioReality() {
  return (
    <PageSection
      accent="blood"
      id="studio"
      className="relative scroll-mt-16 overflow-hidden border-t border-gunmetal/40 px-6 py-24"
      illustration={
        <SectionIllustration src="/images/games/deadlane.webp" objectPosition="center 42%" />
      }
    >
      <div className="relative z-10 mx-auto max-w-7xl">
        <Eyebrow>Studio reality</Eyebrow>
        <h2 className="mt-3 max-w-4xl font-display text-4xl font-bold uppercase leading-tight text-bone sm:text-5xl">
          AI floods. We ship.
        </h2>
        <p className="mt-5 max-w-2xl leading-relaxed text-ash">
          The new bottleneck is not generation. It is taste, continuity, QA,
          deployment, and knowing what to cut before the build collapses under
          its own cleverness.
        </p>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {PROBLEMS.map((item) => (
            <div
              key={item.title}
              className="rounded-md border border-gunmetal bg-coal/80 p-6"
            >
              <h3 className="font-display text-xl font-bold uppercase tracking-tight text-bone">
                {item.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-ash">{item.body}</p>
            </div>
          ))}
        </div>
      </div>
    </PageSection>
  );
}
