import { expect, test } from "bun:test";

import {
  compareBillingVersions,
  hasActiveStudioPass,
  hasSkillsProContentAccess,
  type BillingEntitlements,
  type StudioPassEntitlement,
} from "./billing";

const activePass: StudioPassEntitlement = {
  productKey: "studio-pass",
  active: true,
  status: "active",
  stripeCustomerId: "cus_1",
  stripeSubscriptionId: "sub_1",
  stripeEventCreatedAt: 100,
  stripeEventRank: 20,
  stripeEventId: "evt_1",
  updatedAt: "2026-07-17T00:00:00.000Z",
};

test("billing versions sort by Stripe timestamp and then event id", () => {
  expect(
    compareBillingVersions(
      { stripeEventCreatedAt: 100, stripeEventRank: 20, stripeEventId: "evt_1" },
      { stripeEventCreatedAt: 101, stripeEventRank: 10, stripeEventId: "evt_0" },
    ),
  ).toBeLessThan(0);
  expect(
    compareBillingVersions(
      { stripeEventCreatedAt: 100, stripeEventRank: 20, stripeEventId: "evt_2" },
      { stripeEventCreatedAt: 100, stripeEventRank: 20, stripeEventId: "evt_1" },
    ),
  ).toBeGreaterThan(0);
});

test("Studio Pass access requires both an active flag and active Stripe status", () => {
  expect(hasActiveStudioPass(activePass)).toBe(true);
  expect(hasActiveStudioPass({ ...activePass, active: false })).toBe(false);
  expect(hasActiveStudioPass({ ...activePass, status: "canceled" })).toBe(false);
});

test("Skills Pro access accepts either the subscription or one-time entitlement", () => {
  const subscription: BillingEntitlements = {
    studioPass: activePass,
    skillsProOneTime: null,
  };
  const oneTime: BillingEntitlements = {
    studioPass: null,
    skillsProOneTime: {
      productKey: "games-skills-pro",
      active: true,
      source: "one-time",
      purchasedAt: "2026-07-17T00:00:00.000Z",
      updatedAt: "2026-07-17T00:00:00.000Z",
      stripeEventCreatedAt: 100,
      stripeEventRank: 20,
      stripeEventId: "evt_1",
    },
  };

  expect(hasSkillsProContentAccess(subscription)).toBe(true);
  expect(hasSkillsProContentAccess(oneTime)).toBe(true);
  expect(
    hasSkillsProContentAccess({
      studioPass: null,
      skillsProOneTime: { ...oneTime.skillsProOneTime!, active: false },
    }),
  ).toBe(false);
});
