import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Mail, Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/site/eyebrow";
import { Backdrop, EmberParticles } from "@/components/site/atmosphere";
import { Signup } from "@/components/site/signup";
import {
  formatUsd,
  SKILLS_PRO,
  SKILLS_PRO_EARLY_PRICE_USD,
} from "@/lib/skills-pro";

export const metadata: Metadata = {
  title: "Ship Shit Games",
  description:
    "Ship Shit Games builds the DEADROT universe live with AI — a whole IP, many browser games, one bloody canon, and the studio tools behind it.",
};

const WATCH = "/youtube";
const PLAY = "https://deadrot.com";

const accent = (hex: string): CSSProperties =>
  ({ "--page-accent": hex } as CSSProperties);
const HELLFIRE = "#ff6a00";
const BLOOD = "#c1121f";
const RUST = "#a35a33";

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

const STUDIO_SIGNALS = [
  {
    value: "7",
    label: "Game tracks",
    body: "Public DEADROT builds with playable links, source, and readiness gates.",
  },
  {
    value: "16",
    label: "Faction portraits",
    body: "Warden, Pyre, Scourge, and neutral characters in one visual canon.",
  },
  {
    value: "3",
    label: "Tool surfaces",
    body: "Skills Pro, assetgen docs, and open scaffolding workflows.",
  },
  {
    value: "1",
    label: "Live war IP",
    body: "A single universe used to prove every pipeline decision in public.",
  },
] as const;

const PRODUCTS = [
  {
    name: "DEADROT",
    desc: "The browser-game universe we are building live: brutal canon, playable builds, source links, and finished-product gates.",
    href: "/games",
    cta: "See the games",
  },
  {
    name: "Skills Pro",
    desc: "The agent skills, prompts, checklists, and game-shipping workflows behind the studio.",
    href: "/pricing",
    cta: "Buy the pack",
  },
  {
    name: "Asset pipeline",
    desc: "The generated game-art workflow, catalog rules, and assetgen tooling we dogfood on DEADROT.",
    href: "/assets",
    cta: "See the assets",
  },
  {
    name: "Build log",
    desc: "The public record of what worked, what broke, and how the system changed after real shipping pressure.",
    href: WATCH,
    cta: "Watch the build",
  },
] as const;

const TOOL_ACCESS = [
  {
    name: "@shipshitdev/v0",
    desc: "The scaffolder we ship every product with — Bun + Turbo monorepo, Next 16, Tailwind, shadcn, agent files. One command, a working repo.",
    href: "https://github.com/shipshitdev/v0",
    cta: "npx @shipshitdev/v0",
  },
  {
    name: "Agent skills",
    desc: "The skill library that drives the studio — scaffolding, deploys, reviews, lore craft. The same ones we use daily.",
    href: "https://github.com/shipshitgames/skills",
    cta: "Browse the skills",
  },
  {
    name: "Game boilerplates",
    desc: "Vite + React + Three.js starters and the shared engine the games are built on. Clone, reskin, ship.",
    href: "https://github.com/shipshitgames",
    cta: "See the repos",
  },
] as const;

const DEADROT_KEY_ART = "/images/games/scourge-survivors.webp";

function SectionIllustration({
  src,
  objectPosition = "center",
  opacity = 0.22,
}: {
  src: string;
  objectPosition?: string;
  opacity?: number;
}) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <Image
        src={src}
        alt=""
        fill
        sizes="100vw"
        className="object-cover contrast-110 saturate-125 [image-rendering:pixelated]"
        style={{ objectPosition, opacity }}
      />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(6,6,5,0.98),rgba(6,6,5,0.82)_46%,rgba(6,6,5,0.96))]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_42%,transparent,rgba(6,6,5,0.82)_64%)]" />
    </div>
  );
}

export default function Home() {
  return (
    <main>
      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section
        style={accent(HELLFIRE)}
        className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 pb-16 pt-24 text-center"
      >
        <SectionIllustration src="/images/hero.webp" opacity={0.28} />
        <Backdrop />
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
      </section>

      {/* -- PUBLIC PROOF --------------------------------------------------- */}
      <section
        style={accent(RUST)}
        className="relative overflow-hidden border-t border-gunmetal/40 bg-void px-6 py-10"
      >
        <div className="mx-auto grid max-w-7xl gap-px overflow-hidden rounded-md border border-gunmetal bg-gunmetal md:grid-cols-4">
          {STUDIO_SIGNALS.map((signal) => (
            <div key={signal.label} className="bg-coal px-5 py-6">
              <div className="flex items-end gap-3">
                <span className="font-display text-5xl font-bold leading-none text-bone">
                  {signal.value}
                </span>
                <span className="pb-1 font-display text-xs font-bold uppercase tracking-widest text-hellfire">
                  {signal.label}
                </span>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-ash">{signal.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── STUDIO REALITY ───────────────────────────────────────────────── */}
      <section
        id="studio"
        style={accent(BLOOD)}
        className="relative scroll-mt-16 overflow-hidden border-t border-gunmetal/40 px-6 py-24"
      >
        <SectionIllustration src="/images/games/deadlane.webp" objectPosition="center 42%" />
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
      </section>

      {/* ── BUILD LOOP ───────────────────────────────────────────────────── */}
      <section
        id="loop"
        style={accent(HELLFIRE)}
        className="relative scroll-mt-16 overflow-hidden border-t border-gunmetal/40 px-6 py-24"
      >
        <SectionIllustration src="/images/games/pactfall.webp" objectPosition="center 48%" opacity={0.2} />
        <Backdrop />
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
      </section>

      {/* ── DEADROT ─────────────────────────────────────────────────────── */}
      <section
        id="deadrot"
        style={accent(BLOOD)}
        className="relative scroll-mt-16 overflow-hidden border-t border-gunmetal/40 px-6 py-24"
      >
        <Backdrop />
        <div className="relative z-10 mx-auto grid max-w-7xl gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center">
          <div>
            <Eyebrow>DEADROT</Eyebrow>
            <h2 className="mt-3 max-w-3xl font-display text-4xl font-bold uppercase leading-tight tracking-tight text-bone sm:text-5xl">
              War IP. Live build.
            </h2>
            <p className="mt-5 max-w-2xl leading-relaxed text-ash">
              DEADROT is the browser-game IP we are building in public: war fronts,
              invasion pressure, hard factions, and the Scourge as parasitic
              host-takeover organisms, not generic monsters.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
            <Button asChild size="xl" className="font-display uppercase tracking-widest shadow-ember">
                <a href={PLAY}>
                  <Play aria-hidden="true" />
                  Play Deadrot
                </a>
              </Button>
              <Button
                asChild
                size="xl"
                variant="outline"
                className="border-gunmetal font-display uppercase tracking-widest text-bone hover:border-hellfire hover:text-hellfire"
              >
                <Link href="/assets">See the war assets</Link>
              </Button>
            </div>
          </div>

          <div className="relative aspect-[1600/759] w-full overflow-hidden border border-gunmetal/70 bg-coal shadow-[0_28px_70px_rgba(0,0,0,0.72)]">
            <Image
              src={DEADROT_KEY_ART}
              alt="Landscape pixel art Deadrot key art"
              fill
              sizes="(min-width: 1024px) 700px, 100vw"
              className="object-cover [image-rendering:pixelated]"
            />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(6,6,5,0.12),transparent_42%,rgba(6,6,5,0.28))]" />
          </div>
        </div>
      </section>

      {/* ── STUDIO OUTPUT ───────────────────────────────────────────────── */}
      <section
        id="output"
        style={accent(RUST)}
        className="relative scroll-mt-16 overflow-hidden border-t border-gunmetal/40 px-6 py-24"
      >
        <SectionIllustration src="/images/games/starblight.webp" objectPosition="center 45%" opacity={0.2} />
        <div className="relative z-10 mx-auto max-w-7xl">
          <Eyebrow>Studio output</Eyebrow>
          <h2 className="mt-3 max-w-4xl font-display text-4xl font-bold uppercase tracking-tight text-bone sm:text-5xl">
            Games. Tools. Receipts.
          </h2>
          <p className="mt-5 max-w-2xl leading-relaxed text-ash">
            This is not a content funnel pretending to be a studio. Each product
            is tied to what we are actually building, using, and publishing.
          </p>
          <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-2">
            {PRODUCTS.map((product) => (
              <a
                key={product.name}
                href={product.href}
                target={product.href.startsWith("http") ? "_blank" : undefined}
                rel={product.href.startsWith("http") ? "noreferrer" : undefined}
                className="group flex flex-col rounded-md border border-gunmetal bg-coal p-7 transition-all duration-300 hover:border-hellfire hover:shadow-[0_0_40px_-16px_var(--page-accent)]"
              >
                <h3 className="font-display text-xl font-bold uppercase tracking-tight text-bone">
                  {product.name}
                </h3>
                <p className="mt-3 flex-1 text-sm leading-relaxed text-ash">
                  {product.desc}
                </p>
                <span className="mt-5 font-display text-xs font-bold uppercase tracking-widest text-hellfire transition-colors group-hover:text-blood">
                  {product.cta} →
                </span>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* ── BUY / TOOL ACCESS ────────────────────────────────────────────── */}
      <section
        id="skills"
        style={accent(BLOOD)}
        className="relative scroll-mt-16 overflow-hidden border-t border-gunmetal/40 px-6 py-24"
      >
        <Backdrop />
        <SectionIllustration src="/images/games/redline.webp" objectPosition="center 46%" opacity={0.18} />
        <div className="relative z-10 mx-auto grid max-w-7xl gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start">
          <div>
            <Eyebrow>Skills Pro</Eyebrow>
            <h2 className="mt-3 max-w-3xl font-display text-4xl font-bold uppercase leading-tight tracking-tight text-bone sm:text-5xl">
              Skills Pro. Tools included.
            </h2>
            <p className="mt-5 max-w-2xl leading-relaxed text-ash">
              Skills Pro is the paid operating manual: production prompts,
              agent workflows, review loops, and updates from the live build.
              Early buyers get the default {formatUsd(SKILLS_PRO.earlyBuyerDiscountUsd)} coupon,
              bringing access to{" "}
              <span className="font-bold text-bone">{formatUsd(SKILLS_PRO_EARLY_PRICE_USD)}</span>.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Button asChild size="xl" className="font-display uppercase tracking-widest shadow-ember">
                <Link href="/pricing">Buy Skills Pro</Link>
              </Button>
              <Button
                asChild
                size="xl"
                variant="outline"
                className="border-gunmetal font-display uppercase tracking-widest text-bone hover:border-hellfire hover:text-hellfire"
              >
                <a href="https://docs.shipshit.games">Read the docs</a>
              </Button>
            </div>
          </div>

          <div className="grid gap-4">
            {TOOL_ACCESS.map((tool) => (
              <a
                key={tool.name}
                href={tool.href}
                target="_blank"
                rel="noreferrer"
                className="group flex items-start justify-between gap-5 rounded-md border border-gunmetal bg-coal/90 p-5 transition-colors hover:border-hellfire"
              >
                <span>
                  <span className="block font-display text-lg font-bold uppercase tracking-tight text-bone">
                    {tool.name}
                  </span>
                  <span className="mt-2 block text-sm leading-relaxed text-ash">
                    {tool.desc}
                  </span>
                </span>
                <span className="shrink-0 pt-1 font-display text-xs font-bold uppercase tracking-widest text-hellfire group-hover:text-blood">
                  {tool.cta} →
                </span>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* ── NEWSLETTER ───────────────────────────────────────────────────── */}
      <section
        id="newsletter"
        style={accent(HELLFIRE)}
        className="relative scroll-mt-16 overflow-hidden border-t border-gunmetal/40 px-6 py-24"
      >
        <SectionIllustration src="/images/games/rothulk.webp" objectPosition="center 42%" opacity={0.2} />
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
      </section>
    </main>
  );
}
