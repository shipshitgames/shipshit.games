import { clerkClient } from "@clerk/nextjs/server";
import { SKILLS_PRO_ONETIME, STUDIO_PASS } from "@shipshitgames/shared";
import type Stripe from "stripe";

import {
  entitlementFromSubscription,
  findClerkUserByEmail,
  primaryEmail,
  readSkillsProOneTime,
  readStudioPass,
  updateSkillsProOneTimeEntitlement,
  updateStudioPassEntitlement,
} from "./entitlements";
import { runFulfillment, runSkillsProOneTimeFulfillment } from "./fulfillment";

type SyncInput = {
  subscription: Stripe.Subscription;
  checkoutSessionId?: string;
  clerkUserId?: string | null;
  email?: string | null;
  name?: string | null;
  runAccessFulfillment?: boolean;
};

async function resolveUserId(input: {
  clerkUserId?: string | null;
  email?: string | null;
}) {
  if (input.clerkUserId) return input.clerkUserId;
  if (!input.email) return null;

  const user = await findClerkUserByEmail(input.email);
  return user?.id ?? null;
}

async function syncSubscriptionToClerk(input: SyncInput) {
  const userId = await resolveUserId({
    clerkUserId: input.clerkUserId,
    email: input.email,
  });

  if (!userId) {
    return {
      userId: null,
      entitlement: null,
      fulfillment: null,
      skipped: "No Clerk user matched Stripe subscription.",
    };
  }

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const email = input.email ?? primaryEmail(user);
  const existing = readStudioPass(user.privateMetadata);
  const entitlement = await updateStudioPassEntitlement(
    userId,
    entitlementFromSubscription(input.subscription, {
      checkoutSessionId: input.checkoutSessionId,
      claimedAt: existing?.claimedAt ?? new Date().toISOString(),
    })
  );

  let fulfillment = null;
  if (input.runAccessFulfillment && email) {
    fulfillment = await runFulfillment({
      userId,
      email,
      name: input.name ?? user.fullName,
      entitlement,
      checkoutSessionId: input.checkoutSessionId,
      stripeCustomerId: entitlement.stripeCustomerId,
      stripeSubscriptionId: entitlement.stripeSubscriptionId,
    });

    if (fulfillment.skoolInviteSent || fulfillment.accessEmailSent || fulfillment.error) {
      await updateStudioPassEntitlement(userId, {
        skoolInviteSentAt: fulfillment.skoolInviteSent
          ? new Date().toISOString()
          : entitlement.skoolInviteSentAt,
        accessEmailSentAt: fulfillment.accessEmailSent
          ? new Date().toISOString()
          : entitlement.accessEmailSentAt,
        fulfillmentError: fulfillment.error,
      });
    }
  }

  return {
    userId,
    entitlement,
    fulfillment,
    skipped: null,
  };
}

export async function syncCheckoutSession(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
  runAccessFulfillment = true
) {
  if (session.mode !== "subscription") {
    return {
      userId: null,
      entitlement: null,
      fulfillment: null,
      skipped: "Checkout session is not a subscription.",
    };
  }

  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id;

  if (!subscriptionId) {
    throw new Error("Checkout session has no subscription.");
  }

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const email = session.customer_details?.email ?? session.customer_email ?? null;
  const name = session.customer_details?.name ?? null;
  const clerkUserId =
    session.client_reference_id ?? session.metadata?.clerkUserId ?? null;

  if (subscription.metadata.product !== STUDIO_PASS.productKey) {
    return {
      userId: null,
      entitlement: null,
      fulfillment: null,
      skipped: "Subscription does not belong to the Studio Pass product.",
    };
  }

  const result = await syncSubscriptionToClerk({
    subscription,
    checkoutSessionId: session.id,
    clerkUserId,
    email,
    name,
    runAccessFulfillment,
  });

  if (result.userId) {
    await stripe.subscriptions.update(subscription.id, {
      metadata: {
        ...subscription.metadata,
        clerkUserId: result.userId,
        product: STUDIO_PASS.productKey,
      },
    });

    const customerId =
      typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer.id;
    await stripe.customers.update(customerId, {
      metadata: {
        clerkUserId: result.userId,
        product: STUDIO_PASS.productKey,
      },
    });
  }

  return result;
}

/**
 * Grant permanent Skills Pro access for a completed one-time (mode=payment)
 * checkout. Idempotent: re-delivering the same event keeps the original
 * `purchasedAt` and only re-sends the access email if it never went out.
 */
export async function syncOneTimeCheckout(
  stripe: Stripe,
  session: Stripe.Checkout.Session
) {
  if (session.mode !== "payment") {
    return { userId: null, entitlement: null, fulfillment: null, skipped: "Checkout session is not a one-time payment." };
  }
  if (session.metadata?.product !== SKILLS_PRO_ONETIME.productKey) {
    return { userId: null, entitlement: null, fulfillment: null, skipped: "Payment is not the Skills Pro one-time product." };
  }
  if (session.payment_status !== "paid") {
    return { userId: null, entitlement: null, fulfillment: null, skipped: "Payment is not completed." };
  }

  const email = session.customer_details?.email ?? session.customer_email ?? null;
  const name = session.customer_details?.name ?? null;
  const clerkUserId = session.client_reference_id ?? session.metadata?.clerkUserId ?? null;
  const userId = await resolveUserId({ clerkUserId, email });

  if (!userId) {
    return { userId: null, entitlement: null, fulfillment: null, skipped: "No Clerk user matched Skills Pro purchase." };
  }

  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id;
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id;

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const already = readSkillsProOneTime(user.privateMetadata);

  const entitlement = await updateSkillsProOneTimeEntitlement(userId, {
    active: true,
    stripeCustomerId: customerId,
    stripePaymentIntentId: paymentIntentId,
    checkoutSessionId: session.id,
    purchasedAt: already?.purchasedAt,
  });

  let fulfillment = null;
  const resolvedEmail = email ?? primaryEmail(user);
  if (resolvedEmail && !entitlement.accessEmailSentAt) {
    fulfillment = await runSkillsProOneTimeFulfillment({
      userId,
      email: resolvedEmail,
      name: name ?? user.fullName,
      checkoutSessionId: session.id,
      stripeCustomerId: customerId,
    });

    if (fulfillment.accessEmailSent || fulfillment.error) {
      await updateSkillsProOneTimeEntitlement(userId, {
        accessEmailSentAt: fulfillment.accessEmailSent
          ? new Date().toISOString()
          : entitlement.accessEmailSentAt,
        fulfillmentError: fulfillment.error,
      });
    }
  }

  if (customerId) {
    await stripe.customers.update(customerId, {
      metadata: { clerkUserId: userId, product: SKILLS_PRO_ONETIME.productKey },
    });
  }

  return { userId, entitlement, fulfillment, skipped: null };
}

export async function syncSubscriptionEvent(
  stripe: Stripe,
  subscription: Stripe.Subscription
) {
  if (subscription.metadata.product !== STUDIO_PASS.productKey) {
    return {
      userId: null,
      entitlement: null,
      fulfillment: null,
      skipped: "Subscription does not belong to the Studio Pass product.",
    };
  }

  let email: string | null = null;
  let name: string | null = null;
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;
  const customer = await stripe.customers.retrieve(customerId);

  if (!("deleted" in customer)) {
    email = customer.email ?? null;
    name = customer.name ?? null;
  }

  return syncSubscriptionToClerk({
    subscription,
    clerkUserId: subscription.metadata.clerkUserId,
    email,
    name,
    runAccessFulfillment: false,
  });
}
