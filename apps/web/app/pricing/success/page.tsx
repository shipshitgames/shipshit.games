import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";

import { Backdrop } from "@/components/site/atmosphere";
import { Eyebrow } from "@/components/site/eyebrow";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Skills Pro Purchased",
  description: "Your Ship Shit Games Skills Pro checkout completed.",
};

export default function PricingSuccessPage() {
  return (
    <main>
      <section className="relative flex min-h-screen items-center overflow-hidden px-6 py-28">
        <Backdrop />
        <div className="relative z-10 mx-auto max-w-3xl">
          <Eyebrow>Checkout complete</Eyebrow>
          <CheckCircle2 className="mt-6 size-12 text-hellfire" aria-hidden="true" />
          <h1 className="text-glow mt-5 font-display text-5xl font-bold uppercase leading-[0.95] tracking-tight text-bone sm:text-7xl">
            Skills Pro is yours.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ash">
            Stripe recorded the payment. Check the purchase email for access
            details and keep an eye on the channel as we fold new game-building
            workflows into the pack.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Button asChild size="xl" className="font-display uppercase tracking-widest shadow-ember">
              <Link href="/youtube">
                Watch the latest build
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
            <Button
              asChild
              size="xl"
              variant="outline"
              className="border-gunmetal font-display uppercase tracking-widest text-bone hover:border-hellfire hover:text-hellfire"
            >
              <Link href="/">Back home</Link>
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}
