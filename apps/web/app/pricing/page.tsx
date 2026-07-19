import type { Metadata } from "next";
import { ArrowRight, CheckCircle2, Gamepad2, Users, Workflow, Zap } from "lucide-react";

import {
  formatUsd,
  SKILLS_PRO_ONETIME,
  SKILLS_PRO_ONETIME_FEATURES,
  STUDIO_PASS,
  STUDIO_PASS_FEATURES,
} from "@shipshitgames/shared";

import { Backdrop } from "@/components/site/atmosphere";
import { Eyebrow } from "@/components/site/eyebrow";

import { CheckoutButton } from "./checkout-button";

export const metadata: Metadata = {
  title: "Studio Pass & Skills Pro Pricing",
  description:
    "The Studio Pass subscription bundles SaaS access, the Skool community, and every DEADROT game. Or buy Skills Pro once — the gaming agent skills, kept forever.",
  openGraph: {
    title: "Studio Pass & Skills Pro Pricing",
    description:
      "Subscribe to the whole studio, or buy the gaming Skills Pro once. Ship Shit Games pricing.",
    url: "https://shipshit.games/pricing",
    images: [
      {
        url: "/images/og/skills-pro.jpg",
        width: 1200,
        height: 630,
        alt: "Ship Shit Games pricing",
        type: "image/jpeg",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Studio Pass & Skills Pro Pricing",
    description:
      "Subscribe to the whole studio, or buy the gaming Skills Pro once. Ship Shit Games pricing.",
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
    title: "Games + community",
    body: "Every DEADROT game is unlocked with the Studio Pass, and Skool community access is included when it opens.",
  },
] as const;

export default async function PricingPage({ searchParams }: PricingPageProps) {
  const params = await searchParams;
  const checkoutError = params?.checkout_error;

  return (
    <main>
      <section className="relative min-h-screen overflow-hidden border-b border-gunmetal/40 px-6 pb-20 pt-32">
        <Backdrop />
        <div className="relative z-10 mx-auto grid max-w-7xl gap-12 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start">
          <div>
            <Eyebrow>Pricing</Eyebrow>
            <h1 className="text-glow mt-5 max-w-4xl font-display text-5xl font-bold uppercase leading-[0.9] tracking-tight text-bone sm:text-7xl">
              Build games with the skills we use.
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-relaxed text-ash">
              Two ways in. The <strong className="text-bone">Studio Pass</strong>{" "}
              subscription bundles the whole studio — Skills Pro, hosted SaaS
              access, the Skool community when it opens, and every DEADROT game
              unlocked on deadrot.com. Or buy{" "}
              <strong className="text-bone">Skills Pro</strong> once and keep the
              gaming agent skills forever.
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

          <div className="flex flex-col gap-6">
            {/* Studio Pass — monthly subscription (the whole bundle) */}
            <aside className="rounded-md border border-hellfire/50 bg-coal/95 p-7 shadow-ember">
              <div className="flex items-center justify-between gap-4 border-b border-gunmetal pb-5">
                <div>
                  <p className="font-display text-sm font-bold uppercase tracking-widest text-hellfire">
                    Subscription · everything
                  </p>
                  <h2 className="mt-2 font-display text-3xl font-bold uppercase tracking-tight text-bone">
                    {STUDIO_PASS.name}
                  </h2>
                </div>
                <Zap className="size-8 text-hellfire" aria-hidden="true" />
              </div>

              <div className="mt-7">
                <div
                  className="flex flex-wrap items-end gap-x-4 gap-y-2"
                  aria-label={`${formatUsd(STUDIO_PASS.listPriceUsd)} list price, ${formatUsd(
                    STUDIO_PASS.founderPriceUsd
                  )} founder price`}
                >
                  <span
                    className="pb-1 font-display text-3xl font-bold uppercase leading-none text-ash line-through decoration-2 decoration-hellfire"
                    aria-hidden="true"
                  >
                    {formatUsd(STUDIO_PASS.listPriceUsd)}
                  </span>
                  <span
                    className="font-display text-6xl font-bold uppercase leading-none text-bone"
                    aria-hidden="true"
                  >
                    {formatUsd(STUDIO_PASS.founderPriceUsd)}
                  </span>
                  <span className="pb-2 text-sm uppercase tracking-widest text-ash">
                    per month
                  </span>
                </div>
                <p className="mt-2 text-sm text-ash">
                  Launch list price is {formatUsd(STUDIO_PASS.listPriceUsd)}/mo.
                  Founder seats get {formatUsd(STUDIO_PASS.founderDiscountUsd)}
                  /mo off automatically in Stripe Checkout.
                </p>
              </div>

              <ul className="mt-7 space-y-3">
                {STUDIO_PASS_FEATURES.map((feature) => (
                  <li key={feature} className="flex gap-3 text-sm leading-relaxed text-ash">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-hellfire" aria-hidden="true" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <form action="/api/checkout" method="post" className="mt-7">
                <CheckoutButton
                  plan="studio_pass"
                  size="xl"
                  className="w-full font-display uppercase tracking-widest shadow-ember"
                >
                  Get the {formatUsd(STUDIO_PASS.founderPriceUsd)}/mo Studio Pass
                  <ArrowRight aria-hidden="true" />
                </CheckoutButton>
              </form>

              <p className="mt-4 text-xs uppercase tracking-widest text-gunmetal">
                Secure monthly subscription checkout by Stripe. Access is managed in app.shipshit.games.
                Cancel from the billing portal; access follows the active subscription period.
              </p>
            </aside>

            {/* Skills Pro — one-time purchase (gaming skills only) */}
            <aside className="rounded-md border border-gunmetal bg-coal/80 p-7">
              <div className="flex items-center justify-between gap-4 border-b border-gunmetal pb-5">
                <div>
                  <p className="font-display text-sm font-bold uppercase tracking-widest text-ash">
                    One-time · first 1,000 buyers
                  </p>
                  <h2 className="mt-2 font-display text-3xl font-bold uppercase tracking-tight text-bone">
                    {SKILLS_PRO_ONETIME.name}
                  </h2>
                </div>
                <Workflow className="size-8 text-ash" aria-hidden="true" />
              </div>

              <div className="mt-7">
                <div
                  className="flex flex-wrap items-end gap-x-4 gap-y-2"
                  aria-label={`${formatUsd(SKILLS_PRO_ONETIME.listPriceUsd)} list price, ${formatUsd(
                    SKILLS_PRO_ONETIME.launchPriceUsd
                  )} launch price`}
                >
                  <span
                    className="pb-1 font-display text-3xl font-bold uppercase leading-none text-ash line-through decoration-2 decoration-ash"
                    aria-hidden="true"
                  >
                    {formatUsd(SKILLS_PRO_ONETIME.listPriceUsd)}
                  </span>
                  <span
                    className="font-display text-6xl font-bold uppercase leading-none text-bone"
                    aria-hidden="true"
                  >
                    {formatUsd(SKILLS_PRO_ONETIME.launchPriceUsd)}
                  </span>
                  <span className="pb-2 text-sm uppercase tracking-widest text-ash">
                    one-time
                  </span>
                </div>
                <p className="mt-2 text-sm text-ash">
                  {formatUsd(SKILLS_PRO_ONETIME.launchPriceUsd)} for the first{" "}
                  {SKILLS_PRO_ONETIME.launchMaxRedemptions.toLocaleString()} buyers
                  ({formatUsd(SKILLS_PRO_ONETIME.launchDiscountUsd)} off, applied
                  automatically), then {formatUsd(SKILLS_PRO_ONETIME.listPriceUsd)}.
                </p>
              </div>

              <ul className="mt-7 space-y-3">
                {SKILLS_PRO_ONETIME_FEATURES.map((feature) => (
                  <li key={feature} className="flex gap-3 text-sm leading-relaxed text-ash">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ash" aria-hidden="true" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <form action="/api/checkout/skills-pro" method="post" className="mt-7">
                <CheckoutButton
                  plan="skills_pro_onetime"
                  size="xl"
                  variant="outline"
                  className="w-full font-display uppercase tracking-widest"
                >
                  Buy Skills Pro for {formatUsd(SKILLS_PRO_ONETIME.launchPriceUsd)}
                  <ArrowRight aria-hidden="true" />
                </CheckoutButton>
              </form>

              <p className="mt-4 text-xs uppercase tracking-widest text-gunmetal">
                One-time Stripe checkout. Skills only — no subscription, no SaaS
                generation, no games. Access is managed in app.shipshit.games.
              </p>
            </aside>

            {checkoutError ? (
              <p className="rounded-md border border-blood bg-blood/10 p-3 text-sm text-bone">
                Checkout is not available yet because Stripe server config is
                missing or unavailable.
              </p>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}
