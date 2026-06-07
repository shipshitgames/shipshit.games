import Link from "next/link";
import { SignInButton } from "@clerk/nextjs";
import { ArrowRight, ShieldCheck, Sparkles } from "lucide-react";
import { formatUsd, STUDIO_PASS } from "@shipshitgames/shared";

export default function HomePage() {
  return (
    <main className="min-h-[calc(100vh-4rem)] px-6 py-20">
      <section className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-center">
        <div>
          <p className="font-display text-xs font-bold uppercase tracking-[0.35em] text-hellfire">
            Studio Pass Portal
          </p>
          <h1 className="text-glow mt-5 max-w-4xl font-display text-5xl font-bold uppercase leading-[0.92] text-bone sm:text-7xl">
            Account, access, and assets in one place.
          </h1>
          <p className="mt-7 max-w-2xl text-lg leading-relaxed text-ash">
            app.shipshit.games manages the monthly Studio Pass: Skills Pro,
            signed access links, member assets, and billing. Skool setup is
            tracked as P3 deferred.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-md bg-blood px-6 py-3 font-display text-sm font-bold uppercase tracking-widest text-bone shadow-ember hover:bg-blood-hot"
            >
              Open dashboard
              <ArrowRight aria-hidden="true" />
            </Link>
            <SignInButton mode="modal">
              <button className="rounded-md border border-gunmetal px-6 py-3 font-display text-sm font-bold uppercase tracking-widest text-bone hover:border-hellfire hover:text-hellfire">
                Sign in
              </button>
            </SignInButton>
            <a
              href="https://shipshit.games/pricing"
              className="rounded-md border border-gunmetal px-6 py-3 font-display text-sm font-bold uppercase tracking-widest text-bone hover:border-hellfire hover:text-hellfire"
            >
              Get the pass
            </a>
          </div>
        </div>
        <aside className="rounded-md border border-hellfire/50 bg-coal p-7 shadow-ember">
          <Sparkles className="size-8 text-hellfire" aria-hidden="true" />
          <h2 className="mt-5 font-display text-3xl font-bold uppercase tracking-tight text-bone">
            {STUDIO_PASS.name}
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-ash">
            {formatUsd(STUDIO_PASS.listPriceUsd)} list,{" "}
            {formatUsd(STUDIO_PASS.founderPriceUsd)}/mo founder seat.
          </p>
          <div className="mt-6 space-y-3 text-sm text-ash">
            <p className="flex gap-3">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-hellfire" aria-hidden="true" />
              Clerk signs users in, Stripe signs billing state, the app signs access links.
            </p>
            <p className="flex gap-3">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-hellfire" aria-hidden="true" />
              Email fulfillment is triggered from the entitlement event; Skool automation is P3 deferred.
            </p>
          </div>
        </aside>
      </section>
    </main>
  );
}
