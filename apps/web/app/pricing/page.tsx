import type { Metadata } from "next";
import { ArrowRight, CheckCircle2, Gamepad2, Users, Workflow, Zap } from "lucide-react";

import { Backdrop } from "@/components/site/atmosphere";
import { Eyebrow } from "@/components/site/eyebrow";

import { CheckoutButton } from "./checkout-button";
import {
  formatUsd,
  SKILLS_PRO,
  SKILLS_PRO_EARLY_PRICE_USD,
  SKILLS_PRO_FEATURES,
} from "@/lib/skills-pro";

export const metadata: Metadata = {
  title: "Skills Pro Pricing",
  description:
    "Monthly access to Ship Shit Games Skills Pro: agent skills, member assets, build breakdowns, and studio workflows.",
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
    icon: Users,
    title: "Member drops",
    body: "Get subscriber drops now; private community access is included when the member community opens.",
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
              Monthly access to the Ship Shit Games pro package: Skills Pro,
              member assets, production prompts, review loops, build
              breakdowns, and the game-shipping process we use on live builds.
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
                  Early buyer package
                </p>
                <h2 className="mt-2 font-display text-3xl font-bold uppercase tracking-tight text-bone">
                  {SKILLS_PRO.name}
                </h2>
              </div>
              <Zap className="size-8 text-hellfire" aria-hidden="true" />
            </div>

            <div className="mt-7">
              <div
                className="flex flex-wrap items-end gap-x-4 gap-y-2"
                aria-label={`${formatUsd(SKILLS_PRO.listPriceUsd)} list price, ${formatUsd(
                  SKILLS_PRO_EARLY_PRICE_USD
                )} early buyer price`}
              >
                <span
                  className="pb-1 font-display text-3xl font-bold uppercase leading-none text-ash line-through decoration-2 decoration-hellfire"
                  aria-hidden="true"
                >
                  {formatUsd(SKILLS_PRO.listPriceUsd)}
                </span>
                <span
                  className="font-display text-6xl font-bold uppercase leading-none text-bone"
                  aria-hidden="true"
                >
                  {formatUsd(SKILLS_PRO_EARLY_PRICE_USD)}
                </span>
                <span className="pb-2 text-sm uppercase tracking-widest text-ash">
                  per month
                </span>
              </div>
              <p className="mt-2 text-sm text-ash">
                Launch list price is {formatUsd(SKILLS_PRO.listPriceUsd)}/mo.
                Founder seats get {formatUsd(SKILLS_PRO.earlyBuyerDiscountUsd)}
                /mo off automatically in Stripe Checkout.
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
              <CheckoutButton
                size="xl"
                className="w-full font-display uppercase tracking-widest shadow-ember"
              >
                Get the {formatUsd(SKILLS_PRO_EARLY_PRICE_USD)}/mo pass
                <ArrowRight aria-hidden="true" />
              </CheckoutButton>
            </form>

            <p className="mt-4 text-xs uppercase tracking-widest text-gunmetal">
              Secure monthly subscription checkout by Stripe. Access is managed in app.shipshit.games.
              Cancel from the billing portal; access follows the active subscription period.
            </p>
          </aside>
        </div>
      </section>
    </main>
  );
}
