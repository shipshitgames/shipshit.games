import { CreditCard, KeyRound, PackageOpen } from "lucide-react";
import { formatUsd, STUDIO_PASS } from "@shipshitgames/shared";

import { ActionCard } from "@/components/action-card";
import { StatusPill } from "@/components/status-pill";
import { readBillingEntitlements } from "@/lib/billing";

export const dynamic = "force-dynamic";

const renewsDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export default async function DashboardPage() {
  const { studioPass: pass } = await readBillingEntitlements();

  return (
    <main className="min-h-[calc(100vh-4rem)] px-6 py-12">
      <section className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-display text-xs font-bold uppercase tracking-[0.35em] text-hellfire">
              Member dashboard
            </p>
            <h1 className="mt-4 font-display text-5xl font-bold uppercase leading-none text-bone sm:text-7xl">
              Studio access.
            </h1>
          </div>
          <StatusPill status={pass?.status} />
        </div>

        <div className="mt-10 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-md border border-gunmetal bg-coal p-6">
            <h2 className="font-display text-2xl font-bold uppercase tracking-tight text-bone">
              {STUDIO_PASS.name}
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-ash">
              This account is the control plane for Skills Pro, member-only
              assets, and billing. Stripe webhooks update this entitlement
              automatically. Member community access is included when the
              private community opens.
            </p>
            <dl className="mt-6 grid gap-4 sm:grid-cols-3">
              <div>
                <dt className="text-xs uppercase tracking-widest text-gunmetal">Price</dt>
                <dd className="mt-1 text-bone">
                  {formatUsd(STUDIO_PASS.founderPriceUsd)}/mo founder seat
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-widest text-gunmetal">Renews</dt>
                <dd className="mt-1 text-bone">
                  {pass?.currentPeriodEnd
                    ? renewsDateFormatter.format(new Date(pass.currentPeriodEnd))
                    : "Not active"}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-widest text-gunmetal">Access</dt>
                <dd className="mt-1 text-bone">{pass?.active ? "Unlocked" : "Locked"}</dd>
              </div>
            </dl>
            {!pass?.active ? (
              <form action="/api/checkout" method="post" className="mt-7">
                <button
                  type="submit"
                  className="rounded-md bg-blood px-6 py-3 font-display text-sm font-bold uppercase tracking-widest text-bone shadow-ember hover:bg-blood-hot"
                >
                  Start Studio Pass
                </button>
              </form>
            ) : null}
          </div>

          <aside className="rounded-md border border-gunmetal bg-iron p-6">
            <h2 className="font-display text-xl font-bold uppercase text-bone">
              Fulfillment
            </h2>
            <ul className="mt-4 space-y-3 text-sm leading-relaxed text-ash">
              <li>Community invite: sent separately when the member community opens</li>
              <li>Access email: {pass?.accessEmailSentAt ? "sent" : "pending/configured sender"}</li>
              <li>Signed Skills link: generated on demand</li>
            </ul>
          </aside>
        </div>

        <div className="mt-5 grid gap-5 md:grid-cols-3">
          <ActionCard
            href="/access"
            icon={KeyRound}
            title="Access"
            body="Generate a short-lived signed Skills Pro link and review member access status."
            cta="Open access"
          />
          <ActionCard
            href="/billing"
            icon={CreditCard}
            title="Billing"
            body="Open Stripe Billing Portal to manage cards, invoices, and cancellation."
            cta="Manage billing"
          />
          <ActionCard
            href="/access#assets"
            icon={PackageOpen}
            title="Assets"
            body="Member asset packs belong behind this same Studio Pass entitlement."
            cta="View assets"
          />
        </div>
      </section>
    </main>
  );
}
