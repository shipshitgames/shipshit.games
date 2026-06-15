import { ArrowRight, Mail } from "lucide-react";

import { Eyebrow } from "@/components/site/eyebrow";
import { PageSection } from "@/components/site/page-section";
import { SectionIllustration } from "@/components/site/section-illustration";
import { Signup } from "@/components/site/signup";

export function Newsletter() {
  return (
    <PageSection
      accent="hellfire"
      id="newsletter"
      className="relative scroll-mt-16 overflow-hidden border-t border-gunmetal/40 px-6 py-24"
      illustration={
        <SectionIllustration src="/images/games/rothulk.webp" objectPosition="center 42%" opacity={0.2} />
      }
    >
      <div className="relative z-10 mx-auto grid max-w-7xl gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)] lg:items-start">
        <div>
          <Eyebrow>Build log</Eyebrow>
          <h2 className="mt-3 max-w-3xl font-display text-4xl font-bold uppercase tracking-tight text-bone sm:text-5xl">
            The devlog should have an archive.
          </h2>
          <p className="mt-4 max-w-2xl leading-relaxed text-ash">
            Substack is the right default for the newsletter because every
            issue can be email, public post, and receipt at the same time.
            The site stays the landing page; the archive carries the build
            history.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <div className="border-l border-hellfire/60 bg-void/40 p-5">
              <Mail className="size-5 text-hellfire" aria-hidden="true" />
              <h3 className="mt-4 font-display text-lg font-bold uppercase tracking-tight text-bone">
                Email first
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-ash">
                Short, useful dispatches from real builds: shipped slices,
                broken loops, prompts, and cuts.
              </p>
            </div>
            <div className="border-l border-blood/70 bg-void/40 p-5">
              <ArrowRight className="size-5 text-blood" aria-hidden="true" />
              <h3 className="mt-4 font-display text-lg font-bold uppercase tracking-tight text-bone">
                Public record
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-ash">
                Readers can link to posts instead of screenshots, and buyers
                can see the system getting sharper over time.
              </p>
            </div>
          </div>
        </div>
        <div className="lg:pt-2">
          <Signup
            cta="Subscribe"
            publicationName="Ship Shit Games build log"
            topic="newsletter"
            successText="You're in. First devlog incoming."
          />
        </div>
      </div>
    </PageSection>
  );
}
