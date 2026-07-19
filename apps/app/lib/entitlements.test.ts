import { expect, test } from "bun:test";
import { SKILLS_PRO_ONETIME, STUDIO_PASS } from "@shipshitgames/shared";
import type { User } from "@clerk/nextjs/server";
import type Stripe from "stripe";

import {
  entitlementFromSubscription,
  primaryEmail,
  readSkillsProOneTime,
  readStudioPass,
} from "./entitlements";

// --- primaryEmail -----------------------------------------------------------

test("primaryEmail returns the primary address when present", () => {
  const user = {
    primaryEmailAddress: { emailAddress: "primary@example.com" },
    emailAddresses: [{ emailAddress: "secondary@example.com" }],
  } as unknown as User;
  expect(primaryEmail(user)).toBe("primary@example.com");
});

test("primaryEmail falls back to the first address when no primary is set", () => {
  const user = {
    primaryEmailAddress: null,
    emailAddresses: [{ emailAddress: "first@example.com" }],
  } as unknown as User;
  expect(primaryEmail(user)).toBe("first@example.com");
});

test("primaryEmail returns null when the user has no addresses", () => {
  const user = {
    primaryEmailAddress: null,
    emailAddresses: [],
  } as unknown as User;
  expect(primaryEmail(user)).toBeNull();
});

test("primaryEmail tolerates a null user", () => {
  expect(primaryEmail(null)).toBeNull();
  expect(primaryEmail(undefined)).toBeNull();
});

// --- readStudioPass ---------------------------------------------------------

test("readStudioPass returns null when there is no stored status", () => {
  expect(readStudioPass(null)).toBeNull();
  expect(readStudioPass({})).toBeNull();
  expect(readStudioPass({ studioPass: { active: true } })).toBeNull();
});

test("readStudioPass maps stored metadata and coerces active to a boolean", () => {
  const pass = readStudioPass({
    studioPass: {
      active: true,
      status: "active",
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
      updatedAt: "2026-07-01T00:00:00.000Z",
    },
  });
  expect(pass).not.toBeNull();
  expect(pass!.productKey).toBe(STUDIO_PASS.productKey);
  expect(pass!.active).toBe(true);
  expect(pass!.status).toBe("active");
  expect(pass!.stripeCustomerId).toBe("cus_1");
  expect(pass!.updatedAt).toBe("2026-07-01T00:00:00.000Z");
});

test("readStudioPass defaults updatedAt to the epoch when unset", () => {
  const pass = readStudioPass({ studioPass: { status: "canceled" } });
  expect(pass!.active).toBe(false);
  expect(pass!.updatedAt).toBe(new Date(0).toISOString());
});

// --- readSkillsProOneTime ---------------------------------------------------

test("readSkillsProOneTime returns null without a purchasedAt marker", () => {
  expect(readSkillsProOneTime(null)).toBeNull();
  expect(readSkillsProOneTime({ skillsProOneTime: { active: true } })).toBeNull();
});

test("readSkillsProOneTime defaults active to true and updatedAt to purchasedAt", () => {
  const entitlement = readSkillsProOneTime({
    skillsProOneTime: { purchasedAt: "2026-07-05T12:00:00.000Z" },
  });
  expect(entitlement).not.toBeNull();
  expect(entitlement!.productKey).toBe(SKILLS_PRO_ONETIME.productKey);
  expect(entitlement!.active).toBe(true);
  expect(entitlement!.source).toBe("one-time");
  expect(entitlement!.purchasedAt).toBe("2026-07-05T12:00:00.000Z");
  expect(entitlement!.updatedAt).toBe("2026-07-05T12:00:00.000Z");
});

test("readSkillsProOneTime preserves an explicit inactive flag (refund/chargeback)", () => {
  const entitlement = readSkillsProOneTime({
    skillsProOneTime: { purchasedAt: "2026-07-05T12:00:00.000Z", active: false },
  });
  expect(entitlement!.active).toBe(false);
});

// --- entitlementFromSubscription --------------------------------------------

function fakeSubscription(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub_abc",
    status: "active",
    customer: "cus_abc",
    items: { data: [{ price: { id: "price_abc" } }] },
    current_period_end: 1_760_000_000,
    metadata: {},
    ...overrides,
  } as unknown as Stripe.Subscription;
}

test("entitlementFromSubscription derives active state and stripe ids", () => {
  const result = entitlementFromSubscription(fakeSubscription());
  expect(result.active).toBe(true);
  expect(result.status).toBe("active");
  expect(result.stripeCustomerId).toBe("cus_abc");
  expect(result.stripeSubscriptionId).toBe("sub_abc");
  expect(result.stripePriceId).toBe("price_abc");
  expect(result.currentPeriodEnd).toBe(new Date(1_760_000_000 * 1000).toISOString());
});

test("entitlementFromSubscription marks non-active statuses inactive", () => {
  const result = entitlementFromSubscription(fakeSubscription({ status: "canceled" }));
  expect(result.active).toBe(false);
  expect(result.status).toBe("canceled");
});

test("entitlementFromSubscription reads the id from an expanded customer object", () => {
  const result = entitlementFromSubscription(
    fakeSubscription({ customer: { id: "cus_expanded" } })
  );
  expect(result.stripeCustomerId).toBe("cus_expanded");
});

test("entitlementFromSubscription leaves currentPeriodEnd undefined when absent", () => {
  const result = entitlementFromSubscription(
    fakeSubscription({ current_period_end: undefined })
  );
  expect(result.currentPeriodEnd).toBeUndefined();
});

test("entitlementFromSubscription merges caller-supplied extra fields", () => {
  const result = entitlementFromSubscription(fakeSubscription(), {
    checkoutSessionId: "cs_1",
    claimedAt: "2026-07-01T00:00:00.000Z",
  });
  expect(result.checkoutSessionId).toBe("cs_1");
  expect(result.claimedAt).toBe("2026-07-01T00:00:00.000Z");
});
