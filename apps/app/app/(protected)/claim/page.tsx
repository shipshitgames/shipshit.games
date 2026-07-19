import { auth, currentUser } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CheckCircle2, CircleAlert } from "lucide-react";

import {
  hasSkillsProContentAccess,
} from "@/lib/entitlements";
import { readBillingEntitlements } from "@/lib/billing";
import { createSkillsProAccessUrl } from "@/lib/fulfillment";
import { getStripe } from "@/lib/stripe";
import { appUrl } from "@/lib/urls";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Claim access",
  description: "Claim your Studio Pass access after checkout.",
};

type ClaimPageProps = {
  searchParams?: Promise<{
    session_id?: string;
  }>;
};

export default async function ClaimPage({ searchParams }: ClaimPageProps) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const params = await searchParams;
  const sessionId = params?.session_id;
  const user = await currentUser();
  const email =
    user?.primaryEmailAddress?.emailAddress ??
    user?.emailAddresses.at(0)?.emailAddress ??
    null;

  let message = "Your account is ready.";
  let accessUrl: string | null = null;
  let error: string | null = null;
  let checkoutMode: "payment" | "subscription" | "setup" | null = null;

  if (sessionId) {
    try {
      const stripe = getStripe();
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      checkoutMode = session.mode;
      const checkoutEmail =
        session.customer_details?.email ?? session.customer_email ?? null;

      if (checkoutEmail && email && checkoutEmail.toLowerCase() !== email.toLowerCase()) {
        error =
          "This checkout was completed with a different email. Sign in with the purchase email to claim it.";
      }
    } catch (claimError) {
      error =
        claimError instanceof Error
          ? claimError.message
          : "Could not claim this checkout session.";
    }
  }

  const entitlements = await readBillingEntitlements(userId);
  if (hasSkillsProContentAccess(entitlements) && email) {
    accessUrl = createSkillsProAccessUrl(userId, email);
    message =
      checkoutMode === "payment"
        ? "Skills Pro claimed. It's yours forever."
        : "Studio Pass claimed. Your access is active.";
  } else if (sessionId && !error) {
    message =
      "Payment received. Stripe fulfillment is still processing; refresh this page in a moment.";
  }

  return (
    <main className="min-h-[calc(100vh-4rem)] px-6 py-16">
      <section className="mx-auto max-w-3xl">
        {error ? (
          <CircleAlert className="size-12 text-blood-hot" aria-hidden="true" />
        ) : (
          <CheckCircle2 className="size-12 text-hellfire" aria-hidden="true" />
        )}
        <h1 className="text-glow mt-5 font-display text-5xl font-bold uppercase leading-none text-bone sm:text-7xl">
          {error ? "Claim needs attention." : "Access claimed."}
        </h1>
        <p className="mt-6 text-lg leading-relaxed text-ash">
          {error ?? message}
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          {accessUrl ? (
            <a
              href={accessUrl}
              className="rounded-md bg-blood px-6 py-3 font-display text-sm font-bold uppercase tracking-widest text-bone shadow-ember hover:bg-blood-hot"
            >
              Open Skills Pro
            </a>
          ) : null}
          <a
            href={`${appUrl()}/dashboard`}
            className="rounded-md border border-gunmetal px-6 py-3 font-display text-sm font-bold uppercase tracking-widest text-bone hover:border-hellfire hover:text-hellfire"
          >
            Dashboard
          </a>
        </div>
      </section>
    </main>
  );
}
