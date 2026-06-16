import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/site/eyebrow";
import { EmberParticles } from "@/components/site/atmosphere";
import { PageSection } from "@/components/site/page-section";
import { SectionIllustration } from "@/components/site/section-illustration";

const PLAY = "https://deadrot.com";

// Hoisted so the prop is a stable element reference rather than fresh JSX each
// render (react-doctor/jsx-no-jsx-as-prop).
const ILLUSTRATION = (
  <SectionIllustration src="/images/hero.webp" opacity={0.28} />
);

export function Hero() {
  return (
    <PageSection
      accent="hellfire"
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 pb-16 pt-24 text-center"
      illustration={ILLUSTRATION}
      backdrop
    >
      <EmberParticles />
      <div className="relative z-10 flex flex-col items-center">
        <Eyebrow>Building games with AI, in public</Eyebrow>
        <h1 className="sr-only">Ship Shit Games</h1>
        <Image
          src="/brand/shipshit-games-wordmark.png"
          alt=""
          aria-hidden="true"
          width={1200}
          height={382}
          priority
          className="mt-5 h-auto w-full max-w-2xl drop-shadow-[0_0_42px_rgba(193,18,31,0.46)]"
        />
        <p className="mt-8 max-w-2xl text-lg leading-relaxed text-ash">
          Ship Shit Games builds the{" "}
          <a href={PLAY} className="text-bone underline decoration-gunmetal underline-offset-2 hover:decoration-blood">DEADROT</a>{" "}
          universe live with AI — a whole IP, many browser games, one bloody canon. Skills Pro
          and the studio tools are the system we use to move this fast.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="xl" className="font-display uppercase tracking-widest shadow-ember">
            <Link href="/pricing">
              Buy Skills Pro
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
          <Button
            asChild
            size="xl"
            variant="outline"
            className="border-gunmetal font-display uppercase tracking-widest text-bone hover:border-hellfire hover:text-hellfire"
          >
            <a href={PLAY}>
              <Play aria-hidden="true" />
              Play Deadrot
            </a>
          </Button>
        </div>
      </div>
      <a
        href="#studio"
        className="animate-bob absolute bottom-8 z-10 text-xs font-bold uppercase tracking-[0.3em] text-ash transition-colors hover:text-bone"
      >
        ▼ scroll
      </a>
    </PageSection>
  );
}
