import type { CSSProperties } from "react";

import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/site/eyebrow";
import { Backdrop } from "@/components/site/atmosphere";
import { Signup } from "@/components/site/signup";
import {
  formatUsd,
  SKILLS_PRO,
  SKILLS_PRO_EARLY_PRICE_USD,
} from "@/lib/skills-pro";

const WATCH = "/youtube";
const PLAY = "https://deadrot.com";

const accent = (hex: string): CSSProperties =>
  ({ "--page-accent": hex } as CSSProperties);
const HELLFIRE = "#ff6a00";
const BLOOD = "#c1121f";
const TOXIC = "#8bdc1f";
const RUST = "#a35a33";

const TEMPLATES = [
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
];

export default function Home() {
  return (
    <main>
      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section
        style={accent(HELLFIRE)}
        className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 text-center"
      >
        <Backdrop />
        <div className="relative z-10 flex flex-col items-center">
          <Eyebrow>Building games with AI, in public</Eyebrow>
          <h1 className="text-glow mt-5 max-w-4xl font-display text-5xl font-bold uppercase leading-[0.9] tracking-tight text-bone sm:text-7xl md:text-8xl">
            We ship games in public.
            <br className="hidden sm:block" />{" "}
            <span className="text-blood">Steal the playbook.</span>
          </h1>
          <p className="mt-7 max-w-2xl text-lg leading-relaxed text-ash">
            Ship Shit Games builds the{" "}
            <a href={PLAY} className="text-bone underline decoration-gunmetal underline-offset-2 hover:decoration-blood">DEADROT</a>{" "}
            universe live with AI — a whole IP, many browser games, one bloody canon. Here&apos;s
            everything we learned doing it: the newsletter, Skills Pro, the templates, and the
            tools we built to move this fast.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="xl" className="font-display uppercase tracking-widest shadow-ember">
              <a href="/pricing">Buy Skills Pro</a>
            </Button>
            <Button
              asChild
              size="xl"
              variant="outline"
              className="border-gunmetal font-display uppercase tracking-widest text-bone hover:border-hellfire hover:text-hellfire"
            >
              <a href={WATCH}>Watch Opus 4.8</a>
            </Button>
            <Button
              asChild
              size="xl"
              variant="outline"
              className="border-gunmetal font-display uppercase tracking-widest text-bone hover:border-hellfire hover:text-hellfire"
            >
              <a href="/assets">See the assets</a>
            </Button>
          </div>
        </div>
        <a
          href="#newsletter"
          className="animate-bob absolute bottom-8 z-10 text-xs font-bold uppercase tracking-[0.3em] text-ash transition-colors hover:text-bone"
        >
          ▼ scroll
        </a>
      </section>

      {/* ── NEWSLETTER ───────────────────────────────────────────────────── */}
      <section
        id="newsletter"
        style={accent(HELLFIRE)}
        className="relative scroll-mt-16 border-t border-gunmetal/40 px-6 py-24"
      >
        <div className="mx-auto max-w-7xl">
          <Eyebrow>Build in public</Eyebrow>
          <h2 className="mt-3 max-w-3xl font-display text-4xl font-bold uppercase tracking-tight text-bone sm:text-5xl">
            The devlog newsletter
          </h2>
          <p className="mt-4 max-w-2xl leading-relaxed text-ash">
            Every shipped game, every dead end, every prompt that actually worked — written up the
            week it happened. No theory. The real log of building an IP with AI, paired with the{" "}
            <a href={WATCH} className="text-hellfire hover:text-blood">shipshitshow</a>.
          </p>
          <div className="mt-9">
            <Signup cta="Subscribe" topic="newsletter" successText="You're in. First devlog incoming." />
          </div>
        </div>
      </section>

      {/* ── COURSE ───────────────────────────────────────────────────────── */}
      <section
        id="course"
        style={accent(BLOOD)}
        className="relative scroll-mt-16 overflow-hidden border-t border-gunmetal/40 px-6 py-24"
      >
        <Backdrop />
        <div className="relative z-10 mx-auto max-w-7xl">
          <Eyebrow>Skills Pro</Eyebrow>
          <h2 className="mt-3 max-w-3xl font-display text-4xl font-bold uppercase leading-tight tracking-tight text-bone sm:text-5xl">
            One payment. The game-building skills pack.
          </h2>
          <p className="mt-5 max-w-2xl leading-relaxed text-ash">
            The end-to-end system we use to take a game from idea to shipped: scaffolding,
            agent workflows, art and asset generation, the engine, and the deploy. Early buyers get
            the default {formatUsd(SKILLS_PRO.earlyBuyerDiscountUsd)} Stripe coupon, bringing Skills Pro to{" "}
            <span className="font-bold text-bone">{formatUsd(SKILLS_PRO_EARLY_PRICE_USD)}</span>.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Button asChild size="xl" className="font-display uppercase tracking-widest shadow-ember">
              <a href="/pricing">See pricing</a>
            </Button>
            <Button
              asChild
              size="xl"
              variant="outline"
              className="border-gunmetal font-display uppercase tracking-widest text-bone hover:border-hellfire hover:text-hellfire"
            >
              <a href="/youtube">Watch the build</a>
            </Button>
          </div>
        </div>
      </section>

      {/* ── TEMPLATES / TOOLING ──────────────────────────────────────────── */}
      <section
        id="templates"
        style={accent(TOXIC)}
        className="relative scroll-mt-16 border-t border-gunmetal/40 px-6 py-24"
      >
        <div className="mx-auto max-w-7xl">
          <Eyebrow>Steal our tools</Eyebrow>
          <h2 className="mt-3 font-display text-4xl font-bold uppercase tracking-tight text-bone sm:text-5xl">
            Templates &amp; tooling
          </h2>
          <p className="mt-3 max-w-2xl text-ash">
            The actual stack behind the studio. Open where it can be, battle-tested on real
            shipped games.
          </p>
          <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-3">
            {TEMPLATES.map((t) => (
              <a
                key={t.name}
                href={t.href}
                target="_blank"
                rel="noreferrer"
                className="group flex flex-col rounded-md border border-gunmetal bg-coal p-7 transition-all duration-300 hover:border-hellfire hover:shadow-[0_0_40px_-16px_var(--page-accent)]"
              >
                <h3 className="font-display text-xl font-bold uppercase tracking-tight text-bone">
                  {t.name}
                </h3>
                <p className="mt-3 flex-1 text-sm leading-relaxed text-ash">{t.desc}</p>
                <span className="mt-5 font-display text-xs font-bold uppercase tracking-widest text-hellfire transition-colors group-hover:text-blood">
                  {t.cta} →
                </span>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* ── SPONSOR / CONSULTING ─────────────────────────────────────────── */}
      <section
        id="sponsor"
        style={accent(RUST)}
        className="relative scroll-mt-16 overflow-hidden border-t border-gunmetal/40 px-6 py-24"
      >
        <Backdrop />
        <div className="relative z-10 mx-auto flex max-w-7xl flex-col items-start">
          <Eyebrow>Work with us</Eyebrow>
          <h2 className="mt-3 max-w-3xl font-display text-4xl font-bold uppercase leading-tight tracking-tight text-bone sm:text-5xl">
            Sponsor the show · hire the studio
          </h2>
          <p className="mt-5 max-w-2xl leading-relaxed text-ash">
            Put your tool in front of builders who actually ship, or bring us in to stand up an
            AI-native game or product pipeline. Tell us what you&apos;re after and we&apos;ll send
            the deck.
          </p>
          <div className="mt-9">
            <Button asChild size="xl" className="font-display uppercase tracking-widest shadow-ember">
              <a href="mailto:vincent@genfeed.ai?subject=Sponsorship%20%2F%20consulting%20%E2%80%94%20Ship%20Shit%20Games">
                Get in touch
              </a>
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}
