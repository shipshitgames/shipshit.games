import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, FileText, ShieldCheck } from "lucide-react";

import { Backdrop } from "@/components/site/atmosphere";
import { Eyebrow } from "@/components/site/eyebrow";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Legal",
  description:
    "Ship Shit Games Studio Pass terms, privacy, refund, and AI-generated asset disclosures.",
};

const UPDATED = "June 8, 2026";

const SECTIONS = [
  {
    id: "studio-pass",
    title: "Studio Pass terms",
    body: [
      "The Studio Pass is a monthly subscription for Skills Pro, member asset drops, build breakdowns, and live studio workflow material.",
      "Access is tied to the account used to claim the subscription in app.shipshit.games. Do not share signed access links, private drops, or member-only files outside your account.",
      "Subscriber deliverables evolve as the studio ships. Some tools, community features, desktop builds, or asset packs may be released in stages rather than being available on day one.",
    ],
  },
  {
    id: "billing",
    title: "Billing, cancellation, and refunds",
    body: [
      "Billing is handled by Stripe. You can manage cards, invoices, and cancellation from the app.shipshit.games billing portal after purchase.",
      "The Studio Pass renews monthly until canceled. Canceled subscriptions keep access until the end of the paid billing period, then gated access is removed.",
      "Refund requests are reviewed case by case. The clean default is: if something is broken on our side or access was not delivered, contact us through the receipt or app portal and we will make it right.",
    ],
  },
  {
    id: "ai-assets",
    title: "AI-generated asset disclosure",
    body: [
      "Ship Shit Games uses AI-assisted workflows for art, sprites, music experiments, code, copy, QA, and production planning. Human review, canon rules, and shipping constraints are part of the workflow.",
      "Member assets may include AI-generated or AI-assisted material. Asset pages, manifests, or release notes should preserve provider, model, date, and license/provenance notes where available.",
      "Do not assume every AI-assisted asset is automatically safe for every commercial use. Check the license notes attached to a pack and the terms of the provider used to create it.",
    ],
  },
  {
    id: "privacy",
    title: "Privacy",
    body: [
      "We collect the account, billing, and access data needed to run the Studio Pass: sign-in identity, email, subscription state, Stripe customer references, and fulfillment status.",
      "Payment details are processed by Stripe. Ship Shit Games does not store raw card numbers.",
      "Newsletter or form submissions are used for the reason you submitted them: build logs, product updates, support, or member access. We do not sell personal contact data.",
    ],
  },
  {
    id: "open-core",
    title: "Open-source and member-only boundaries",
    body: [
      "Public repositories, docs, and packages keep their own licenses. Code marked MIT can be used under the MIT license.",
      "Member-only skills, private asset packs, premium templates, and signed downloads are subscriber content, not automatically open-source just because the studio works in public.",
      "Deadrot canon and shipped game assets live in the sibling Deadrot repo and asset package. Studio tooling lives here; shipped runtime assets are not redistributed from the Studio Pass unless a pack explicitly says so.",
    ],
  },
] as const;

export default function LegalPage() {
  return (
    <main>
      <section className="relative overflow-hidden border-b border-gunmetal/40 px-6 pb-16 pt-32">
        <Backdrop />
        <div className="relative z-10 mx-auto max-w-5xl">
          <Eyebrow>Legal and trust</Eyebrow>
          <div className="mt-5 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-glow max-w-4xl font-display text-5xl font-bold uppercase leading-[0.9] tracking-tight text-bone sm:text-7xl">
                Clear rules for the pass.
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ash">
                Working launch terms for the monthly Studio Pass, subscriber
                access, AI-assisted assets, privacy, and refund handling.
              </p>
            </div>
            <div className="rounded-md border border-gunmetal bg-coal p-5 text-sm text-ash">
              <div className="flex items-center gap-3 font-display text-xs font-bold uppercase tracking-widest text-hellfire">
                <ShieldCheck className="size-4" aria-hidden="true" />
                Last updated
              </div>
              <p className="mt-2 text-bone">{UPDATED}</p>
            </div>
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="xl" className="font-display uppercase tracking-widest shadow-ember">
              <Link href="/pricing">
                View pricing
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
            <Button
              asChild
              size="xl"
              variant="outline"
              className="border-gunmetal font-display uppercase tracking-widest text-bone hover:border-hellfire hover:text-hellfire"
            >
              <a href="https://app.shipshit.games/billing">Manage billing</a>
            </Button>
          </div>
        </div>
      </section>

      <section className="px-6 py-16">
        <div className="mx-auto grid max-w-5xl gap-5">
          {SECTIONS.map((section) => (
            <article
              key={section.id}
              id={section.id}
              className="scroll-mt-24 rounded-md border border-gunmetal bg-coal p-6"
            >
              <div className="flex items-center gap-3">
                <FileText className="size-5 text-hellfire" aria-hidden="true" />
                <h2 className="font-display text-2xl font-bold uppercase tracking-tight text-bone">
                  {section.title}
                </h2>
              </div>
              <div className="mt-5 space-y-4 text-sm leading-relaxed text-ash">
                {section.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
