import { clerkClient } from "@clerk/nextjs/server";
import { STUDIO_PASS } from "@shipshitgames/shared";
import type Stripe from "stripe";

import {
  entitlementFromSubscription,
  findClerkUserByEmail,
  primaryEmail,
  readStudioPass,
  updateStudioPassEntitlement,
} from "./entitlements";
import { runFulfillment } from "./fulfillment";

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
