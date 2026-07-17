import { expect, test } from "bun:test";
import {
  compareBillingVersions,
  type BillingEntitlements,
  type SkillsProOneTimeEntitlement,
  type StudioPassEntitlement,
} from "@shipshitgames/shared";
import type Stripe from "stripe";

import type { BillingFulfillment } from "./billing-fulfillment";
import type {
  BillingRepository,
  SkillsProPurchaseRecord,
} from "./billing-repository";
import {
  processStripeBillingEvent,
  type StripeBillingClient,
} from "./stripe-billing";

function event(
  id: string,
  created: number,
  type: Stripe.Event["type"],
  object: unknown,
) {
  return {
    id,
    created,
    type,
    data: { object },
  } as Stripe.Event;
}

function subscription(
  status: Stripe.Subscription.Status,
  currentPeriodEnd: number,
) {
  return {
    id: "sub_1",
    customer: "cus_1",
    status,
    metadata: { product: "studio-pass", clerkUserId: "user_1" },
    items: { data: [{ price: { id: "price_1" } }] },
    current_period_end: currentPeriodEnd,
  } as unknown as Stripe.Subscription;
}

class MemoryBillingRepository implements BillingRepository {
  studioPass = new Map<string, StudioPassEntitlement>();
  skillsPro = new Map<string, SkillsProPurchaseRecord>();

  async findUserIdByEmail(email: string) {
    return email === "member@example.com" ? "user_1" : null;
  }

  async readEntitlements(userId: string): Promise<BillingEntitlements> {
    return {
      studioPass: this.studioPass.get(userId) ?? null,
      skillsProOneTime: this.skillsPro.get(userId) ?? null,
    };
  }

  async findSkillsProByPaymentIntent(paymentIntentId: string) {
    return (
      [...this.skillsPro.values()].find(
        (value) => value.stripePaymentIntentId === paymentIntentId,
      ) ?? null
    );
  }

  async applyStudioPass(userId: string, entitlement: StudioPassEntitlement) {
    const existing = this.studioPass.get(userId);
    if (existing && compareBillingVersions(existing, entitlement) >= 0) {
      return { applied: false, entitlement: existing };
    }
    const next = {
      ...entitlement,
      skoolInviteSentAt: existing?.skoolInviteSentAt,
      accessEmailSentAt: existing?.accessEmailSentAt,
    };
    this.studioPass.set(userId, next);
    return { applied: true, entitlement: next };
  }

  async applySkillsPro(
    userId: string,
    entitlement: SkillsProOneTimeEntitlement,
  ) {
    const existing = this.skillsPro.get(userId);
    if (existing && compareBillingVersions(existing, entitlement) >= 0) {
      return { applied: false, entitlement: existing };
    }
    const next = {
      ...entitlement,
      userId,
      purchasedAt: existing?.purchasedAt ?? entitlement.purchasedAt,
      accessEmailSentAt: existing?.accessEmailSentAt,
    };
    this.skillsPro.set(userId, next);
    return { applied: true, entitlement: next };
  }

  async recordStudioFulfillment(
    userId: string,
    result: {
      skoolInviteSentAt?: string;
      accessEmailSentAt?: string;
      fulfillmentError?: string | null;
    },
  ) {
    const existing = this.studioPass.get(userId)!;
    const next = {
      ...existing,
      ...result,
      fulfillmentError: result.fulfillmentError ?? undefined,
    };
    this.studioPass.set(userId, next);
    return next;
  }

  async recordSkillsProFulfillment(
    userId: string,
    result: {
      accessEmailSentAt?: string;
      fulfillmentError?: string | null;
    },
  ) {
    const existing = this.skillsPro.get(userId)!;
    const next = {
      ...existing,
      ...result,
      fulfillmentError: result.fulfillmentError ?? undefined,
    };
    this.skillsPro.set(userId, next);
    return next;
  }
}

function harness(
  studioFulfillmentResult = {
    skoolInviteSent: true,
    accessEmailSent: true,
  },
) {
  const repository = new MemoryBillingRepository();
  const subscriptions = new Map<string, Stripe.Subscription>();
  const customers = new Map<string, Stripe.Customer>([
    [
      "cus_1",
      {
        id: "cus_1",
        email: "member@example.com",
        name: "Member",
        metadata: { clerkUserId: "user_1" },
      } as Stripe.Customer,
    ],
  ]);
  const stripe: StripeBillingClient = {
    subscriptions: {
      async retrieve(id) {
        return subscriptions.get(id)!;
      },
      async update(id, params) {
        const current = subscriptions.get(id)!;
        const next = {
          ...current,
          metadata: params.metadata ?? current.metadata,
        } as Stripe.Subscription;
        subscriptions.set(id, next);
        return next;
      },
    },
    customers: {
      async retrieve(id) {
        return customers.get(id)!;
      },
      async update(id, params) {
        const current = customers.get(id)!;
        const next = {
          ...current,
          metadata: params.metadata ?? current.metadata,
        } as Stripe.Customer;
        customers.set(id, next);
        return next;
      },
    },
  };
  let studioFulfillments = 0;
  let skillsFulfillments = 0;
  const fulfillment: BillingFulfillment = {
    async fulfillStudioPass() {
      studioFulfillments += 1;
      return studioFulfillmentResult;
    },
    async fulfillSkillsPro() {
      skillsFulfillments += 1;
      return { accessEmailSent: true };
    },
  };
  return {
    repository,
    subscriptions,
    stripe,
    fulfillment,
    studioFulfillments: () => studioFulfillments,
    skillsFulfillments: () => skillsFulfillments,
  };
}

test("does not resend Studio Pass access when Skool fulfillment is disabled", async () => {
  const previousFlag = process.env.SKOOL_FULFILLMENT_ENABLED;
  delete process.env.SKOOL_FULFILLMENT_ENABLED;

  try {
    const h = harness({
      skoolInviteSent: false,
      accessEmailSent: true,
    });
    const activeSubscription = subscription("active", 200);
    h.subscriptions.set(activeSubscription.id, activeSubscription);

    await processStripeBillingEvent(
      h.stripe,
      h.repository,
      h.fulfillment,
      event(
        "evt_create",
        100,
        "customer.subscription.created",
        activeSubscription,
      ),
    );
    await processStripeBillingEvent(
      h.stripe,
      h.repository,
      h.fulfillment,
      event("evt_renew", 200, "invoice.paid", {
        parent: {
          subscription_details: {
            subscription: activeSubscription.id,
          },
        },
      }),
    );

    expect(h.studioFulfillments()).toBe(1);
    expect(
      h.repository.studioPass.get("user_1")?.accessEmailSentAt,
    ).toBeDefined();
    expect(
      h.repository.studioPass.get("user_1")?.skoolInviteSentAt,
    ).toBeUndefined();
  } finally {
    if (previousFlag === undefined) {
      delete process.env.SKOOL_FULFILLMENT_ENABLED;
    } else {
      process.env.SKOOL_FULFILLMENT_ENABLED = previousFlag;
    }
  }
});

test("subscription create, renewal, cancellation, duplicate, and reordering converge", async () => {
  const h = harness();
  const created = subscription("active", 200);
  h.subscriptions.set(created.id, created);

  const checkout = {
    id: "cs_1",
    mode: "subscription",
    subscription: created.id,
    client_reference_id: "user_1",
    metadata: { product: "studio-pass", clerkUserId: "user_1" },
    customer_details: {
      email: "member@example.com",
      name: "Member",
    },
  } as unknown as Stripe.Checkout.Session;
  const createEvent = event(
    "evt_create",
    100,
    "checkout.session.completed",
    checkout,
  );

  await processStripeBillingEvent(
    h.stripe,
    h.repository,
    h.fulfillment,
    createEvent,
  );
  await processStripeBillingEvent(
    h.stripe,
    h.repository,
    h.fulfillment,
    createEvent,
  );
  expect(h.repository.studioPass.get("user_1")?.status).toBe("active");
  expect(h.studioFulfillments()).toBe(1);

  const renewed = subscription("active", 400);
  h.subscriptions.set(renewed.id, renewed);
  await processStripeBillingEvent(
    h.stripe,
    h.repository,
    h.fulfillment,
    event("evt_renew", 200, "invoice.paid", {
      parent: { subscription_details: { subscription: renewed.id } },
    }),
  );
  expect(
    h.repository.studioPass.get("user_1")?.currentPeriodEnd,
  ).toBe(new Date(400_000).toISOString());

  const canceled = subscription("canceled", 400);
  await processStripeBillingEvent(
    h.stripe,
    h.repository,
    h.fulfillment,
    event(
      "evt_cancel",
      300,
      "customer.subscription.deleted",
      canceled,
    ),
  );
  expect(h.repository.studioPass.get("user_1")?.active).toBe(false);

  const staleActive = subscription("active", 500);
  await processStripeBillingEvent(
    h.stripe,
    h.repository,
    h.fulfillment,
    event(
      "evt_stale",
      300,
      "customer.subscription.updated",
      staleActive,
    ),
  );
  expect(h.repository.studioPass.get("user_1")?.status).toBe("canceled");
  expect(
    h.repository.studioPass.get("user_1")?.stripeEventId,
  ).toBe("evt_cancel");
});

test("a fully refunded one-time purchase revokes access and ignores stale replay", async () => {
  const h = harness();
  const checkout = {
    id: "cs_payment",
    mode: "payment",
    payment_status: "paid",
    payment_intent: "pi_1",
    customer: "cus_1",
    client_reference_id: "user_1",
    metadata: { product: "games-skills-pro" },
    customer_details: {
      email: "member@example.com",
      name: "Member",
    },
  } as unknown as Stripe.Checkout.Session;
  const purchase = event(
    "evt_purchase",
    100,
    "checkout.session.completed",
    checkout,
  );

  await processStripeBillingEvent(
    h.stripe,
    h.repository,
    h.fulfillment,
    purchase,
  );
  expect(h.repository.skillsPro.get("user_1")?.active).toBe(true);
  expect(h.skillsFulfillments()).toBe(1);

  await processStripeBillingEvent(
    h.stripe,
    h.repository,
    h.fulfillment,
    event("evt_refund", 200, "charge.refunded", {
      refunded: true,
      payment_intent: "pi_1",
    }),
  );
  expect(h.repository.skillsPro.get("user_1")?.active).toBe(false);

  await processStripeBillingEvent(
    h.stripe,
    h.repository,
    h.fulfillment,
    purchase,
  );
  expect(h.repository.skillsPro.get("user_1")?.active).toBe(false);
  expect(h.skillsFulfillments()).toBe(1);
});
