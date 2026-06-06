import type { CSSProperties } from "react";

import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/site/eyebrow";
import { Backdrop, EmberParticles } from "@/components/site/atmosphere";
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
const RUST = "#a35a33";

const PROBLEMS = [
  {
    title: "Ideas are cheap",
    body: "AI can hand you a hundred concepts before lunch. The hard part is choosing the one you can actually ship.",
  },
  {
    title: "Assets rot fast",
    body: "Prompts, renders, lore, UI, and code drift apart unless the pipeline has rules and a real source of truth.",
  },
  {
    title: "Agents need taste",
    body: "Automation without review just makes louder slop. You need loops for scope, build, QA, and polish.",
  },
] as const;

const SOLUTION_STEPS = [
  {
    title: "Scope the slice",
    body: "Start with one playable promise, one aesthetic lane, and one measurable shipping target.",
  },
  {
    title: "Generate with canon",
    body: "Keep assets, lore, prompts, and implementation tied to studio rules instead of one-off experiments.",
  },
  {
    title: "Ship the loop",
    body: "Use agents for scaffolding, code, review, deployment, and session capture until the build is public.",
  },
] as const;

const PRODUCTS = [
  {
    name: "DEADROT",
    desc: "The browser-game universe we are building live: brutal canon, shipped experiments, and playable public proof.",
    href: PLAY,
    cta: "Play Deadrot",
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

export default function Home() {
  return (
    <main>
      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section
        style={accent(HELLFIRE)}
        className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 pb-16 pt-24 text-center"
      >
        <Backdrop />
        <EmberParticles />
        <div className="relative z-10 flex flex-col items-center">
          <Eyebrow>Building games with AI, in public</Eyebrow>
          <h1 className="sr-only">Ship Shit Games</h1>
          <img
            src="/brand/shipshit-games-wordmark.png"
            alt=""
            aria-hidden="true"
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
              <a href="/pricing">Buy Skills Pro</a>
            </Button>
            <Button
              asChild
              size="xl"
              variant="outline"
              className="border-gunmetal font-display uppercase tracking-widest text-bone hover:border-hellfire hover:text-hellfire"
            >
              <a href={PLAY}>Play Deadrot</a>
            </Button>
          </div>
        </div>
        <a
          href="#problem"
          className="animate-bob absolute bottom-8 z-10 text-xs font-bold uppercase tracking-[0.3em] text-ash transition-colors hover:text-bone"
        >
          ▼ scroll
        </a>
      </section>

      {/* ── PROBLEM ──────────────────────────────────────────────────────── */}
      <section
        id="problem"
        style={accent(BLOOD)}
        className="relative scroll-mt-16 border-t border-gunmetal/40 px-6 py-24"
      >
        <div className="mx-auto max-w-7xl">
          <Eyebrow>The problem</Eyebrow>
          <h2 className="mt-3 max-w-4xl font-display text-4xl font-bold uppercase leading-tight text-bone sm:text-5xl">
            AI makes the mess faster. Shipping still takes a system.
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

      {/* ── SOLUTION ─────────────────────────────────────────────────────── */}
      <section
        id="solution"
        style={accent(HELLFIRE)}
        className="relative scroll-mt-16 overflow-hidden border-t border-gunmetal/40 px-6 py-24"
      >
        <Backdrop />
        <div className="relative z-10 mx-auto max-w-7xl">
          <Eyebrow>The solution</Eyebrow>
          <h2 className="mt-3 max-w-4xl font-display text-4xl font-bold uppercase leading-tight tracking-tight text-bone sm:text-5xl">
            Treat AI like a studio pipeline, not a magic button.
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
              The war universe where the system proves itself.
            </h2>
            <p className="mt-5 max-w-2xl leading-relaxed text-ash">
              DEADROT is the browser-game IP we are building in public: war fronts,
              invasion pressure, hard factions, and the Scourge as parasitic
              host-takeover organisms, not generic monsters.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Button asChild size="xl" className="font-display uppercase tracking-widest shadow-ember">
                <a href={PLAY}>Play Deadrot</a>
              </Button>
              <Button
                asChild
                size="xl"
                variant="outline"
                className="border-gunmetal font-display uppercase tracking-widest text-bone hover:border-hellfire hover:text-hellfire"
              >
                <a href="/assets">See the war assets</a>
              </Button>
            </div>
          </div>

          <div className="relative min-h-[22rem] overflow-hidden border-y border-gunmetal/70 bg-void/35">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_85%,rgba(193,18,31,0.24),transparent_32%),radial-gradient(circle_at_78%_55%,rgba(255,106,0,0.18),transparent_28%),linear-gradient(115deg,rgba(14,12,10,0.35),rgba(6,6,5,0.94)_62%)]" />
            <EmberParticles intensity="firefront" />
            <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-blood/30 via-hellfire/10 to-transparent" />
            <div className="absolute inset-x-10 bottom-12 h-px bg-hellfire/45 shadow-[0_0_34px_rgba(255,106,0,0.65)]" />
            <div className="absolute bottom-10 left-[18%] h-16 w-px -rotate-12 bg-gradient-to-t from-hellfire/70 to-transparent shadow-[0_0_22px_rgba(255,106,0,0.72)]" />
            <div className="absolute bottom-8 right-[24%] h-20 w-px rotate-[18deg] bg-gradient-to-t from-blood/70 to-transparent shadow-[0_0_26px_rgba(193,18,31,0.7)]" />
          </div>
        </div>
      </section>

      {/* ── PRODUCTS ─────────────────────────────────────────────────────── */}
      <section
        id="products"
        style={accent(RUST)}
        className="relative scroll-mt-16 border-t border-gunmetal/40 px-6 py-24"
      >
        <div className="mx-auto max-w-7xl">
          <Eyebrow>Products</Eyebrow>
          <h2 className="mt-3 max-w-4xl font-display text-4xl font-bold uppercase tracking-tight text-bone sm:text-5xl">
            The game, the skills, the tools, and the receipts.
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
        <div className="relative z-10 mx-auto grid max-w-7xl gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start">
          <div>
            <Eyebrow>Buy skills + tool access</Eyebrow>
            <h2 className="mt-3 max-w-3xl font-display text-4xl font-bold uppercase leading-tight tracking-tight text-bone sm:text-5xl">
              One payment for the pro workflow. Open tools beside it.
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
                <a href="/pricing">Buy Skills Pro</a>
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
        className="relative scroll-mt-16 border-t border-gunmetal/40 px-6 py-24"
      >
        <div className="mx-auto max-w-7xl">
          <Eyebrow>Last call</Eyebrow>
          <h2 className="mt-3 max-w-3xl font-display text-4xl font-bold uppercase tracking-tight text-bone sm:text-5xl">
            The devlog newsletter
          </h2>
          <p className="mt-4 max-w-2xl leading-relaxed text-ash">
            Not ready to buy? Get the weekly build log: shipped games, broken
            loops, useful prompts, and what changed in the studio system.
          </p>
          <div className="mt-9">
            <Signup cta="Subscribe" topic="newsletter" successText="You're in. First devlog incoming." />
          </div>
        </div>
      </section>
    </main>
  );
}
