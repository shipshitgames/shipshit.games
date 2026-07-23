import { expect, test } from "bun:test";
import type {
  BillingEntitlements,
  StudioPassEntitlement,
} from "@shipshitgames/shared";

import type { ApiAccessEventInput } from "./api-access-audit";
import { requireStudioPass } from "./studio-access";

const request = new Request(
  "https://api.shipshit.games/v1/assets/generate",
  { method: "POST" },
);
const auth = { userId: "user-1" };

function pass(
  status: string,
  active = true,
): StudioPassEntitlement {
  return {
    productKey: "studio-pass",
    active,
    status,
    stripeCustomerId: "cus_1",
    stripeSubscriptionId: "sub_1",
    stripeEventCreatedAt: 1,
    stripeEventRank: 10,
    stripeEventId: "evt_1",
    updatedAt: "2026-07-23T00:00:00.000Z",
  };
}

async function decide(entitlements: BillingEntitlements) {
  const events: ApiAccessEventInput[] = [];
  const result = await requireStudioPass(auth, request, {
    billing: {
      readEntitlements: async () => entitlements,
    },
    audit: async (event) => {
      events.push(event);
    },
  });
  return { result, events };
}

test("active and trialing subscriptions pass the hosted generation boundary", async () => {
  for (const status of ["active", "trialing"]) {
    const { result, events } = await decide({
      studioPass: pass(status),
      skillsProOneTime: null,
      accountExists: true,
    });

    expect(result).toBeNull();
    expect(events).toEqual([
      {
        boundary: "studio-pass",
        outcome: "granted",
        reason: "active-subscription",
        route: "POST /v1/assets/generate",
        userId: "user-1",
      },
    ]);
  }
});

test("an explicit internal grant passes without a Stripe subscription", async () => {
  const { result, events } = await decide({
    studioPass: null,
    skillsProOneTime: null,
    studioPassInternalGrant: true,
    accountExists: true,
  });

  expect(result).toBeNull();
  expect(events[0]).toMatchObject({
    outcome: "granted",
    reason: "internal-grant",
  });
});

test("canceled, inactive, missing entitlement, and missing account states fail closed", async () => {
  const cases: Array<{
    entitlements: BillingEntitlements;
    reason: string;
  }> = [
    {
      entitlements: {
        studioPass: pass("canceled", false),
        skillsProOneTime: null,
      },
      reason: "canceled",
    },
    {
      entitlements: {
        studioPass: pass("past_due", false),
        skillsProOneTime: null,
      },
      reason: "inactive",
    },
    {
      entitlements: {
        studioPass: null,
        skillsProOneTime: null,
        accountExists: true,
      },
      reason: "no-entitlement",
    },
    {
      entitlements: {
        studioPass: null,
        skillsProOneTime: null,
        accountExists: false,
      },
      reason: "missing-account",
    },
  ];

  for (const entry of cases) {
    const { result, events } = await decide(entry.entitlements);
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(403);
    expect(events[0]).toMatchObject({
      boundary: "studio-pass",
      outcome: "denied",
      reason: entry.reason,
    });
  }
});

test("entitlement store failures return 503 and remain distinct in the audit trail", async () => {
  const events: ApiAccessEventInput[] = [];
  const result = await requireStudioPass(auth, request, {
    billing: {
      readEntitlements: async () => {
        throw new Error("database unavailable");
      },
    },
    audit: async (event) => {
      events.push(event);
    },
  });

  expect(result).toBeInstanceOf(Response);
  expect((result as Response).status).toBe(503);
  expect(events).toEqual([
    {
      boundary: "studio-pass",
      outcome: "unavailable",
      reason: "entitlement-store-error",
      route: "POST /v1/assets/generate",
      userId: "user-1",
    },
  ]);
});

test("audit storage failure never grants denied access or blocks granted access", async () => {
  const denied = await requireStudioPass(auth, request, {
    billing: {
      readEntitlements: async () => ({
        studioPass: null,
        skillsProOneTime: null,
      }),
    },
    audit: async () => {
      throw new Error("audit unavailable");
    },
  });
  expect(denied).toBeInstanceOf(Response);
  expect((denied as Response).status).toBe(403);

  const granted = await requireStudioPass(auth, request, {
    billing: {
      readEntitlements: async () => ({
        studioPass: pass("active"),
        skillsProOneTime: null,
      }),
    },
    audit: async () => {
      throw new Error("audit unavailable");
    },
  });
  expect(granted).toBeNull();
});
