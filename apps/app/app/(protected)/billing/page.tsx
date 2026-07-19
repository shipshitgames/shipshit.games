import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CreditCard } from "lucide-react";

import { StatusPill } from "@/components/status-pill";
import { readBillingEntitlements } from "@/lib/billing";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Billing",
  description:
    "Manage your Studio Pass subscription, update payment details, and view invoices through the Stripe Billing Portal.",
};

export default async function BillingPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const { studioPass: pass } = await readBillingEntitlements(userId);

  return (
    <main className="min-h-[calc(100vh-4rem)] px-6 py-12">
      <section className="mx-auto max-w-4xl">
        <CreditCard className="size-10 text-hellfire" aria-hidden="true" />
        <h1 className="mt-5 font-display text-5xl font-bold uppercase leading-none text-bone sm:text-7xl">
          Billing.
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-ash">
          Stripe Billing Portal handles card updates, invoices, cancellation,
          and subscription state. App access follows the webhook state.
        </p>

        <div className="mt-8 rounded-md border border-gunmetal bg-coal p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl font-bold uppercase text-bone">
                Studio Pass
              </h2>
              <p className="mt-2 text-sm text-ash">
                Customer: {pass?.stripeCustomerId ?? "not connected yet"}
              </p>
            </div>
            <StatusPill status={pass?.status} />
          </div>

          <form action="/api/billing/portal" method="post" className="mt-7">
            <button
              type="submit"
              disabled={!pass?.stripeCustomerId}
              className="rounded-md bg-blood px-6 py-3 font-display text-sm font-bold uppercase tracking-widest text-bone shadow-ember hover:bg-blood-hot disabled:pointer-events-none disabled:opacity-50"
            >
              Open Stripe portal
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
