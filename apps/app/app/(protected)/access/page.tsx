import { auth, currentUser } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { KeyRound, Lock, PackageOpen, Users } from "lucide-react";
import { studioPassAccessState } from "@shipshitgames/shared";

import { StatusPill } from "@/components/status-pill";
import { readBillingEntitlements } from "@/lib/billing";
import {
  createMemberAssetPackAccessUrl,
  createSkillsProAccessUrl,
} from "@/lib/fulfillment";
import {
  hasActiveStudioPass,
  hasSkillsProContentAccess,
  primaryEmail,
} from "@/lib/entitlements";
import { publishedMemberAssetPacks } from "@/lib/member-assets";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Signed access",
  description:
    "Claim your Studio Pass deliverables: signed Skills Pro access, member community, and the asset library.",
};

export default async function AccessPage() {
  const [{ userId }, user] = await Promise.all([
    auth(),
    currentUser(),
  ]);
  if (!userId) redirect("/sign-in");
  const entitlements = await readBillingEntitlements(userId);
  const email = primaryEmail(user);
  const pass = entitlements.studioPass;
  const skillsActive = hasSkillsProContentAccess(entitlements);
  const subscriberActive = hasActiveStudioPass(pass);
  const accessState = studioPassAccessState(pass);
  const packs = publishedMemberAssetPacks();
  const skillsUrl =
    skillsActive && email ? createSkillsProAccessUrl(userId, email) : null;

  const stateCopy = {
    active:
      "Your monthly Studio Pass is active. Subscriber downloads are unlocked.",
    canceled:
      "Your Studio Pass is canceled. Skills Pro remains available only if you bought it separately; subscriber downloads are locked.",
    inactive:
      "Your Studio Pass is inactive. Update billing or restart the subscription to unlock subscriber downloads.",
    "not-claimed":
      "No Studio Pass is attached to this account yet. Start or claim a subscription to unlock member drops.",
  }[accessState];

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

        <p className="mt-5 rounded-md border border-gunmetal bg-iron p-4 text-sm leading-relaxed text-ash">
          {stateCopy}
        </p>

        <div className="mt-10 grid gap-5 md:grid-cols-2">
          <div className="rounded-md border border-gunmetal bg-coal p-6">
            <KeyRound className="size-6 text-hellfire" aria-hidden="true" />
            <h2 className="mt-4 font-display text-2xl font-bold uppercase text-bone">
              Skills Pro
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-ash">
              The public never sees the raw destination. The app generates a
              short-lived signed URL, validates your Clerk user and current
              entitlement, then redirects to the private Skills Pro location.
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

        <div
          id="assets"
          className="mt-5 rounded-md border border-gunmetal bg-iron p-6"
        >
          <div className="flex items-start gap-4">
            <PackageOpen
              className="mt-1 size-6 shrink-0 text-hellfire"
              aria-hidden="true"
            />
            <div>
              <h2 className="font-display text-2xl font-bold uppercase text-bone">
                Member asset library
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-ash">
                Published member drops use short-lived links and re-check your
                monthly Studio Pass before redirecting to the private file.
              </p>
            </div>
          </div>

          {packs.length === 0 ? (
            <p className="mt-6 rounded-md border border-gunmetal bg-coal p-4 text-sm text-ash">
              No member asset packs have been published yet. New drops will
              appear here without changing the entitlement flow.
            </p>
          ) : (
            <ul className="mt-6 grid gap-4 md:grid-cols-2">
              {packs.map((pack) => {
                const accessUrl =
                  subscriberActive && email
                    ? createMemberAssetPackAccessUrl(userId, email, pack.id)
                    : null;
                return (
                  <li
                    key={pack.id}
                    className="rounded-md border border-gunmetal bg-coal p-5"
                  >
                    <h3 className="font-display text-lg font-bold uppercase text-bone">
                      {pack.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-ash">
                      {pack.description}
                    </p>
                    <p className="mt-3 text-xs uppercase tracking-widest text-gunmetal">
                      Published{" "}
                      {new Date(pack.publishedAt).toLocaleDateString("en-US")}
                    </p>
                    {accessUrl ? (
                      <a
                        href={accessUrl}
                        className="mt-5 inline-flex rounded-md bg-blood px-5 py-2.5 font-display text-xs font-bold uppercase tracking-widest text-bone shadow-ember hover:bg-blood-hot"
                      >
                        Download pack
                      </a>
                    ) : (
                      <div className="mt-5 flex items-center gap-2 text-sm text-ash">
                        <Lock
                          className="size-4 text-blood-hot"
                          aria-hidden="true"
                        />
                        Active monthly Studio Pass required.
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}
