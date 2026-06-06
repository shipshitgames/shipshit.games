import type { Metadata } from "next";
import { ArrowRight, CheckCircle2, Gamepad2, ShieldCheck, Workflow, Zap } from "lucide-react";

import { Backdrop } from "@/components/site/atmosphere";
import { Eyebrow } from "@/components/site/eyebrow";
import { Button } from "@/components/ui/button";
import {
  formatUsd,
  SKILLS_PRO,
  SKILLS_PRO_EARLY_PRICE_USD,
  SKILLS_PRO_FEATURES,
} from "@/lib/skills-pro";

export const metadata: Metadata = {
  title: "Skills Pro Pricing",
  description:
    "One-time access to Ship Shit Games Skills Pro: the agent skills and workflows we use to build games with AI.",
  openGraph: {
    title: "Skills Pro Pricing",
    description:
      "Get the agent skills and game-building workflows Ship Shit Games uses in public.",
    url: "https://shipshit.games/pricing",
    images: [
      {
        url: "/images/og/skills-pro.jpg",
        width: 1200,
        height: 630,
        alt: "Ship Shit Games Skills Pro",
        type: "image/jpeg",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Skills Pro Pricing",
    description:
      "Get the agent skills and game-building workflows Ship Shit Games uses in public.",
    images: ["/images/og/skills-pro.jpg"],
  },
};

type PricingPageProps = {
  searchParams?: Promise<{
    checkout_error?: string;
  }>;
};

const MODULES = [
  {
    icon: Gamepad2,
    title: "Game build loop",
    body: "Turn a one-line idea into a scoped slice, scaffold, playtest target, and ship plan.",
  },
  {
    icon: Workflow,
    title: "Agent workflow",
    body: "Use skills for planning, implementation, review, QA, deployment, and postmortem capture.",
  },
  {
    icon: ShieldCheck,
    title: "Studio standards",
    body: "Prompts, checklists, and guardrails from real browser-game production runs.",
  },
] as const;

export default async function PricingPage({ searchParams }: PricingPageProps) {
  const params = await searchParams;
  const checkoutError = params?.checkout_error;

  return (
    <main>
      <section className="relative min-h-screen overflow-hidden border-b border-gunmetal/40 px-6 pb-20 pt-32">
        <Backdrop />
        <div className="relative z-10 mx-auto grid max-w-7xl gap-12 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-center">
          <div>
            <Eyebrow>Skills Pro</Eyebrow>
            <h1 className="text-glow mt-5 max-w-4xl font-display text-5xl font-bold uppercase leading-[0.9] tracking-tight text-bone sm:text-7xl">
              Build games with the skills we use.
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-relaxed text-ash">
              One-time access to the Ship Shit Games pro skill pack: the agent
              workflows, production prompts, review loops, and game-shipping
              process we use on live builds.
            </p>

            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              {MODULES.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.title}
                    className="rounded-md border border-gunmetal bg-coal/80 p-5"
                  >
                    <Icon className="size-5 text-hellfire" aria-hidden="true" />
                    <h2 className="mt-4 font-display text-base font-bold uppercase tracking-tight text-bone">
                      {item.title}
                    </h2>
                    <p className="mt-2 text-sm leading-relaxed text-ash">
                      {item.body}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          <aside className="rounded-md border border-hellfire/50 bg-coal/95 p-7 shadow-ember">
            <div className="flex items-center justify-between gap-4 border-b border-gunmetal pb-5">
              <div>
                <p className="font-display text-sm font-bold uppercase tracking-widest text-hellfire">
                  Early buyer default
                </p>
                <h2 className="mt-2 font-display text-3xl font-bold uppercase tracking-tight text-bone">
                  {SKILLS_PRO.name}
                </h2>
              </div>
              <Zap className="size-8 text-hellfire" aria-hidden="true" />
            </div>

            <div className="mt-7">
              <div className="flex items-end gap-3">
                <span className="font-display text-6xl font-bold uppercase leading-none text-bone">
                  {formatUsd(SKILLS_PRO_EARLY_PRICE_USD)}
                </span>
                <span className="pb-2 text-sm uppercase tracking-widest text-ash">
                  one time
                </span>
              </div>
              <p className="mt-2 text-sm text-ash">
                List price {formatUsd(SKILLS_PRO.listPriceUsd)}. The{" "}
                {formatUsd(SKILLS_PRO.earlyBuyerDiscountUsd)} early-buyer coupon
                is applied automatically in Stripe Checkout.
              </p>
            </div>

            <ul className="mt-7 space-y-3">
              {SKILLS_PRO_FEATURES.map((feature) => (
                <li key={feature} className="flex gap-3 text-sm leading-relaxed text-ash">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-hellfire" aria-hidden="true" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>

            {checkoutError ? (
              <p className="mt-6 rounded-md border border-blood bg-blood/10 p-3 text-sm text-bone">
                Checkout is not available yet because Stripe server config is
                missing or unavailable.
              </p>
            ) : null}

            <form action="/api/checkout" method="post" className="mt-7">
              <Button
                type="submit"
                size="xl"
                className="w-full font-display uppercase tracking-widest shadow-ember"
              >
                Buy Skills Pro
                <ArrowRight aria-hidden="true" />
              </Button>
            </form>

            <p className="mt-4 text-xs uppercase tracking-widest text-gunmetal">
              Secure checkout by Stripe. Access fulfillment follows the purchase email.
            </p>
          </aside>
        </div>
      </section>
    </main>
  );
}
