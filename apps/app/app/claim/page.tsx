import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { CheckCircle2, CircleAlert } from "lucide-react";

import { readStudioPass } from "@/lib/entitlements";
import { createSkillsProAccessUrl, runFulfillment } from "@/lib/fulfillment";
import { getStripe } from "@/lib/stripe";
import { syncCheckoutSession } from "@/lib/stripe-sync";
import { appUrl } from "@/lib/urls";

export const dynamic = "force-dynamic";

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

  if (sessionId) {
    try {
      const stripe = getStripe();
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      const checkoutEmail =
        session.customer_details?.email ?? session.customer_email ?? null;

      if (checkoutEmail && email && checkoutEmail.toLowerCase() !== email.toLowerCase()) {
        error =
          "This checkout was completed with a different email. Sign in with the purchase email to claim it.";
      } else {
        const result = await syncCheckoutSession(stripe, session, false);
        if (result.skipped) {
          error = result.skipped;
        } else {
          message = "Studio Pass claimed. Your access is active.";
        }
      }
    } catch (claimError) {
      error =
        claimError instanceof Error
          ? claimError.message
          : "Could not claim this checkout session.";
    }
  }

  const refreshedUser = await currentUser();
  const pass = readStudioPass(refreshedUser?.privateMetadata);
  if (pass?.active && email) {
    accessUrl = createSkillsProAccessUrl(userId, email);
    if (!pass.skoolInviteSentAt || !pass.accessEmailSentAt) {
      await runFulfillment({
        userId,
        email,
        name: refreshedUser?.fullName,
        entitlement: pass,
        checkoutSessionId: pass.checkoutSessionId,
        stripeCustomerId: pass.stripeCustomerId,
        stripeSubscriptionId: pass.stripeSubscriptionId,
      });
    }
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
