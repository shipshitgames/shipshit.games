import { auth, currentUser } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { KeyRound, Lock, Users } from "lucide-react";

import { StatusPill } from "@/components/status-pill";
import { readBillingEntitlements } from "@/lib/billing";
import { createSkillsProAccessUrl } from "@/lib/fulfillment";
import { hasSkillsProContentAccess, primaryEmail } from "@/lib/entitlements";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Signed access",
  description:
    "Claim your Studio Pass deliverables: signed Skills Pro access, member community, and the asset library.",
};

export default async function AccessPage() {
  const [{ userId }, user, entitlements] = await Promise.all([
    auth(),
    currentUser(),
    readBillingEntitlements(),
  ]);
  const email = primaryEmail(user);
  const pass = entitlements.studioPass;
  const active = hasSkillsProContentAccess(entitlements);
  const skillsUrl = active && userId && email ? createSkillsProAccessUrl(userId, email) : null;

  return (
    <main className="min-h-[calc(100vh-4rem)] px-6 py-12">
      <section className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-display text-xs font-bold uppercase tracking-[0.35em] text-hellfire">
              Signed access
            </p>
            <h1 className="mt-4 font-display text-5xl font-bold uppercase leading-none text-bone sm:text-7xl">
              Claim the pack.
            </h1>
          </div>
          <StatusPill status={pass?.status} />
        </div>

        <div className="mt-10 grid gap-5 md:grid-cols-2">
          <div className="rounded-md border border-gunmetal bg-coal p-6">
            <KeyRound className="size-6 text-hellfire" aria-hidden="true" />
            <h2 className="mt-4 font-display text-2xl font-bold uppercase text-bone">
              Skills Pro
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-ash">
              The public never sees the raw destination. The app generates a
              short-lived signed URL, validates your Clerk user and active
              subscription, then redirects to the private Skills Pro location.
            </p>
            {skillsUrl ? (
              <a
                href={skillsUrl}
                className="mt-6 inline-flex rounded-md bg-blood px-6 py-3 font-display text-sm font-bold uppercase tracking-widest text-bone shadow-ember hover:bg-blood-hot"
              >
                Open signed Skills Pro link
              </a>
            ) : (
              <div className="mt-6 flex items-center gap-3 rounded-md border border-gunmetal bg-iron p-4 text-sm text-ash">
                <Lock className="size-4 text-blood-hot" aria-hidden="true" />
                Start or claim a Studio Pass subscription to unlock this link.
              </div>
            )}
          </div>

          <div className="rounded-md border border-gunmetal bg-coal p-6">
            <Users className="size-6 text-hellfire" aria-hidden="true" />
            <h2 className="mt-4 font-display text-2xl font-bold uppercase text-bone">
              Member community
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-ash">
              Community access is included with the Studio Pass when the private
              member space opens. Until then, Skills Pro and member assets are
              the active subscriber deliverables.
            </p>
            <form action="/api/fulfillment/skool" method="post" className="mt-6">
              <button
                type="button"
                disabled
                className="rounded-md border border-gunmetal px-6 py-3 font-display text-sm font-bold uppercase tracking-widest text-bone hover:border-hellfire hover:text-hellfire disabled:pointer-events-none disabled:opacity-50"
              >
                Opens soon
              </button>
            </form>
          </div>
        </div>

        <div id="assets" className="mt-5 rounded-md border border-gunmetal bg-iron p-6">
          <h2 className="font-display text-2xl font-bold uppercase text-bone">
            Member asset library
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-ash">
            The asset library should use this same entitlement gate. First
            pass is the signed Skills Pro link and community fulfillment; the
            asset pack download routes can plug into the same token helper.
          </p>
        </div>
      </section>
    </main>
  );
}
