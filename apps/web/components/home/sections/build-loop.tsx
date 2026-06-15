import { Eyebrow } from "@/components/site/eyebrow";
import { PageSection } from "@/components/site/page-section";
import { SectionIllustration } from "@/components/site/section-illustration";

const SOLUTION_STEPS = [
  {
    title: "Scope",
    body: "Start with one promise, one aesthetic lane, and one public build target.",
  },
  {
    title: "Canon",
    body: "Keep assets, lore, prompts, and implementation tied to studio rules instead of one-off experiments.",
  },
  {
    title: "Ship",
    body: "Use agents for scaffolding, code, review, deployment, and session capture until the build is public.",
  },
] as const;

export function BuildLoop() {
  return (
    <PageSection
      accent="hellfire"
      id="loop"
      className="relative scroll-mt-16 overflow-hidden border-t border-gunmetal/40 px-6 py-24"
      illustration={
        <SectionIllustration src="/images/games/pactfall.webp" objectPosition="center 48%" opacity={0.2} />
      }
      backdrop
    >
      <div className="relative z-10 mx-auto max-w-7xl">
        <Eyebrow>The build loop</Eyebrow>
        <h2 className="mt-3 max-w-4xl font-display text-4xl font-bold uppercase leading-tight tracking-tight text-bone sm:text-5xl">
          Scope. Canon. Ship.
        </h2>
        <p className="mt-5 max-w-2xl leading-relaxed text-ash">
          Ship Shit Games is the operating system we use to build DEADROT in
          public: scoped slices, canon-aware asset generation, agent workflows,
          and ruthless review loops.
        </p>
        <div className="mt-12 grid gap-4 lg:grid-cols-3">
          {SOLUTION_STEPS.map((step, index) => (
            <div
              key={step.title}
              className="border-l border-hellfire/60 bg-void/30 p-6"
            >
              <span className="font-display text-sm font-bold uppercase tracking-widest text-hellfire">
                0{index + 1}
              </span>
              <h3 className="mt-4 font-display text-2xl font-bold uppercase tracking-tight text-bone">
                {step.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-ash">{step.body}</p>
            </div>
          ))}
        </div>
      </div>
    </PageSection>
  );
}
