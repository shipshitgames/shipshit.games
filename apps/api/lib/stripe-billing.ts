import {
  isActiveSubscriptionStatus,
  isEnabled,
  SKILLS_PRO_ONETIME,
  STUDIO_PASS,
  type BillingVersion,
  type SkillsProOneTimeEntitlement,
  type StudioPassEntitlement,
} from "@shipshitgames/shared";
import type Stripe from "stripe";

import type {
  BillingFulfillment,
  BillingFulfillmentInput,
} from "./billing-fulfillment";
import type { BillingRepository } from "./billing-repository";

export interface StripeBillingClient {
  customers: {
    retrieve(id: string): Promise<Stripe.Customer | Stripe.DeletedCustomer>;
    update(
      id: string,
      params: Stripe.CustomerUpdateParams,
    ): Promise<Stripe.Customer>;
  };
  subscriptions: {
    retrieve(id: string): Promise<Stripe.Subscription>;
    update(
      id: string,
      params: Stripe.SubscriptionUpdateParams,
    ): Promise<Stripe.Subscription>;
  };
}

type CustomerDetails = {
  id: string;
  email: string | null;
  name: string | null;
  clerkUserId: string | null;
  metadata: Stripe.Metadata;
};

function eventVersion(event: Stripe.Event): BillingVersion {
  const ranks: Partial<Record<Stripe.Event["type"], number>> = {
    "checkout.session.completed": 10,
    "customer.subscription.created": 20,
    "invoice.paid": 30,
    "customer.subscription.updated": 40,
    "customer.subscription.deleted": 50,
    "charge.refunded": 50,
  };
  return {
    stripeEventCreatedAt: event.created,
    stripeEventRank: ranks[event.type] ?? 0,
    stripeEventId: event.id,
  };
}

function eventTime(event: Stripe.Event) {
  return new Date(event.created * 1000).toISOString();
}

function idOf(
  value:
    | string
    | { id: string }
    | null
    | undefined,
) {
  return typeof value === "string" ? value : value?.id;
}

async function readCustomer(
  stripe: StripeBillingClient,
  customer: string | Stripe.Customer | Stripe.DeletedCustomer,
): Promise<CustomerDetails> {
  const value =
    typeof customer === "string"
      ? await stripe.customers.retrieve(customer)
      : customer;
  if ("deleted" in value) {
    return {
      id: value.id,
      email: null,
      name: null,
      clerkUserId: null,
      metadata: {},
    };
  }
  return {
    id: value.id,
    email: value.email ?? null,
    name: value.name ?? null,
    clerkUserId: value.metadata.clerkUserId || null,
    metadata: value.metadata,
  };
}

async function resolveUserId(
  repository: BillingRepository,
  input: {
    clerkUserId?: string | null;
    email?: string | null;
  },
) {
  if (input.clerkUserId) return input.clerkUserId;
  if (!input.email) return null;
  return repository.findUserIdByEmail(input.email);
}

function currentPeriodEnd(subscription: Stripe.Subscription) {
  const timestamp = (
    subscription as Stripe.Subscription & { current_period_end?: number }
  ).current_period_end;
  return timestamp ? new Date(timestamp * 1000).toISOString() : undefined;
}

async function recordStudioFulfillment(
  repository: BillingRepository,
  fulfillment: BillingFulfillment,
  entitlement: StudioPassEntitlement & { userId: string },
  customer: CustomerDetails,
  event: Stripe.Event,
) {
  if (!entitlement.active || !customer.email) return;
  if (
    entitlement.accessEmailSentAt &&
    (entitlement.skoolInviteSentAt || !isEnabled("skoolFulfillment"))
  ) {
    return;
  }

  const input: BillingFulfillmentInput = {
    eventId: event.id,
    userId: entitlement.userId,
    email: customer.email,
    name: customer.name,
    checkoutSessionId: entitlement.checkoutSessionId,
    stripeCustomerId: entitlement.stripeCustomerId,
    stripeSubscriptionId: entitlement.stripeSubscriptionId,
  };

  try {
    const result = await fulfillment.fulfillStudioPass(input);
    const now = new Date().toISOString();
    await repository.recordStudioFulfillment(entitlement.userId, {
      skoolInviteSentAt: result.skoolInviteSent
        ? entitlement.skoolInviteSentAt ?? now
        : entitlement.skoolInviteSentAt,
      accessEmailSentAt: result.accessEmailSent
        ? entitlement.accessEmailSentAt ?? now
        : entitlement.accessEmailSentAt,
      fulfillmentError: null,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Studio Pass fulfillment failed";
    await repository.recordStudioFulfillment(entitlement.userId, {
      fulfillmentError: message,
    });
    throw error;
  }
}

async function applySubscription(
  stripe: StripeBillingClient,
  repository: BillingRepository,
  fulfillment: BillingFulfillment,
  event: Stripe.Event,
  subscription: Stripe.Subscription,
  checkout?: Stripe.Checkout.Session,
) {
  const product =
    subscription.metadata.product ?? checkout?.metadata?.product ?? null;
  if (product !== STUDIO_PASS.productKey) {
    return { handled: false, reason: "not-studio-pass" } as const;
  }

  const customer = await readCustomer(stripe, subscription.customer);
  const userId = await resolveUserId(repository, {
    clerkUserId:
      subscription.metadata.clerkUserId ??
      checkout?.client_reference_id ??
      checkout?.metadata?.clerkUserId ??
      customer.clerkUserId,
    email:
      checkout?.customer_details?.email ??
      checkout?.customer_email ??
      customer.email,
  });
  if (!userId) throw new Error("No user matched the Stripe subscription");

  const timestamp = eventTime(event);
  const result = await repository.applyStudioPass(userId, {
    productKey: "studio-pass",
    active: isActiveSubscriptionStatus(subscription.status),
    status: subscription.status,
    stripeCustomerId: customer.id,
    stripeSubscriptionId: subscription.id,
    stripePriceId: subscription.items.data.at(0)?.price.id,
    currentPeriodEnd: currentPeriodEnd(subscription),
    checkoutSessionId: checkout?.id,
    claimedAt: timestamp,
    ...eventVersion(event),
    updatedAt: timestamp,
  });

  const metadataWrites: Promise<unknown>[] = [];
  if (
    event.type !== "customer.subscription.deleted" &&
    (subscription.metadata.product !== STUDIO_PASS.productKey ||
      subscription.metadata.clerkUserId !== userId)
  ) {
    metadataWrites.push(
      stripe.subscriptions.update(subscription.id, {
        metadata: {
          ...subscription.metadata,
          product: STUDIO_PASS.productKey,
          clerkUserId: userId,
        },
      }),
    );
  }
  if (customer.clerkUserId !== userId) {
    metadataWrites.push(
      stripe.customers.update(customer.id, {
        metadata: {
          ...customer.metadata,
          clerkUserId: userId,
        },
      }),
    );
  }
  await Promise.all(metadataWrites);

  await recordStudioFulfillment(
    repository,
    fulfillment,
    { ...result.entitlement, userId },
    {
      ...customer,
      email:
        checkout?.customer_details?.email ??
        checkout?.customer_email ??
        customer.email,
      name: checkout?.customer_details?.name ?? customer.name,
    },
    event,
  );
  return { handled: true, applied: result.applied } as const;
}

async function applyOneTimeCheckout(
  stripe: StripeBillingClient,
  repository: BillingRepository,
  fulfillment: BillingFulfillment,
  event: Stripe.Event,
  session: Stripe.Checkout.Session,
) {
  if (
    session.mode !== "payment" ||
    session.metadata?.product !== SKILLS_PRO_ONETIME.productKey
  ) {
    return { handled: false, reason: "not-skills-pro" } as const;
  }
  if (session.payment_status !== "paid") {
    return { handled: false, reason: "skills-pro-not-paid" } as const;
  }

  const customerId = idOf(session.customer);
  const customer = customerId
    ? await readCustomer(stripe, customerId)
    : {
        id: "",
        email: session.customer_details?.email ?? session.customer_email,
        name: session.customer_details?.name ?? null,
        clerkUserId: null,
        metadata: {},
      };
  const email =
    session.customer_details?.email ??
    session.customer_email ??
    customer.email;
  const userId = await resolveUserId(repository, {
    clerkUserId:
      session.client_reference_id ??
      session.metadata?.clerkUserId ??
      customer.clerkUserId,
    email,
  });
  if (!userId) throw new Error("No user matched the Skills Pro checkout");

  const timestamp = eventTime(event);
  const result = await repository.applySkillsPro(userId, {
    productKey: "games-skills-pro",
    active: true,
    source: "one-time",
    stripeCustomerId: customerId,
    stripePaymentIntentId: idOf(session.payment_intent),
    checkoutSessionId: session.id,
    purchasedAt: timestamp,
    ...eventVersion(event),
    updatedAt: timestamp,
  });

  if (customerId && customer.clerkUserId !== userId) {
    await stripe.customers.update(customerId, {
      metadata: {
        ...customer.metadata,
        clerkUserId: userId,
      },
    });
  }

  if (email && !result.entitlement.accessEmailSentAt) {
    try {
      const sent = await fulfillment.fulfillSkillsPro({
        eventId: event.id,
        userId,
        email,
        name: session.customer_details?.name ?? customer.name,
        checkoutSessionId: session.id,
        stripeCustomerId: customerId,
      });
      if (sent.accessEmailSent) {
        await repository.recordSkillsProFulfillment(userId, {
          accessEmailSentAt: new Date().toISOString(),
          fulfillmentError: null,
        });
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Skills Pro fulfillment failed";
      await repository.recordSkillsProFulfillment(userId, {
        fulfillmentError: message,
      });
      throw error;
    }
  }
  return { handled: true, applied: result.applied } as const;
}

async function applyRefund(
  repository: BillingRepository,
  event: Stripe.Event,
  charge: Stripe.Charge,
) {
  if (!charge.refunded) {
    return { handled: false, reason: "partial-refund" } as const;
  }
  const paymentIntentId = idOf(charge.payment_intent);
  if (!paymentIntentId) {
    return { handled: false, reason: "missing-payment-intent" } as const;
  }
  const existing =
    await repository.findSkillsProByPaymentIntent(paymentIntentId);
  if (!existing) {
    return { handled: false, reason: "unknown-purchase" } as const;
  }

  const result = await repository.applySkillsPro(existing.userId, {
    ...existing,
    active: false,
    ...eventVersion(event),
    updatedAt: eventTime(event),
  });
  return { handled: true, applied: result.applied } as const;
}

function invoiceSubscriptionId(invoice: Stripe.Invoice) {
  const value = invoice as Stripe.Invoice & {
    subscription?: string | Stripe.Subscription | null;
    parent?: {
      subscription_details?: {
        subscription?: string | Stripe.Subscription | null;
      } | null;
    } | null;
  };
  return idOf(
    value.subscription ?? value.parent?.subscription_details?.subscription,
  );
}

export async function processStripeBillingEvent(
  stripe: StripeBillingClient,
  repository: BillingRepository,
  fulfillment: BillingFulfillment,
  event: Stripe.Event,
) {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode === "payment") {
        return applyOneTimeCheckout(
          stripe,
          repository,
          fulfillment,
          event,
          session,
        );
      }
      if (session.mode !== "subscription") {
        return {
          handled: false,
          reason: "unsupported-checkout-mode",
        } as const;
      }
      const subscriptionId = idOf(session.subscription);
      if (!subscriptionId) {
        return {
          handled: false,
          reason: "checkout-without-subscription",
        } as const;
      }
      const subscription =
        await stripe.subscriptions.retrieve(subscriptionId);
      return applySubscription(
        stripe,
        repository,
        fulfillment,
        event,
        subscription,
        session,
      );
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      return applySubscription(
        stripe,
        repository,
        fulfillment,
        event,
        event.data.object as Stripe.Subscription,
      );
    case "invoice.paid": {
      const subscriptionId = invoiceSubscriptionId(
        event.data.object as Stripe.Invoice,
      );
      if (!subscriptionId) {
        return { handled: false, reason: "invoice-without-subscription" } as const;
      }
      const subscription =
        await stripe.subscriptions.retrieve(subscriptionId);
      return applySubscription(
        stripe,
        repository,
        fulfillment,
        event,
        subscription,
      );
    }
    case "charge.refunded":
      return applyRefund(
        repository,
        event,
        event.data.object as Stripe.Charge,
      );
    default:
      return { handled: false, reason: "unsupported-event" } as const;
  }
}
